#!/usr/bin/env node
// Daily sync of official Indian government exam notifications for /exams.
//
// Run by .github/workflows/exam-notifications.yml (daily) and
// exam-source-discovery.yml (weekly, --discover). Plain Node + neon() like the
// reminder/archive scripts; the orchestration lives in src/lib/server/examSync.js
// and the SQL in src/lib/shared/examNotificationSql.js.
//
// Usage:
//   npm run exams:sync                              # all enabled sources
//   npm run exams:sync -- --source=ssc --dry-run    # one source, no writes
//   npm run exams:sync -- --discover                # weekly source discovery
//   npm run exams:sync -- --source=ssc --page-file=page.html --extraction-file=out.json --dry-run
//   npm run exams:sync -- --dry-run --dump-extraction=/tmp/extracted   # raw model output per source
//
// Env: DATABASE_URL (required unless --dry-run), GEMINI_API_KEY (required
// unless --extraction-file), EXAM_SYNC_MODEL (default gemini-flash-lite-latest;
// gemini-flash-latest needs the pacing below), EXAM_SYNC_FALLBACK_MODEL
// (default gemini-flash-lite-latest; set empty to fail instead of falling
// back), EXAM_SYNC_MODEL_INTERVAL_MS (default 15000 — keeps calls under the
// 5 RPM tier limit), EXAM_SYNC_MAX_MODEL_CALLS (default 16 — daily-call
// budget guard).

import { readFileSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { GoogleGenAI } from '@google/genai';
import { neon } from '@neondatabase/serverless';
import { z } from 'zod';
import {
	enabledExamSources,
	EXAM_SOURCES,
	getExamSource,
	insecureFetchHosts
} from '../src/lib/data/examSources.js';
import { htmlToText } from '../src/lib/server/htmlText.js';
import {
	buildDiscoveryPrompt,
	buildExtractionPrompt,
	runExamSync,
	runSourceDiscovery,
	withRetries
} from '../src/lib/server/examSync.js';
import { parseJsonResponse } from '../src/lib/server/jsonResponse.js';
import { todayInIst } from '../src/lib/shared/examNotificationStatus.js';
import {
	examNotificationExtractionSchema
} from '../src/lib/shared/examNotificationSchema.js';
import {
	EXAM_NOTIFICATION_SCHEMA_STATEMENTS,
	INSERT_QUARANTINE_SQL,
	INSERT_SYNC_RUN_SQL,
	LOOKUP_SOURCE_NOTIFICATIONS_SQL,
	MARK_SOURCE_SUGGESTIONS_ADDED_SQL,
	READ_PENDING_SOURCE_SUGGESTIONS_SQL,
	UPSERT_EXAM_NOTIFICATION_SQL,
	UPSERT_SOURCE_SUGGESTION_SQL
} from '../src/lib/shared/examNotificationSql.js';

const FETCH_TIMEOUT_MS = 20000;
const LINK_CHECK_TIMEOUT_MS = 12000;
const POLITE_DELAY_MS = 1200;
const MAX_PAGE_CHARS = 60000;
const DEFAULT_MODEL = 'gemini-flash-lite-latest';
// gemini-flash-latest allows 5 requests/minute and 20/day on this key's tier.
// Every model call is paced and hard-stopped at the per-run budget so a bad
// day of retries can never eat the quota a full sync needs (7 sources, plus
// one weekly discovery call). When the primary model is capacity-blocked
// (503/UNAVAILABLE), the fallback keeps the run useful; set
// EXAM_SYNC_FALLBACK_MODEL='' to disable it and take hard failures instead.
const FALLBACK_MODEL =
	process.env.EXAM_SYNC_FALLBACK_MODEL === undefined
		? 'gemini-flash-lite-latest'
		: process.env.EXAM_SYNC_FALLBACK_MODEL;
const MODEL_MIN_INTERVAL_MS = Math.max(0, Number(process.env.EXAM_SYNC_MODEL_INTERVAL_MS) || 15000);
const MODEL_CALL_BUDGET = Math.max(1, Number(process.env.EXAM_SYNC_MAX_MODEL_CALLS) || 16);

let modelCallsMade = 0;
let fallbackCallsMade = 0;
let primaryFailureCount = 0;
let lastModelCallAt = 0;

// Once the primary model fails twice in a run (capacity or quota), stop
// spending daily calls on it: the rest of the run goes straight to the
// fallback. On a healthy day all sources use the primary as configured.
const PRIMARY_FAILURE_BREAKER = 2;

async function pacedModelCall(operation) {
	modelCallsMade += 1;
	if (modelCallsMade > MODEL_CALL_BUDGET) {
		throw new Error(`model call budget exhausted (${MODEL_CALL_BUDGET} per run)`);
	}
	const waitMs = lastModelCallAt + MODEL_MIN_INTERVAL_MS - Date.now();
	if (waitMs > 0) {
		await delay(waitMs);
	}
	lastModelCallAt = Date.now();
	return operation();
}

// Rate limits need a full minute window; capacity spikes just need backoff.
function modelRetrySleep({ delayMs, error }) {
	const message = String(error?.message || '');
	return delay(/\b429\b/.test(message) ? 65000 : delayMs);
}

function isModelUnavailable(error) {
	return /\b(429|503)\b|UNAVAILABLE|high demand|quota/i.test(String(error?.message || ''));
}

async function generateWithRetries(modelId, contents, config) {
	return withRetries(
		() => pacedModelCall(() => ai.models.generateContent({ model: modelId, contents, config })),
		{ attempts: 2, baseDelayMs: 20000, sleep: modelRetrySleep }
	);
}

/** Primary model first; an unavailable or quota-exhausted primary falls back once. */
async function generateModelContent(contents, config) {
	const useFallbackOnly =
		FALLBACK_MODEL &&
		FALLBACK_MODEL !== model &&
		primaryFailureCount >= PRIMARY_FAILURE_BREAKER;
	if (!useFallbackOnly) {
		try {
			return await generateWithRetries(model, contents, config);
		} catch (error) {
			if (!FALLBACK_MODEL || FALLBACK_MODEL === model || !isModelUnavailable(error)) {
				throw error;
			}
			primaryFailureCount += 2;
			console.log(
				`${model} unavailable (${String(error?.message || '').slice(0, 80)}); using ${FALLBACK_MODEL}`
			);
		}
	}
	fallbackCallsMade += 1;
	return generateWithRetries(FALLBACK_MODEL, contents, config);
}

// Identifies the tracker while staying compatible with government WAFs that
// reject non-browser agents outright (see the source registry notes).
const REQUEST_HEADERS = {
	'User-Agent':
		'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) selftest-lite-exam-tracker/0.1 Chrome/126.0 Safari/537.36',
	Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
	'Accept-Language': 'en-IN,en;q=0.9'
};

function parseArgs(argv) {
	const options = {
		sources: [],
		dryRun: false,
		discover: false,
		pageFile: null,
		extractionFile: null,
		dumpExtraction: null
	};
	for (const arg of argv) {
		if (arg === '--dry-run') {
			options.dryRun = true;
		} else if (arg === '--discover') {
			options.discover = true;
		} else if (arg.startsWith('--source=')) {
			options.sources.push(...arg.slice('--source='.length).split(','));
		} else if (arg.startsWith('--page-file=')) {
			options.pageFile = arg.slice('--page-file='.length);
		} else if (arg.startsWith('--extraction-file=')) {
			options.extractionFile = arg.slice('--extraction-file='.length);
		} else if (arg.startsWith('--dump-extraction=')) {
			options.dumpExtraction = arg.slice('--dump-extraction='.length);
		} else {
			console.error(`Unknown argument: ${arg}`);
			process.exit(2);
		}
	}
	return options;
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, { method = 'GET', timeoutMs, range = false }) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const headers =
			method === 'GET' && range ? { ...REQUEST_HEADERS, Range: 'bytes=0-0' } : REQUEST_HEADERS;
		return await fetch(url, {
			method,
			redirect: 'follow',
			headers,
			signal: controller.signal
		});
	} catch (error) {
		throw new Error(
			`${method} ${url} failed: ${error?.cause?.code || error?.message || 'unknown'}`,
			{ cause: error }
		);
	} finally {
		clearTimeout(timer);
	}
}

// curl escape hatch for servers whose TLS chain Node refuses (see the source
// registry). `insecure` is only used for sources flagged curl-insecure, never
// process-wide.
function curl(url, extraArgs = [], timeoutSeconds = 25) {
	return new Promise((resolve, reject) => {
		execFile(
			'curl',
			[
				'-sS',
				'--max-time',
				String(timeoutSeconds),
				'-A',
				REQUEST_HEADERS['User-Agent'],
				...extraArgs,
				url
			],
			{ encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
			(error, stdout, stderr) => {
				if (error) {
					reject(new Error(`curl ${url}: ${(stderr || error.message).trim()}`));
					return;
				}
				resolve(stdout);
			}
		);
	});
}

const insecureHosts = insecureFetchHosts();

function hostMatches(host, allowed) {
	return host === allowed || host.endsWith(`.${allowed}`);
}

function isInsecureHost(url) {
	try {
		const host = new URL(url).hostname.toLowerCase();
		return insecureHosts.some((allowed) => hostMatches(host, allowed));
	} catch {
		return false;
	}
}

async function checkLink(url) {
	if (isInsecureHost(url)) {
		try {
			const status = Number(
				await curl(url, ['-k', '-L', '-o', '/dev/null', '-w', '%{http_code}', '-r', '0-0'], 15)
			);
			return status >= 200 && status < 400;
		} catch {
			return false;
		}
	}
	try {
		const head = await fetchWithTimeout(url, { method: 'HEAD', timeoutMs: LINK_CHECK_TIMEOUT_MS });
		if (head.status >= 200 && head.status < 400) {
			return true;
		}
	} catch {
		// HEAD failed or was rejected; fall through to GET.
	}
	try {
		// GET without a Range header: legacy .aspx handlers answer 404 to HEAD
		// and 416 to Range but serve the document to a plain GET. The body is
		// cancelled immediately — only the status matters here.
		const get = await fetchWithTimeout(url, { method: 'GET', timeoutMs: LINK_CHECK_TIMEOUT_MS });
		const reachable = get.status >= 200 && get.status < 400;
		await get.body?.cancel().catch(() => {});
		return reachable;
	} catch {
		return false;
	}
}

// Government servers drop connections; one retry turns a flaky morning into a
// successful run without hammering anything.
async function fetchListingBody(source, url) {
	let lastError = null;
	for (let attempt = 1; attempt <= 2; attempt += 1) {
		try {
			if (source.transport === 'curl-insecure' || source.transport === 'curl') {
				const args = ['-L', '--connect-timeout', '30'];
				if (source.transport === 'curl-insecure') {
					args.unshift('-k');
				}
				return { body: await curl(url, args, 45), finalUrl: url, contentType: '' };
			}
			const response = await fetchWithTimeout(url, { timeoutMs: FETCH_TIMEOUT_MS });
			if (!response.ok) {
				throw new Error(`fetch ${url} -> HTTP ${response.status}`);
			}
			return {
				body: await response.text(),
				finalUrl: response.url || url,
				contentType: response.headers.get('content-type') || ''
			};
		} catch (error) {
			lastError = error;
			if (attempt < 2) {
				await delay(POLITE_DELAY_MS);
			}
		}
	}
	throw lastError;
}

function itemParams(item) {
	return [
		item.dedupeKey,
		item.sourceId,
		item.org,
		item.title,
		item.category,
		item.state,
		item.examId,
		item.notificationUrl,
		item.applyUrl,
		item.publishedAt,
		item.applyStart,
		item.applyEnd,
		item.examDate,
		item.vacancies,
		item.qualification,
		item.confidence
	];
}

function createNeonStore(sql) {
	return {
		async lookupSource(sourceId) {
			const rows = await sql.query(LOOKUP_SOURCE_NOTIFICATIONS_SQL, [sourceId]);
			return {
				keys: rows.map((row) => row.dedupe_key),
				publishedKeys: rows
					.filter((row) => row.review_status === 'published')
					.map((row) => row.dedupe_key),
				titles: rows.filter((row) => row.review_status === 'published').map((row) => row.title)
			};
		},
		async upsertNotification(item) {
			const rows = await sql.query(UPSERT_EXAM_NOTIFICATION_SQL, itemParams(item));
			return { inserted: rows[0]?.inserted === true };
		},
		async quarantineNotification({ item, reason }) {
			await sql.query(INSERT_QUARANTINE_SQL, [
				...itemParams(item),
				reason,
				JSON.stringify(item)
			]);
		},
		async saveSuggestion(suggestion) {
			await sql.query(UPSERT_SOURCE_SUGGESTION_SQL, [
				suggestion.url,
				suggestion.org,
				suggestion.category,
				suggestion.reason
			]);
		},
		async readPendingSuggestions() {
			return sql.query(READ_PENDING_SOURCE_SUGGESTIONS_SQL);
		},
		async markSuggestionsAdded(ids) {
			await sql.query(MARK_SOURCE_SUGGESTIONS_ADDED_SQL, [ids]);
		}
	};
}

function createDryRunStore() {
	return {
		async lookupSource() {
			return { keys: [], publishedKeys: [], titles: [] };
		},
		async upsertNotification() {
			return { inserted: true };
		},
		async quarantineNotification() {},
		async saveSuggestion() {},
		async readPendingSuggestions() {
			return [];
		},
		async markSuggestionsAdded() {}
	};
}

function appendStepSummary(report) {
	const summaryPath = process.env.GITHUB_STEP_SUMMARY;
	if (!summaryPath) {
		return;
	}
	const lines = [
		`## Exam notifications sync — ${report.status}`,
		'',
		`Sources: ${report.totals.sourcesOk}/${report.totals.sourcesTotal} ok · ` +
			`new ${report.totals.itemsNew} · updated ${report.totals.itemsUpdated} · ` +
			`quarantined ${report.totals.itemsQuarantined} · dropped ${report.totals.itemsDropped}`,
		'',
		'| Source | Status | New | Updated | Quarantined | Dropped | Note |',
		'| --- | --- | --- | --- | --- | --- | --- |'
	];
	for (const source of report.sources) {
		lines.push(
			`| ${source.id} | ${source.status} | ${source.published} | ${source.updated} | ` +
				`${source.quarantined} | ${source.dropped} | ${source.error ?? source.dateProblems.join(', ') ?? ''} |`
		);
	}
	const quarantined = report.sources.flatMap((source) => source.quarantinedItems ?? []);
	if (quarantined.length > 0) {
		lines.push('', '### Quarantined for review', '');
		for (const entry of quarantined.slice(0, 20)) {
			lines.push(`- [${entry.reason}] ${entry.title}`);
		}
	}
	lines.push('');
	appendFileSync(summaryPath, `${lines.join('\n')}\n`);
}

const options = parseArgs(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL;
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.EXAM_SYNC_MODEL || DEFAULT_MODEL;
const todayIso = todayInIst();

// Same quiet-skip contract as the reminder sender: an unconfigured feature
// must not leave a failed workflow sitting in the Actions tab every day.
if (!databaseUrl && !options.dryRun) {
	console.log('DATABASE_URL is not configured; skipping exam notification sync.');
	process.exit(0);
}
if (!apiKey && !options.extractionFile) {
	console.log('GEMINI_API_KEY is not configured; skipping exam notification sync.');
	process.exit(0);
}
if ((options.pageFile || options.extractionFile) && options.sources.length !== 1) {
	console.error('--page-file/--extraction-file require exactly one --source=<id>.');
	process.exit(2);
}

let sources = enabledExamSources();
if (options.sources.length > 0) {
	const selected = options.sources.map((id) => getExamSource(id));
	const unknown = options.sources.filter((id, index) => !selected[index]);
	if (unknown.length > 0) {
		console.error(`Unknown source id(s): ${unknown.join(', ')}. Known: ${EXAM_SOURCES.map((s) => s.id).join(', ')}`);
		process.exit(2);
	}
	sources = selected;
}

const sql = databaseUrl ? neon(databaseUrl) : null;
const store = options.dryRun || !sql ? createDryRunStore() : createNeonStore(sql);
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

let extractionFixture = null;
if (options.extractionFile) {
	const raw = JSON.parse(readFileSync(options.extractionFile, 'utf8'));
	extractionFixture = Array.isArray(raw) ? raw : raw?.items;
	if (!Array.isArray(extractionFixture)) {
		console.error('Extraction file must be [{...}] or { "items": [{...}] }.');
		process.exit(2);
	}
}

let pageFixture = null;
if (options.pageFile) {
	pageFixture = readFileSync(options.pageFile, 'utf8');
}

async function fetchSourceText(source) {
	if (pageFixture !== null) {
		return /json/i.test(pageFixture.trimStart().slice(0, 2)) ? pageFixture : htmlToText(pageFixture).text;
	}
	const chunks = [];
	for (const url of source.listingUrls) {
		const { body, finalUrl, contentType } = await fetchListingBody(source, url);
		const looksJson =
			/json/i.test(contentType) || ['{', '['].includes(body.trimStart().slice(0, 1));
		if (looksJson) {
			chunks.push(body.slice(0, MAX_PAGE_CHARS));
		} else {
			chunks.push(htmlToText(body, { baseUrl: finalUrl }).text);
		}
		await delay(POLITE_DELAY_MS);
	}
	return chunks.join('\n\n---\n\n').slice(0, MAX_PAGE_CHARS);
}

async function extractItems(source, pageText) {
	const items = await extractSourceItems(source, pageText);
	if (options.dumpExtraction) {
		mkdirSync(options.dumpExtraction, { recursive: true });
		writeFileSync(
			join(options.dumpExtraction, `${source.id}.json`),
			JSON.stringify({ source: source.id, pageTextLength: pageText.length, items }, null, 2)
		);
	}
	return items;
}

async function extractSourceItems(source, pageText) {
	if (extractionFixture) {
		return extractionFixture;
	}
	const response = await generateModelContent(buildExtractionPrompt({ source, pageText, todayIso }), {
		responseMimeType: 'application/json',
		responseJsonSchema: z.toJSONSchema(examNotificationExtractionSchema),
		temperature: 0.1
	});
	const parsed = parseJsonResponse(response.text);
	const validated = examNotificationExtractionSchema.safeParse(parsed);
	if (validated.success) {
		return validated.data.items;
	}
	if (Array.isArray(parsed?.items)) {
		// Keep salvageable items; the normalizer drops whatever is useless.
		return parsed.items;
	}
	throw new Error(`extraction schema mismatch: ${validated.error.message.slice(0, 300)}`);
}

async function suggestSources(knownHosts) {
	const response = await generateModelContent(buildDiscoveryPrompt({ knownHosts, todayIso }), {
		tools: [{ googleSearch: {} }]
	});
	let suggestions = [];
	try {
		const parsed = parseJsonResponse(response.text);
		if (Array.isArray(parsed?.suggestions)) {
			suggestions = parsed.suggestions;
		}
	} catch {
		// Grounding chunks below are the fallback when the model returns prose.
	}
	if (suggestions.length === 0) {
		const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
		suggestions = chunks
			.map((chunk) => ({
				org: chunk?.web?.title ?? null,
				url: chunk?.web?.uri ?? null,
				category: null,
				reason: 'grounded search result'
			}))
			.filter((suggestion) => suggestion.url);
	}
	return suggestions;
}

async function main() {
	if (options.discover) {
		const knownHosts = EXAM_SOURCES.flatMap((source) => source.allowedHosts);
		const report = await runSourceDiscovery({
			suggest: () => suggestSources(knownHosts),
			checkLink,
			store,
			knownHosts
		});
		console.log(
			JSON.stringify(
				{
					mode: 'discovery',
					model,
					modelCalls: modelCallsMade,
					fallbackCalls: fallbackCallsMade,
					startedAt: todayIso,
					...report
				},
				null,
				2
			)
		);
		return 0;
	}

	const startedAt = new Date();
	if (sql) {
		for (const statement of EXAM_NOTIFICATION_SCHEMA_STATEMENTS) {
			await sql.query(statement);
		}
	}
	const report = await runExamSync({
		sources,
		fetchSourceText,
		extractItems,
		checkLink,
		store,
		todayIso
	});
	const finishedAt = new Date();

	if (sql && !options.dryRun) {
		await sql.query(INSERT_SYNC_RUN_SQL, [
			startedAt,
			report.status,
			report.totals.sourcesTotal,
			report.totals.sourcesOk,
			report.totals.sourcesFailed,
			report.totals.itemsNew,
			report.totals.itemsUpdated,
			report.totals.itemsQuarantined,
			0,
			JSON.stringify(
				report.sources
					.filter((source) => source.error)
					.map((source) => ({ source: source.id, error: source.error }))
			)
		]);
	}

	const output = {
		mode: 'sync',
		model,
		modelCalls: modelCallsMade,
		fallbackCalls: fallbackCallsMade,
		dryRun: options.dryRun,
		startedAt: startedAt.toISOString(),
		finishedAt: finishedAt.toISOString(),
		status: report.status,
		totals: report.totals,
		sources: report.sources
	};
	console.log(JSON.stringify(output, null, 2));
	appendStepSummary(report);
	return report.totals.sourcesTotal > 0 && report.totals.sourcesOk === 0 ? 1 : 0;
}

main()
	.then((exitCode) => process.exit(exitCode))
	.catch((error) => {
		console.error(error?.stack || String(error));
		process.exit(1);
	});
