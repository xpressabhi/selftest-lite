// Pure challenge-link helpers: parse, build, and compare friendly scores.
// No network, no Svelte, no storage. Claimed scores are fun-first and never
// treated as verified results.

export const MAX_CHALLENGER_NAME = 24;
export const MAX_CHALLENGE_SCORE = 1000;

/**
 * Parses `ch` (challenger score) and `by` (challenger name) from a query
 * string. Returns null when the challenge is missing or malformed so the
 * caller renders nothing instead of an error.
 */
export function parseChallengeParams(search) {
	const params = new URLSearchParams(typeof search === 'string' ? search : '');
	const score = Number(params.get('ch'));
	const by = (params.get('by') || '').trim().slice(0, MAX_CHALLENGER_NAME);
	if (!Number.isInteger(score) || score < 0 || score > MAX_CHALLENGE_SCORE) {
		return null;
	}
	if (!by) {
		return null;
	}
	return { score, by };
}

/** Decides a friendly outcome between two raw scores on the same paper. */
export function compareScores(mine, theirs) {
	if (mine > theirs) {
		return 'win';
	}
	if (mine < theirs) {
		return 'lose';
	}
	return 'draw';
}

/** Appends (or replaces) challenge params on a test URL. */
export function buildChallengeUrl(base, score, name) {
	const [path, query = ''] = String(base || '').split('?');
	const params = new URLSearchParams(query);
	params.set('ch', String(Math.max(0, Math.round(Number(score) || 0))));
	params.set('by', String(name || '').trim().slice(0, MAX_CHALLENGER_NAME));
	return `${path}?${params.toString()}`;
}
