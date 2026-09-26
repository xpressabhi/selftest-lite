// Sync orchestration for the exam notification tracker. Framework-neutral
// (no $env, no SvelteKit): the CLI script wires real fetch/Gemini/Neon, the
// tests wire fakes, and this file owns the business rules in between.
//
// Guarantees, each pinned by examSync.test.js:
// - sources fail in isolation; a total outage is reported as failed
// - junk model output degrades to drops, never a crash
// - out-of-scope and in-batch duplicates never publish
// - foreign / missing / unverifiable links quarantine instead of showing
// - published rows update without a redundant reachability check
// - bad dates become null with a problem code recorded

import { OBJECTIVE_ONLY_EXAMS } from '../data/indianExams.js';
import {
	dedupeKeyFor,
	isExcludedScopeTitle,
	isOfficialHost,
	isUrlOnAllowedHosts,
	meetsConfidence,
	NEAR_DUPLICATE_THRESHOLD,
	sanitizeCategory,
	sanitizeExamId,
	sanitizeExtractedTitle,
	sanitizeState,
	stripTrackingParams,
	tokenSetSimilarity,
	validateNotificationDates
} from '../shared/examNotifications.js';

export const DEFAULT_MAX_LINK_CHECKS_PER_SOURCE = 25;

function defaultShouldRetry(error) {
	const message = String(error?.message || error);
	return /\b(429|500|502|503|504)\b/.test(message) || /unavailable|high demand|rate limit|timeout/i.test(message);
}

/**
 * Retries transient provider failures (Gemini 503/429 spikes are common) with
 * linear backoff. Non-transient errors (bad request, schema mismatch) are
 * rethrown on the first attempt.
 */
export async function withRetries(
	operation,
	{
		attempts = 3,
		baseDelayMs = 1500,
		shouldRetry = defaultShouldRetry,
		sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
	} = {}
) {
	let lastError;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			if (attempt >= attempts || !shouldRetry(error)) {
				throw error;
			}
			await sleep(baseDelayMs * attempt);
		}
	}
	throw lastError;
}

function defaultExamOptions() {
	return OBJECTIVE_ONLY_EXAMS.map((exam) => ({ id: exam.id, name: exam.name }));
}

export function buildExtractionPrompt({
	source,
	pageText,
	todayIso,
	examOptions = defaultExamOptions()
}) {
	const examList = examOptions.map((exam) => `${exam.id} (${exam.name})`).join(', ');
	return `You extract Indian government recruitment notifications from one fetched web page for selftest.in.
Source: ${source.org} (source id: ${source.id}). Today is ${todayIso}.

Scope: recruitment and exam notifications only — new exams, applications open, corrigenda,
addenda, date extensions, vacancy updates. NEVER include results, merit lists, admit cards,
answer keys, cut-offs, interview schedules, tenders or general announcements.

Rules:
- Copy the headline verbatim as the title. Do not paraphrase.
- notificationUrl must be a link that actually appears on the page (absolute https URL, prefer
  the official notice/PDF). applyUrl only when the page has a direct apply link.
- Never invent URLs, dates or numbers. If a field is not clearly stated for THIS notification,
  return null for it.
- Dates use YYYY-MM-DD. Only report dates that the page states for this notification.
- publishedAt is the date the notice was published/uploaded (not the exam date).
- examId: only when the notification clearly belongs to one of these known practice exams;
  otherwise null. Known ids: ${examList}.
- confidence is your own 0-1 certainty that every filled field is correct for this notification.
- When the page groups notices by exam or advertisement number (for example railway CENs),
  report one item per distinct notice/advertisement with its own link.
- Ignore items whose visible date is clearly older than 90 days; include an item with no visible
  date. If nothing qualifies, return {"items": []}.
${source.linkHint ? `- ${source.linkHint}\n` : ''}
Page content follows between markers.
--- PAGE START ---
${pageText}
--- PAGE END ---`;
}

export function buildDiscoveryPrompt({ knownHosts, todayIso }) {
	return `You find official Indian government recruitment portals that a job/exam notification
tracker should monitor. Today is ${todayIso}.
Return JSON: { "suggestions": [ { "org": "...", "url": "https://...", "category": "one of: civil-services, ssc-central, banking, railways, police-defence, state-govt, teaching", "reason": "short why" } ] }.
Only official government or public-sector portals (domains ending .gov.in or .nic.in, or official
PSU/exam-body sites). NEVER suggest third-party aggregators or job boards such as SarkariResult,
FreeJobAlert, Testbook, Adda247, Naukri, Indeed, or similar.
Suggest only the notification/careers/notice listing page, not a homepage deep inside.
Do not suggest any of these hosts that are already tracked: ${knownHosts.join(', ')}.
Return at most 15 suggestions.`;
}

function toVacancies(value) {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
		return Math.trunc(value);
	}
	if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
		return Number.parseInt(value.trim(), 10);
	}
	return null;
}

function toConfidence(value) {
	let numeric = null;
	if (typeof value === 'number' && Number.isFinite(value)) {
		numeric = value;
	} else if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
		numeric = Number(value);
	}
	if (numeric === null) {
		return null;
	}
	return Math.min(Math.max(numeric, 0), 1);
}

function toShortText(value, maxChars) {
	if (typeof value !== 'string') {
		return null;
	}
	const text = value.replace(/\s+/g, ' ').trim();
	return text ? text.slice(0, maxChars) : null;
}

/**
 * Raw model items → validated, normalized candidates. Items without a usable
 * title cannot be identified and are dropped here; everything else keeps a
 * dedupe key so the caller can quarantine rather than lose it.
 */
export function normalizeExtractedItems(rawItems, source, todayIso) {
	if (!Array.isArray(rawItems)) {
		return [];
	}
	const items = [];
	for (const raw of rawItems) {
		if (!raw || typeof raw !== 'object') {
			continue;
		}
		const title = sanitizeExtractedTitle(raw.title);
		if (!title) {
			continue;
		}
		const dates = validateNotificationDates(
			{
				publishedAt: raw.publishedAt ?? null,
				applyStart: raw.applyStart ?? null,
				applyEnd: raw.applyEnd ?? null,
				examDate: raw.examDate ?? null
			},
			todayIso
		);
		items.push({
			dedupeKey: dedupeKeyFor(source.id, title),
			sourceId: source.id,
			org: source.org,
			title,
			category: sanitizeCategory(raw.category, undefined, source.category),
			state: sanitizeState(raw.state) ?? source.state ?? null,
			examId: sanitizeExamId(raw.examId),
			notificationUrl: stripTrackingParams(raw.notificationUrl),
			applyUrl: stripTrackingParams(raw.applyUrl),
			publishedAt: dates.publishedAt,
			applyStart: dates.applyStart,
			applyEnd: dates.applyEnd,
			examDate: dates.examDate,
			vacancies: toVacancies(raw.vacancies),
			qualification: toShortText(raw.qualification, 200),
			confidence: toConfidence(raw.confidence),
			dateProblems: dates.problems
		});
	}
	return items;
}

/**
 * Pure classification, excluding the async reachability check: which items
 * publish, which wait in quarantine and why, and which are out of scope.
 * A `publishedKeys` hit is an update and skips link re-verification; a known
 * quarantined key is retried like a new item so it can heal.
 */
export function classifyExtractedItem(
	item,
	{ knownKeys = [], publishedKeys = undefined, recentTitles = [], seenKeys = new Set(), allowedHosts = [] } = {}
) {
	const knownSet = knownKeys instanceof Set ? knownKeys : new Set(knownKeys || []);
	const publishedSet =
		publishedKeys === undefined
			? knownSet
			: publishedKeys instanceof Set
				? publishedKeys
				: new Set(publishedKeys || []);
	if (!item || !item.title || !item.dedupeKey) {
		return { action: 'drop', reason: 'missing_title' };
	}
	if (seenKeys.has(item.dedupeKey)) {
		return { action: 'drop', reason: 'duplicate_in_batch' };
	}
	if (isExcludedScopeTitle(item.title)) {
		return { action: 'drop', reason: 'out_of_scope' };
	}
	if (!item.notificationUrl) {
		return { action: 'quarantine', reason: 'link_missing' };
	}
	if (!isUrlOnAllowedHosts(item.notificationUrl, allowedHosts)) {
		return { action: 'quarantine', reason: 'link_not_allowed' };
	}
	if (!meetsConfidence(item.confidence)) {
		return { action: 'quarantine', reason: 'low_confidence' };
	}
	if (!publishedSet.has(item.dedupeKey)) {
		const nearDuplicate = recentTitles.some(
			(title) => tokenSetSimilarity(title, item.title) >= NEAR_DUPLICATE_THRESHOLD
		);
		if (nearDuplicate) {
			return { action: 'quarantine', reason: 'possible_duplicate' };
		}
	}
	return { action: 'publish', reason: null };
}

function emptySourceReport(source) {
	return {
		id: source.id,
		org: source.org,
		status: 'ok',
		extracted: 0,
		published: 0,
		updated: 0,
		quarantined: 0,
		dropped: 0,
		dateProblems: [],
		quarantinedItems: [],
		error: null
	};
}

function recordQuarantine(report, item, reason) {
	report.quarantined += 1;
	if (report.quarantinedItems.length < 20) {
		report.quarantinedItems.push({ title: item.title, reason });
	}
}

/**
 * Runs every source and returns the run report. `fetchSourceText(source)`,
 * `extractItems(source, pageText)` and `checkLink(url)` are injected so the
 * whole flow can be exercised offline.
 */
export async function runExamSync({
	sources,
	fetchSourceText,
	extractItems,
	checkLink,
	store,
	todayIso,
	maxLinkChecksPerSource = DEFAULT_MAX_LINK_CHECKS_PER_SOURCE
}) {
	const sourceReports = [];
	for (const source of sources) {
		const report = emptySourceReport(source);
		try {
			const pageText = await fetchSourceText(source);
			const rawItems = await extractItems(source, pageText);
			const normalized = normalizeExtractedItems(rawItems, source, todayIso);
			report.extracted = normalized.length;

			const lookup = await store.lookupSource(source.id);
			const publishedKeys = new Set(lookup.publishedKeys ?? lookup.keys ?? []);
			const allKeys = new Set(lookup.keys ?? []);
			const seenKeys = new Set();
			const dateProblems = new Set();
			let linkChecks = 0;

			for (const item of normalized) {
				for (const problem of item.dateProblems) {
					dateProblems.add(problem);
				}
				const { action, reason } = classifyExtractedItem(item, {
					knownKeys: allKeys,
					publishedKeys,
					recentTitles: lookup.titles ?? [],
					seenKeys,
					allowedHosts: source.allowedHosts
				});
				seenKeys.add(item.dedupeKey);

				if (action === 'drop') {
					report.dropped += 1;
					continue;
				}
				if (action === 'quarantine') {
					await store.quarantineNotification({ item, reason });
					recordQuarantine(report, item, reason);
					continue;
				}
				if (!publishedKeys.has(item.dedupeKey)) {
					if (linkChecks >= maxLinkChecksPerSource) {
						await store.quarantineNotification({ item, reason: 'link_unchecked' });
						recordQuarantine(report, item, 'link_unchecked');
						continue;
					}
					linkChecks += 1;
					const reachable = await Promise.resolve(checkLink(item.notificationUrl)).catch(() => false);
					if (!reachable) {
						await store.quarantineNotification({ item, reason: 'link_unreachable' });
						recordQuarantine(report, item, 'link_unreachable');
						continue;
					}
				}
				const { inserted } = await store.upsertNotification(item);
				if (inserted) {
					report.published += 1;
				} else {
					report.updated += 1;
				}
				publishedKeys.add(item.dedupeKey);
				allKeys.add(item.dedupeKey);
			}
			report.dateProblems = [...dateProblems];
		} catch (error) {
			report.status = 'failed';
			report.error = String(error?.message || error).slice(0, 500);
		}
		sourceReports.push(report);
	}

	const sourcesOk = sourceReports.filter((report) => report.status === 'ok').length;
	const sourcesFailed = sourceReports.length - sourcesOk;
	const totals = sourceReports.reduce(
		(accumulator, report) => ({
			sourcesTotal: accumulator.sourcesTotal + 1,
			sourcesOk: accumulator.sourcesOk + (report.status === 'ok' ? 1 : 0),
			sourcesFailed: accumulator.sourcesFailed + (report.status === 'ok' ? 0 : 1),
			itemsNew: accumulator.itemsNew + report.published,
			itemsUpdated: accumulator.itemsUpdated + report.updated,
			itemsQuarantined: accumulator.itemsQuarantined + report.quarantined,
			itemsDropped: accumulator.itemsDropped + report.dropped
		}),
		{
			sourcesTotal: 0,
			sourcesOk: 0,
			sourcesFailed: 0,
			itemsNew: 0,
			itemsUpdated: 0,
			itemsQuarantined: 0,
			itemsDropped: 0
		}
	);
	return {
		status: sourcesFailed === 0 ? 'ok' : sourcesOk === 0 ? 'failed' : 'partial',
		sourcesOk,
		sourcesFailed,
		totals,
		sources: sourceReports
	};
}

/**
 * Weekly discovery: keep only new, reachable, official portal candidates.
 * Suggestions are recorded for human review; nothing here is ever fetched as
 * a source. Pending suggestions whose host has since joined the registry are
 * marked added so the list stays honest.
 */
export async function runSourceDiscovery({ suggest, checkLink, store, knownHosts }) {
	const suggestions = (await suggest()) ?? [];
	const known = new Set(knownHosts.map((host) => String(host).toLowerCase()));
	const seenHosts = new Set();
	let saved = 0;
	let skipped = 0;

	for (const suggestion of Array.isArray(suggestions) ? suggestions : []) {
		const url = stripTrackingParams(suggestion?.url);
		if (!url) {
			skipped += 1;
			continue;
		}
		const host = new URL(url).hostname.toLowerCase();
		if (!isOfficialHost(host) || known.has(host) || seenHosts.has(host)) {
			skipped += 1;
			continue;
		}
		seenHosts.add(host);
		const reachable = await Promise.resolve(checkLink(url)).catch(() => false);
		if (!reachable) {
			skipped += 1;
			continue;
		}
		await store.saveSuggestion({
			org: toShortText(suggestion.org, 120),
			url,
			category: sanitizeCategory(suggestion.category, undefined, null),
			reason: toShortText(suggestion.reason, 300)
		});
		saved += 1;
	}

	const pending = (await store.readPendingSuggestions()) ?? [];
	const addedIds = [];
	for (const row of pending) {
		try {
			if (known.has(new URL(row.candidate_url).hostname.toLowerCase())) {
				addedIds.push(row.id);
			}
		} catch {
			// Unparsable stored URL: leave it pending for manual review.
		}
	}
	if (addedIds.length > 0) {
		await store.markSuggestionsAdded(addedIds);
	}

	return { requested: Array.isArray(suggestions) ? suggestions.length : 0, saved, skipped, added: addedIds.length };
}
