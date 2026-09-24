/**
 * Deterministic builder for "Match the Columns" questions.
 *
 * The model supplies content only: a stem, a rationale, and two aligned
 * columns where `columnB[i]` is the correct match for `columnA[i]`. This module
 * owns everything the learner sees as options:
 *
 *   1. Column II's display order is scrambled (letters A-D follow the display
 *      position, per exam convention).
 *   2. The correct combination is derived from that display order, so the
 *      stored key can never contradict the stored columns.
 *   3. Three distractor combinations are permutations of A-D that differ from
 *      the key in at least MATCHING_DISTRACTOR_MIN_DIFFS positions, so no
 *      distractor is accidentally correct.
 *   4. The four options are shuffled so the key is not positionally biased.
 *
 * Pure and injectable: pass a seeded `random` for exact tests.
 */

export const MATCHING_PAIR_COUNT = 4;
export const MATCHING_ITEM_MAX_CHARS = 120;
export const MATCHING_DISTRACTOR_MIN_DIFFS = 2;

export const MATCHING_ISSUE_INVALID = 'matching-pairs-invalid';
export const MATCHING_ISSUE_TOO_LONG = 'matching-item-too-long';

const LETTERS = ['A', 'B', 'C', 'D'];
const COMBINATION_PATTERN = /^1-([A-D]), 2-([A-D]), 3-([A-D]), 4-([A-D])$/;

/**
 * Parses a combination string like "1-B, 2-D, 3-A, 4-C" into its letters.
 * Returns null when the string is malformed or does not cover A-D exactly once.
 */
export function parseCombination(text) {
	if (typeof text !== 'string') {
		return null;
	}
	const match = COMBINATION_PATTERN.exec(text.trim());
	if (!match) {
		return null;
	}
	const letters = match.slice(1);
	return new Set(letters).size === letters.length ? letters : null;
}

export function formatCombination(letters) {
	return letters.map((letter, index) => `${index + 1}-${letter}`).join(', ');
}

function shuffle(list, random) {
	const copy = [...list];
	for (let index = copy.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(random() * (index + 1));
		[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
	}
	return copy;
}

function allPermutations(items) {
	if (items.length <= 1) {
		return [items];
	}
	return items.flatMap((item, index) =>
		allPermutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
			item,
			...rest,
		])
	);
}

function normalizeColumn(value) {
	if (!Array.isArray(value) || value.length !== MATCHING_PAIR_COUNT) {
		return null;
	}
	const items = value.map((item) => (typeof item === 'string' ? item.trim() : ''));
	if (items.some((item) => !item) || new Set(items).size !== items.length) {
		return null;
	}
	return items;
}

/**
 * @param {object} raw Model output: { question, rationale, columnA, columnB }
 * @param {{ random?: () => number }} options
 * @returns {{ ok: true, question: object } | { ok: false, issues: string[] }}
 */
export function buildMatchingQuestion(raw, { random = Math.random } = {}) {
	const columnA = normalizeColumn(raw?.columnA);
	const columnB = normalizeColumn(raw?.columnB);
	if (!columnA || !columnB) {
		return { ok: false, issues: [MATCHING_ISSUE_INVALID] };
	}
	if ([...columnA, ...columnB].some((item) => item.length > MATCHING_ITEM_MAX_CHARS)) {
		return { ok: false, issues: [MATCHING_ISSUE_TOO_LONG] };
	}

	// Display order for Column II: letters follow the display position.
	const displayB = shuffle(columnB, random);
	const displayLetter = new Map();
	displayB.forEach((item, index) => displayLetter.set(item, LETTERS[index]));
	const keyLetters = columnB.map((item) => displayLetter.get(item));
	const answer = formatCombination(keyLetters);

	// Distractors: permutations of A-D, each at least two positions from the key.
	const distractors = shuffle(
		allPermutations(LETTERS)
			.filter(
				(letters) =>
					letters.filter((letter, index) => letter !== keyLetters[index]).length >=
					MATCHING_DISTRACTOR_MIN_DIFFS
			)
			.map((letters) => formatCombination(letters)),
		random
	).slice(0, MATCHING_PAIR_COUNT - 1);

	const options = shuffle([answer, ...distractors], random);

	return {
		ok: true,
		question: {
			format: 'matching',
			question: typeof raw?.question === 'string' ? raw.question.trim() : '',
			rationale: typeof raw?.rationale === 'string' ? raw.rationale.trim() : '',
			columnA,
			columnB: displayB,
			options,
			answer,
		},
	};
}
