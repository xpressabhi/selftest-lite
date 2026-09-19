/**
 * Shared character limits and text cleaning for user-typed inputs.
 *
 * The server already validates what reaches the API (`/api/generate`,
 * `/api/explain`, `/api/parse-intent`, profile normalization), so these limits
 * exist to stop abuse at the source: unbounded typing/pasting, control
 * characters, zero-width and bidi-override tricks, and whitespace padding.
 * Keep every client cap at or below the matching server cap.
 */

/** Planner composer ("What do you want to practice?") and plan-topic edits. */
export const MAX_INTENT_CHARS = 1000;

/** Topic shown on the plan card / sent as the generated paper topic. */
export const MAX_TOPIC_CHARS = 200;

/** Search boxes: test search, history search, exam pickers. */
export const MAX_SEARCH_CHARS = 100;

/** Short profile fields: subjects, focus areas, class/exam labels. */
export const MAX_PROFILE_FIELD_CHARS = 60;

/** Admin login and similar credential fields. */
export const MAX_ADMIN_FIELD_CHARS = 128;

// C0/C1 controls, zero-width joiners/marks and bidi overrides. Kept out of
// search and topic text so they cannot smuggle invisible characters past
// duplicate detection or spoof what a value looks like.
/* eslint-disable no-control-regex -- filtering control characters is the point */
const INVISIBLE_CHARS =
	/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/gu;
/* eslint-enable no-control-regex */

const WHITESPACE_RUNS = /\s+/gu;

function stripInvisible(value) {
	return value.replace(INVISIBLE_CHARS, '').replace(/\u00a0/gu, ' ');
}

/**
 * Cleans free text as it is typed: drops invisible characters, collapses
 * whitespace runs to a single space, trims leading spaces and clamps to
 * `maxChars`. The trailing trim is intentionally left to the submit path so
 * typing a space mid-sentence is not fought.
 */
export function sanitizeInputText(value, maxChars) {
	if (typeof value !== 'string') return '';
	const cleaned = stripInvisible(value).replace(WHITESPACE_RUNS, ' ').trimStart();
	return Number.isFinite(maxChars) && maxChars > 0 ? cleaned.slice(0, maxChars) : cleaned;
}

/**
 * Same cleaning, but only clamps the length - used where the exact string
 * matters (credentials) and whitespace must be preserved verbatim.
 */
export function clampInputText(value, maxChars) {
	if (typeof value !== 'string') return '';
	const cleaned = stripInvisible(value);
	return Number.isFinite(maxChars) && maxChars > 0 ? cleaned.slice(0, maxChars) : cleaned;
}

/** True when a value sits at (or over) the limit, for showing a counter hint. */
export function isNearInputLimit(value, maxChars, ratio = 0.8) {
	if (typeof value !== 'string' || !Number.isFinite(maxChars) || maxChars <= 0) return false;
	return value.length >= Math.floor(maxChars * ratio);
}
