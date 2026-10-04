/**
 * Single place that decides generation parameters when several sources
 * disagree. Strict precedence, per field:
 *
 *   1. `explicit` — fields the user personally touched in the UI
 *   2. `constraint` — the selected exam/section format (or a discovered pattern)
 *   3. `resolved*` — profile-derived adaptations (adaptive difficulty, counts)
 *   4. the request defaults
 *
 * The exam registry already sets the paper length, so a pattern total never
 * overrides `numQuestions`; a selected section does, because a sectional
 * paper's size is defined by the section itself.
 */
import { MAX_QUESTIONS, MIN_QUESTIONS } from './quizConfig';

export function resolveGenerationParams({
	request = {},
	pattern = null,
	section = null,
	constraint = null,
	resolvedDifficulty = null,
	resolvedNumQuestions = null,
} = {}) {
	const explicit = new Set(
		(Array.isArray(request.explicit) ? request.explicit : []).filter(
			(field) => typeof field === 'string' && field.length > 0
		)
	);

	const sectionTypes = Array.isArray(section?.questionTypes)
		? section.questionTypes.filter(Boolean)
		: [];

	const difficulty = explicit.has('difficulty')
		? request.difficulty
		: constraint?.defaultDifficulty || resolvedDifficulty || request.difficulty;

	const requestedCount = explicit.has('numQuestions')
		? request.numQuestions
		: section?.questionCount || resolvedNumQuestions || request.numQuestions;
	// Clamped here because this is the single point every source merges at: the
	// count decides ceil(n / BATCH_SIZE) model batches per section, and a
	// full-exam request fans out across up to MAX_SECTIONS sections at once. A
	// pattern or profile value can carry a number the request body never went
	// through MAX_QUESTIONS with, so bounding only the request left the fan-out
	// unbounded. Integer-coerced and re-clamped so a fractional, negative or
	// absurd value cannot reach generatePaper; a non-finite one (NaN, Infinity, a
	// non-numeric string) falls back to the request default rather than a stub.
	const clampCount = (value) => {
		if (value === null || value === undefined || value === '') {
			return null;
		}
		const parsed = Math.trunc(Number(value));
		if (Number.isNaN(parsed)) {
			return null;
		}
		// Infinity is clampable and becomes MAX_QUESTIONS; NaN is not, and must
		// fall back rather than collapse to the minimum via Math.max.
		return Math.min(Math.max(parsed, MIN_QUESTIONS), MAX_QUESTIONS);
	};
	const numQuestions =
		clampCount(requestedCount) ?? clampCount(request.numQuestions) ?? MIN_QUESTIONS;

	const testType = explicit.has('testType')
		? request.testType
		: sectionTypes[0] || request.testType;

	const durationMinutes = explicit.has('durationMinutes')
		? request.durationMinutes
		: pattern?.durationMinutes ?? request.durationMinutes;

	return {
		difficulty: difficulty ?? null,
		numQuestions: numQuestions ?? null,
		testType: testType ?? null,
		durationMinutes: durationMinutes ?? null,
		explicit: [...explicit],
	};
}
