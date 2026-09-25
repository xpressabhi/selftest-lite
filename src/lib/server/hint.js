// Pure 50-50 hint engine: elimination picker + offer trigger predicates.
//
// No network, no Svelte, no database: the HTTP route in
// src/routes/api/test/hint/+server.js owns I/O, and the test page owns the
// dwell/skip signals. Everything here is deterministic and unit-testable.

// Eligibility thresholds live in $lib/shared/hint so the test page and this
// module cannot drift; re-exported here for existing server-side imports.
import { HINT_DWELL_SEC, HINT_SKIP_STREAK, MAX_HINTS_PER_TEST } from '$lib/shared/hint';

export { HINT_DWELL_SEC, HINT_SKIP_STREAK, MAX_HINTS_PER_TEST };

/**
 * Picks exactly two wrong option indexes to eliminate. Deterministic: the
 * first two options (in order) whose text does not match the answer. Returns
 * [] when elimination is impossible (fewer than 3 options or fewer than 2
 * provably-wrong options), so callers fail closed instead of leaking.
 */
export function pickElimination(question) {
	const options = Array.isArray(question?.options) ? question.options : null;
	const answer = typeof question?.answer === 'string' ? question.answer.trim() : null;
	if (!options || answer === null || options.length < 3) {
		return [];
	}
	const wrong = [];
	for (let index = 0; index < options.length; index += 1) {
		const text = typeof options[index] === 'string' ? options[index].trim() : '';
		if (text !== answer) {
			wrong.push(index);
		}
		if (wrong.length === 2) {
			break;
		}
	}
	return wrong.length === 2 ? wrong : [];
}

/**
 * Verifies a claimed elimination against the stored answer key: exactly two
 * distinct in-range indexes, neither pointing at the correct answer.
 */
export function verifyEliminated(question, eliminated) {
	const options = Array.isArray(question?.options) ? question.options : null;
	const answer = typeof question?.answer === 'string' ? question.answer.trim() : null;
	if (!options || answer === null || !Array.isArray(eliminated) || eliminated.length !== 2) {
		return false;
	}
	const [first, second] = eliminated;
	if (!Number.isInteger(first) || !Number.isInteger(second) || first === second) {
		return false;
	}
	for (const index of eliminated) {
		if (index < 0 || index >= options.length) {
			return false;
		}
		const text = typeof options[index] === 'string' ? options[index].trim() : '';
		if (text === answer) {
			return false;
		}
	}
	return true;
}

/**
 * Sanitizes a client-supplied `{ questionIndex: [i, j] }` map for storage:
 * drops unknown questions, cheating payloads, and anything past the
 * per-test cap. Never throws; grading must survive a hostile payload.
 */
export function sanitizeHintedIndexes(hinted, questions) {
	if (!hinted || typeof hinted !== 'object' || Array.isArray(hinted)) {
		return {};
	}
	if (!Array.isArray(questions) || questions.length === 0) {
		return {};
	}
	const clean = {};
	for (const [rawIndex, eliminated] of Object.entries(hinted)) {
		const index = Number(rawIndex);
		if (!Number.isInteger(index) || index < 0 || index >= questions.length) {
			continue;
		}
		if (!verifyEliminated(questions[index], eliminated)) {
			continue;
		}
		clean[index] = [eliminated[0], eliminated[1]];
		if (Object.keys(clean).length >= MAX_HINTS_PER_TEST) {
			break;
		}
	}
	if (Object.keys(hinted).length > MAX_HINTS_PER_TEST) {
		return {};
	}
	return clean;
}
/**
 * Tier-0 offer predicate. True after a long dwell on an unanswered question
 * or a skip streak, until the per-test cap. Answered questions never qualify.
 */
export function shouldOfferHint({
	dwellSec = 0,
	consecutiveSkips = 0,
	offersUsed = 0,
	answered = false,
	maxOffers = MAX_HINTS_PER_TEST,
} = {}) {
	if (answered) {
		return false;
	}
	if (Number(offersUsed) >= Number(maxOffers)) {
		return false;
	}
	if (Number(dwellSec) >= HINT_DWELL_SEC) {
		return true;
	}
	if (Number(consecutiveSkips) >= HINT_SKIP_STREAK) {
		return true;
	}
	return false;
}
