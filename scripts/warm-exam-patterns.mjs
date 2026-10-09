#!/usr/bin/env node
// Warms the exam-pattern cache so a full-exam generation finds the marking
// scheme it needs. Without a cached pattern the generate route used to ship a
// paper with no `sections`, and `computeAttemptMarks` returns null without
// them — which is why no attempt in the database had marks (0 of 725, and 0 of
// 1680 papers carried a sections array).
//
// Usage:
//   npm run exams:patterns -- --url=https://www.selftest.in
//   npm run exams:patterns -- --url=... --dry-run
//   npm run exams:patterns -- --url=... --all --limit=25
//   npm run exams:patterns -- --url=... --exam=ssc-cgl,neet-ug
//
// Model calls happen inside the app behind /api/exam/pattern, so this script
// needs no GEMINI_API_KEY: only DATABASE_URL (to read demand and the cached
// patterns) and the site URL. Patterns last 45 days and a fresh one is skipped
// before any HTTP call, so a daily run normally costs nothing.
//
// Exit codes: 0 = nothing to do or something warmed, 1 = every attempted warm-up
// failed, 2 = bad usage or missing configuration.

import { neon } from '@neondatabase/serverless';
import { INDIAN_EXAMS } from '../src/lib/data/indianExams.js';
import {
	buildWarmupTargets,
	planPatternWarmup,
	summarizeWarmup,
	warmupDelayMs
} from '../src/lib/server/examPatternWarmup.js';

const PATTERN_RATE_LIMIT = 10;
const PATTERN_RATE_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 25;
const REQUEST_TIMEOUT_MS = 60_000;

function usage(message) {
	if (message) {
		console.error(`warm-exam-patterns: ${message}\n`);
	}
	console.error(
		'Usage: npm run exams:patterns -- --url=<site> [--dry-run] [--all] [--limit=N] [--exam=a,b] [--language=english]'
	);
	process.exit(2);
}

function parseArgs(argv) {
	const options = {
		url: null,
		dryRun: false,
		all: false,
		limit: DEFAULT_LIMIT,
		examIds: null,
		language: 'english'
	};
	for (const arg of argv) {
		if (arg === '--dry-run') {
			options.dryRun = true;
		} else if (arg === '--all') {
			options.all = true;
		} else if (arg.startsWith('--url=')) {
			options.url = arg.slice('--url='.length).replace(/\/+$/, '');
		} else if (arg.startsWith('--limit=')) {
			const value = Number(arg.slice('--limit='.length));
			if (!Number.isFinite(value) || value < 0) {
				usage(`--limit must be a non-negative number, got "${arg}"`);
			}
			options.limit = value;
		} else if (arg.startsWith('--exam=')) {
			options.examIds = arg
				.slice('--exam='.length)
				.split(',')
				.map((id) => id.trim())
				.filter(Boolean);
		} else if (arg.startsWith('--language=')) {
			options.language = arg.slice('--language='.length).trim() || 'english';
		} else if (arg === '--help' || arg === '-h') {
			usage();
		} else {
			usage(`unknown argument "${arg}"`);
		}
	}
	if (!options.url) {
		usage('--url is required (this script triggers model calls, so the target is never assumed)');
	}
	return options;
}

/** Exam ids users actually generate full exams for, busiest first. */
async function demandExamIds(sql) {
	const rows = await sql`
		SELECT exam_id, COUNT(*)::int AS papers
		FROM ai_test
		WHERE test_mode = 'full-exam' AND exam_id IS NOT NULL
		GROUP BY exam_id
		ORDER BY papers DESC, exam_id ASC
	`;
	return rows.map((row) => row.exam_id);
}

async function cachedPatternRows(sql) {
	return sql`SELECT pattern_key, expires_at FROM exam_patterns`;
}

/** One GET against the app's on-demand pattern endpoint. */
async function warmOne(baseUrl, entry, language) {
	const url = `${baseUrl}/api/exam/pattern?examId=${encodeURIComponent(entry.examId)}&language=${encodeURIComponent(language)}`;
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
		if (response.ok) {
			const pattern = await response.json().catch(() => null);
			return {
				...entry,
				outcome: 'warmed',
				detail: pattern?.stale ? 'refreshed (was stale)' : 'discovered or served'
			};
		}
		const body = await response.text().catch(() => '');
		return { ...entry, outcome: 'failed', detail: `${response.status} ${body.slice(0, 120)}` };
	} catch (error) {
		return { ...entry, outcome: 'failed', detail: error?.message || String(error) };
	}
}

const options = parseArgs(process.argv.slice(2));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	usage('DATABASE_URL is required to read demand and the cached patterns');
}

const sql = neon(databaseUrl);

const examIds = options.examIds
	? options.examIds
	: options.all
		? INDIAN_EXAMS.map((exam) => exam.id)
		: await demandExamIds(sql);

const targets = buildWarmupTargets({
	examIds,
	registry: INDIAN_EXAMS,
	limit: options.limit
});
const rows = await cachedPatternRows(sql);
const plan = planPatternWarmup({ targets, rows });
const pending = plan.filter((entry) => entry.status !== 'fresh');

console.log(
	`warm-exam-patterns: ${plan.length} target(s) for ${options.url} ` +
		`(${plan.length - pending.length} fresh, ${pending.length} to warm)` +
		`${options.dryRun ? ' [dry run]' : ''}`
);
if (options.dryRun || pending.length === 0) {
	for (const entry of plan) {
		console.log(`  ${entry.status.padEnd(8)} ${entry.examId}  (${entry.examName})`);
	}
	const skipped = summarizeWarmup(plan);
	console.log(
		`\n  nothing to do: ${skipped.skippedFresh} fresh, ${pending.length} would be warmed`
	);
	process.exit(0);
}

const delay = warmupDelayMs({ limit: PATTERN_RATE_LIMIT, windowMs: PATTERN_RATE_WINDOW_MS });
const results = [];
for (const [index, entry] of pending.entries()) {
	if (index > 0) {
		await new Promise((resolve) => setTimeout(resolve, delay));
	}
	const result = await warmOne(options.url, entry, options.language);
	results.push(result);
	console.log(
		`  ${result.outcome === 'warmed' ? 'ok  ' : 'FAIL'}  ${entry.status.padEnd(8)} ` +
			`${entry.examId.padEnd(24)} ${result.detail ?? ''}`
	);
}

const summary = summarizeWarmup([...plan.filter((entry) => entry.status === 'fresh'), ...results]);
console.log(
	`\nwarm-exam-patterns: ${summary.warmed} warmed, ${summary.skippedFresh} already fresh, ` +
		`${summary.failed.length} failed (of ${pending.length} attempted)`
);
for (const failure of summary.failed) {
	console.log(`  failed: ${failure.examId} — ${failure.detail}`);
}

// One flaky discovery should not fail the job; a run where nothing worked should.
if (pending.length > 0 && summary.warmed === 0) {
	console.error('warm-exam-patterns: every attempted warm-up failed');
	process.exit(1);
}
