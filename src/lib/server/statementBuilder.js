/**
 * Deterministic builder for statement-based questions ("Consider the
 * following statements ... which is/are correct?").
 *
 * The model supplies content only: 3 or 4 short statements with truth values
 * and a rationale. This module owns everything the learner sees:
 *
 *   1. The instruction line, the numbered statements and the closing question
 *      are composed into `question` in the paper's language.
 *   2. The key and three near-miss combination options ("केवल 1", "1 तथा 2")
 *      are built from the true-statement set, so no option can contradict it.
 *   3. The four options are shuffled so the key is not positionally biased.
 *
 * Pure and injectable: pass a seeded `random` for exact tests.
 */

import { normalizeMathText } from '$lib/shared/latex';

export const STATEMENT_MIN_COUNT = 3;
export const STATEMENT_MAX_COUNT = 4;
export const STATEMENT_MAX_CHARS = 240;
export const STATEMENT_OPTION_COUNT = 4;

export const STATEMENT_ISSUE_INVALID = 'statement-content-invalid';
export const STATEMENT_ISSUE_TOO_LONG = 'statement-too-long';

const FRAMING = {
	english: {
		instruction: 'Consider the following statements:',
		question: 'Which of the statements given above is/are correct?',
	},
	hindi: {
		instruction: 'निम्नलिखित कथनों पर विचार कीजिए:',
		question: 'उपर्युक्त कथनों में से कौन-सा/से सही है/हैं?',
	},
};

const OPTION_PATTERNS = {
	english: { single: /^Only\s+(\d+)$/u, multi: /^(\d+(?:, \d+)*)\s+and\s+(\d+)$/u },
	hindi: { single: /^केवल\s+(\d+)$/u, multi: /^(\d+(?:, \d+)*)\s+तथा\s+(\d+)$/u },
};

function framingFor(language) {
	return FRAMING[language] || FRAMING.english;
}

function normalizeStatements(raw) {
	if (!Array.isArray(raw?.statements)) {
		return null;
	}
	if (
		raw.statements.length < STATEMENT_MIN_COUNT ||
		raw.statements.length > STATEMENT_MAX_COUNT
	) {
		return null;
	}

	const statements = [];
	for (const entry of raw.statements) {
		if (
			!entry ||
			typeof entry !== 'object' ||
			typeof entry.text !== 'string' ||
			typeof entry.isTrue !== 'boolean'
		) {
			return null;
		}
		statements.push({
			text: normalizeMathText(entry.text).replace(/\s+/gu, ' ').trim(),
			isTrue: entry.isTrue,
		});
	}

	const normalizedTexts = statements.map((statement) => statement.text.toLowerCase());
	if (
		statements.some((statement) => !statement.text) ||
		new Set(normalizedTexts).size !== normalizedTexts.length
	) {
		return null;
	}

	// The key must be a proper non-empty subset: a fair question needs at
	// least one true and one false statement.
	const trueCount = statements.filter((statement) => statement.isTrue).length;
	if (trueCount === 0 || trueCount === statements.length) {
		return null;
	}

	return statements;
}

/** "केवल 1" / "1 तथा 2" / "1, 2 तथा 3" (Hindi), "Only 1" / "1 and 2" (English). */
export function formatStatementOption(indexes, language = 'english') {
	const numbers = [...new Set(indexes)].sort((a, b) => a - b).map((index) => String(index));
	if (numbers.length === 0) {
		return '';
	}
	const last = numbers[numbers.length - 1];
	if (numbers.length === 1) {
		return language === 'hindi' ? `केवल ${last}` : `Only ${last}`;
	}
	const head = numbers.slice(0, -1).join(', ');
	return language === 'hindi' ? `${head} तथा ${last}` : `${head} and ${last}`;
}

/** Parses an option back into ascending 1-based statement numbers; null when malformed. */
export function parseStatementOption(text, language = 'english') {
	const patterns = OPTION_PATTERNS[language] || OPTION_PATTERNS.english;
	const trimmed = String(text ?? '').trim();
	const single = trimmed.match(patterns.single);
	let numbers;
	if (single) {
		numbers = [Number(single[1])];
	} else {
		const multi = trimmed.match(patterns.multi);
		if (!multi) {
			return null;
		}
		numbers = [...multi[1].split(', ').map((value) => Number(value)), Number(multi[2])];
	}

	if (
		numbers.some(
			(value) => !Number.isInteger(value) || value < 1 || value > STATEMENT_MAX_COUNT
		) ||
		new Set(numbers).size !== numbers.length ||
		numbers.some((value, index) => index > 0 && value <= numbers[index - 1])
	) {
		return null;
	}
	return numbers;
}

function subsetForMask(mask, count) {
	const subset = [];
	for (let index = 0; index < count; index += 1) {
		if (mask & (1 << index)) {
			subset.push(index + 1);
		}
	}
	return subset;
}

function symmetricDifferenceSize(a, b) {
	const setB = new Set(b);
	return (
		a.filter((value) => !setB.has(value)).length +
		b.filter((value) => !a.includes(value)).length
	);
}

function shuffle(list, random) {
	const copy = [...list];
	for (let index = copy.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(random() * (index + 1));
		[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
	}
	return copy;
}

function composeQuestion(statementTexts, language) {
	const framing = framingFor(language);
	const lines = statementTexts.map((text, index) => `${index + 1}. ${text}`);
	return `${framing.instruction}\n\n${lines.join('\n')}\n\n${framing.question}`;
}

/**
 * @param {object} raw Model output: { statements: [{ text, isTrue }], rationale }
 * @param {{ language?: string, random?: () => number }} options
 * @returns {{ ok: true, question: object } | { ok: false, issues: string[] }}
 */
export function buildStatementQuestion(raw, { language = 'english', random = Math.random } = {}) {
	const statements = normalizeStatements(raw);
	if (!statements) {
		return { ok: false, issues: [STATEMENT_ISSUE_INVALID] };
	}
	if (statements.some((statement) => statement.text.length > STATEMENT_MAX_CHARS)) {
		return { ok: false, issues: [STATEMENT_ISSUE_TOO_LONG] };
	}

	const count = statements.length;
	const keyNumbers = statements
		.map((statement, index) => (statement.isTrue ? index + 1 : null))
		.filter((value) => value !== null);
	const key = formatStatementOption(keyNumbers, language);
	const keySet = new Set(keyNumbers);

	// Distractors: every other non-empty subset, closest (smallest symmetric
	// difference) first, random among ties so papers do not repeat one shape.
	const candidates = [];
	for (let mask = 1; mask <= (1 << count) - 1; mask += 1) {
		const subset = subsetForMask(mask, count);
		if (subset.length === keyNumbers.length && subset.every((value) => keySet.has(value))) {
			continue;
		}
		candidates.push(subset);
	}
	const distractors = shuffle(candidates, random)
		.sort((a, b) => symmetricDifferenceSize(a, keyNumbers) - symmetricDifferenceSize(b, keyNumbers))
		.slice(0, STATEMENT_OPTION_COUNT - 1)
		.map((subset) => formatStatementOption(subset, language));

	const options = shuffle([key, ...distractors], random);

	return {
		ok: true,
		question: {
			format: 'statement-based',
			question: composeQuestion(
				statements.map((statement) => statement.text),
				language
			),
			rationale: typeof raw?.rationale === 'string' ? raw.rationale.trim() : '',
			options,
			answer: key,
		},
	};
}
