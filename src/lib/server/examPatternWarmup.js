/**
 * Planning logic for the exam-pattern warm-up: which exams to warm, and which of
 * them actually need a model call.
 *
 * Why this is a separate module: `examPattern.js` statically imports SvelteKit's
 * `$env/dynamic/private`, so a plain `node scripts/…` process cannot load it (and
 * with it `patternKeyFor`). This module therefore imports nothing at all, and
 * `scripts/warm-exam-patterns.mjs` runs it under bare node. `patternKeyForExamId`
 * re-states the key format; `examPatternWarmup.test.js` asserts it equals the real
 * `patternKeyFor` output, so drift fails the suite instead of silently re-warming
 * (and re-paying for) patterns that are already cached.
 *
 * The point of the whole module is cost: a full-exam generation needs a marking
 * scheme, which only a cached pattern provides, and a pattern costs one model call
 * per exam per 45 days. A fresh pattern must therefore cost nothing, and a run
 * must never mean "discover every registered exam".
 */

/** Mirrors MAX sections of the key in examPattern.js. */
const KEY_SLICE = 60;
const DEFAULT_LIMIT = 25;

/** Same algorithm as examPattern.js's slugify, kept in step by the key test. */
function slugify(value, fallback = 'section') {
	const slug = String(value || '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, KEY_SLICE);
	return slug || fallback;
}

/**
 * The `exam:` pattern key for an exam id, or null when the id cannot form one.
 * Differs from `patternKeyFor` only for whitespace-only input, which callers
 * here are expected to have dropped already.
 */
export function patternKeyForExamId(examId) {
	if (typeof examId !== 'string') {
		return null;
	}
	const trimmed = examId.trim();
	if (!trimmed) {
		return null;
	}
	return `exam:${slugify(trimmed)}`;
}

function capLimit(limit) {
	if (!Number.isFinite(limit)) {
		return DEFAULT_LIMIT;
	}
	return Math.max(0, Math.trunc(limit));
}

/**
 * Builds the warm-up targets, in request order.
 *
 * Unregistered ids are dropped rather than warmed: discovery is told the exam
 * name, and without a real name the model invents an exam. Duplicates collapse,
 * because one exam is one model call.
 *
 * @param {{examIds?: unknown[], registry?: {id: string, name: string}[], limit?: number}} [options]
 */
export function buildWarmupTargets({ examIds = [], registry = [], limit = DEFAULT_LIMIT } = {}) {
	const byId = new Map(registry.map((exam) => [exam.id, exam]));
	const capped = capLimit(limit);
	const targets = [];
	const seen = new Set();

	for (const raw of examIds) {
		if (targets.length >= capped) {
			break;
		}
		if (typeof raw !== 'string') {
			continue;
		}
		const examId = raw.trim();
		if (!examId || seen.has(examId)) {
			continue;
		}
		seen.add(examId);

		const exam = byId.get(examId);
		const patternKey = patternKeyForExamId(examId);
		if (!exam || !patternKey) {
			continue;
		}
		targets.push({ examId, examName: exam.name, patternKey });
	}

	return targets;
}

function isFuture(value, now) {
	if (value === null || value === undefined) {
		return false;
	}
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return false;
	}
	return date.getTime() > now.getTime();
}

/**
 * Classifies every target against the cached pattern rows.
 *
 * @param {{targets?: object[], rows?: {pattern_key: string, expires_at: unknown}[], now?: Date}} [options]
 * @returns {{examId: string, examName: string, patternKey: string, status: 'fresh'|'expired'|'missing'}[]}
 */
export function planPatternWarmup({ targets = [], rows = [], now = new Date() } = {}) {
	const expiresByKey = new Map();
	for (const row of rows) {
		if (row && typeof row.pattern_key === 'string') {
			expiresByKey.set(row.pattern_key, row.expires_at);
		}
	}

	return targets.map((target) => {
		if (!expiresByKey.has(target.patternKey)) {
			return { ...target, status: 'missing' };
		}
		return {
			...target,
			status: isFuture(expiresByKey.get(target.patternKey), now) ? 'fresh' : 'expired'
		};
	});
}

/** @param {{examId: string, status: string, outcome?: string, detail?: string}[]} entries */
export function summarizeWarmup(entries = []) {
	return {
		total: entries.length,
		skippedFresh: entries.filter((entry) => entry.status === 'fresh').length,
		warmed: entries.filter((entry) => entry.outcome === 'warmed').length,
		failed: entries
			.filter((entry) => entry.status !== 'fresh' && entry.outcome === 'failed')
			.map((entry) => ({ examId: entry.examId, detail: entry.detail ?? null }))
	};
}

/**
 * Delay between warm-up calls. The endpoint is rate-limited (10/min per client
 * key), so a warm-up that ignores the window would just collect 429s. An
 * unusable limit means the whole window.
 */
export function warmupDelayMs({ limit = 10, windowMs = 60_000 } = {}) {
	const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 0;
	return safeLimit === 0 ? windowMs : Math.ceil(windowMs / safeLimit);
}
