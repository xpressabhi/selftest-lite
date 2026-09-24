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

	const numQuestions = explicit.has('numQuestions')
		? request.numQuestions
		: section?.questionCount || resolvedNumQuestions || request.numQuestions;

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
