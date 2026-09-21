// Pure recent-tests view-model helpers for the home planner and the
// composer's search dropdown.
//
// Both surfaces are own-tests-only: the home block merges local history
// (already hydrated from server attempts when an identity exists) and the
// dropdown filters the same history locally until a real search begins.
// Other people's tests stay reachable only through the debounced server
// search in TestSearchDropdown.

export const RECENT_MERGE_LIMIT = 5;
export const OWN_TEST_RESULTS_LIMIT = 10;

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

/**
 * Filters local history to the home recent-tests view model: invalid and
 * hidden rows dropped, newest-first order preserved, capped at `limit`.
 */
export function mergeRecentTests({ local = [], hidden = [], limit = RECENT_MERGE_LIMIT } = {}) {
	const hiddenSet = new Set((Array.isArray(hidden) ? hidden : []).map(String));
	const merged = [];
	for (const entry of Array.isArray(local) ? local : []) {
		const normalized = normalizeLocalEntry(entry);
		if (!normalized || hiddenSet.has(normalized.id)) {
			continue;
		}
		merged.push(normalized);
		if (merged.length >= Math.max(1, Number(limit) || RECENT_MERGE_LIMIT)) {
			break;
		}
	}
	return merged;
}

/**
 * Filters local history for the composer dropdown as `/api/test`-shaped rows
 * so both sources feed the same template. Matches topic or id substrings
 * case-insensitively; an empty query returns the newest rows.
 */
export function toOwnTestResults(
	history,
	query = '',
	{ hidden = [], limit = OWN_TEST_RESULTS_LIMIT } = {}
) {
	const hiddenSet = new Set((Array.isArray(hidden) ? hidden : []).map(String));
	const needle = String(query || '')
		.trim()
		.toLowerCase();
	const cappedLimit = Math.max(1, Number(limit) || OWN_TEST_RESULTS_LIMIT);
	const ordered = [...(Array.isArray(history) ? history : [])].sort(
		(a, b) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0)
	);

	const results = [];
	for (const entry of ordered) {
		const normalized = normalizeLocalEntry(entry);
		if (!normalized || hiddenSet.has(normalized.id)) {
			continue;
		}
		if (needle) {
			const matchesTopic = normalized.topic.toLowerCase().includes(needle);
			const matchesId = normalized.id.toLowerCase().includes(needle);
			if (!matchesTopic && !matchesId) {
				continue;
			}
		}
		results.push({
			id: normalized.id,
			topic: normalized.topic,
			test_mode: normalized.isFullExam ? 'full-exam' : 'quiz-practice',
		});
		if (results.length >= cappedLimit) {
			break;
		}
	}
	return results;
}
