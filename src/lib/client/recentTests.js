// Pure recent-tests merge + server-cache TTL helpers for the home page.
//
// The home planner used to paint localStorage history and then wholesale
// replace it when `/api/test` resolved, visibly swapping rows. Now both
// sources merge (server order wins, local-only rows survive) and the server
// payload is cached with a TTL so reloads inside the window render merged
// data in a single paint without refetching.

export const RECENT_CACHE_TTL_MS = 5 * 60 * 1000;
export const RECENT_MERGE_LIMIT = 5;

function toEntry(id, topic, totalQuestions, isFullExam) {
	if (id === undefined || id === null || String(id).length === 0) {
		return null;
	}
	return {
		id: String(id),
		topic: topic || '',
		totalQuestions: Number(totalQuestions) || 0,
		isFullExam: isFullExam === true,
	};
}

/** Normalizes one local history entry to the recent-tests view model. */
export function normalizeLocalEntry(entry) {
	if (!entry || typeof entry !== 'object') {
		return null;
	}
	return toEntry(
		entry.id,
		entry.topic,
		entry.totalQuestions ?? entry.questions?.length,
		entry.test_mode === 'full-exam'
	);
}

/** Normalizes one `/api/test` row to the same view model. */
export function normalizeServerEntry(test) {
	if (!test || typeof test !== 'object') {
		return null;
	}
	return toEntry(test.id, test.topic, test.num_questions, test.test_mode === 'full-exam');
}

/**
 * Merges server rows (order wins) with local-only entries appended, minus
 * hidden ids, capped at `limit`. Server-empty means local-only (offline).
 */
export function mergeRecentTests({ local = [], server = [], hidden = [], limit = RECENT_MERGE_LIMIT } = {}) {
	const hiddenSet = new Set((Array.isArray(hidden) ? hidden : []).map(String));
	const seen = new Set();
	const merged = [];
	const push = (entry) => {
		if (!entry || seen.has(entry.id) || hiddenSet.has(entry.id)) {
			return;
		}
		seen.add(entry.id);
		merged.push(entry);
	};
	for (const test of Array.isArray(server) ? server : []) {
		push(normalizeServerEntry(test));
	}
	for (const entry of Array.isArray(local) ? local : []) {
		push(normalizeLocalEntry(entry));
	}
	return merged.slice(0, Math.max(1, Number(limit) || RECENT_MERGE_LIMIT));
}

/** True when a cached `at` timestamp is inside the TTL window. */
export function isCacheFresh(cachedAt, now = Date.now(), ttl = RECENT_CACHE_TTL_MS) {
	return Number.isFinite(Number(cachedAt)) && now - Number(cachedAt) < ttl;
}

/** Validates a cached `{ at, tests }` payload; null when unusable. */
export function readRecentCache(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}
	if (!Number.isFinite(Number(value.at)) || !Array.isArray(value.tests)) {
		return null;
	}
	return { at: Number(value.at), tests: value.tests };
}
