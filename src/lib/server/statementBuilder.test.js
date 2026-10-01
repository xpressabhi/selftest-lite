// Failure modes encoded before statementBuilder.js existed, per AGENTS.md:
// the builder must reject every malformed model shape before options exist,
// and its option grammar must round-trip so validation and the UI agree.

import { describe, expect, it } from 'vitest';
import {
	STATEMENT_ISSUE_INVALID,
	STATEMENT_ISSUE_TOO_LONG,
	buildStatementQuestion,
	formatStatementOption,
	parseStatementOption,
} from './statementBuilder.js';

function seededRandom(seed) {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

const HINDI_STATEMENTS = [
	{
		text: 'भारत की संविधान सभा ने राष्ट्रीय ध्वज का प्रस्ताव 22 जुलाई, 1947 को अपनाया था।',
		isTrue: true,
	},
	{
		text: 'राष्ट्रीय ध्वज के बीच चक्र में 21 तीलियां हैं।',
		isTrue: false,
	},
	{
		text: 'राष्ट्रीय ध्वज की लंबाई-चौड़ाई का अनुपात 3:4 है।',
		isTrue: false,
	},
];

const ENGLISH_STATEMENTS = [
	{ text: 'The Constituent Assembly adopted the national flag on 22 July 1947.', isTrue: true },
	{ text: 'The wheel of the national flag has 21 spokes.', isTrue: false },
	{ text: 'The flag has a length-to-width ratio of 3:4.', isTrue: false },
	{ text: 'The flag was designed by Pingali Venkayya.', isTrue: true },
];

describe('statementBuilder failure modes', () => {
	it('rejects missing, too few, and too many statements', () => {
		for (const raw of [
			undefined,
			{},
			{ statements: [] },
			{ statements: [{ text: 'A', isTrue: true }, { text: 'B', isTrue: false }] },
			{
				statements: Array.from({ length: 5 }, (_, index) => ({
					text: `Statement ${index + 1}`,
					isTrue: index === 0,
				})),
			},
		]) {
			const result = buildStatementQuestion(raw, { language: 'hindi', random: () => 0 });
			expect(result.ok).toBe(false);
			expect(result.issues).toContain(STATEMENT_ISSUE_INVALID);
		}
	});

	it('rejects blanks, duplicates, and non-boolean truth values', () => {
		for (const statements of [
			[{ text: '  ', isTrue: true }, { text: 'B', isTrue: false }, { text: 'C', isTrue: false }],
			[
				{ text: 'Same', isTrue: true },
				{ text: 'same', isTrue: false },
				{ text: 'Other', isTrue: false },
			],
			[
				{ text: 'A', isTrue: true },
				{ text: 'B', isTrue: 'false' },
				{ text: 'C', isTrue: false },
			],
			[
				{ text: 'A', isTrue: true },
				{ text: 'B', isTrue: null },
				{ text: 'C', isTrue: false },
			],
		]) {
			const result = buildStatementQuestion({ statements, rationale: '' }, { random: () => 0 });
			expect(result.ok).toBe(false);
			expect(result.issues).toContain(STATEMENT_ISSUE_INVALID);
		}
	});

	it('rejects over-long statements', () => {
		const result = buildStatementQuestion(
			{
				statements: [
					{ text: 'x'.repeat(241), isTrue: true },
					{ text: 'B', isTrue: false },
					{ text: 'C', isTrue: false },
				],
			},
			{ language: 'english', random: () => 0 }
		);
		expect(result.ok).toBe(false);
		expect(result.issues).toContain(STATEMENT_ISSUE_TOO_LONG);
	});

	it('rejects all-true and all-false statement sets', () => {
		for (const isTrue of [true, false]) {
			const statements = ['A', 'B', 'C'].map((text) => ({ text, isTrue }));
			const result = buildStatementQuestion({ statements }, { random: () => 0 });
			expect(result.ok).toBe(false);
			expect(result.issues).toContain(STATEMENT_ISSUE_INVALID);
		}
	});
});

describe('statementBuilder option grammar', () => {
	it('formats single and multiple combinations in both languages', () => {
		expect(formatStatementOption([1], 'hindi')).toBe('केवल 1');
		expect(formatStatementOption([1, 2], 'hindi')).toBe('1 तथा 2');
		expect(formatStatementOption([1, 2, 3], 'hindi')).toBe('1, 2 तथा 3');
		expect(formatStatementOption([3], 'english')).toBe('Only 3');
		expect(formatStatementOption([2, 3], 'english')).toBe('2 and 3');
		expect(formatStatementOption([1, 2, 4], 'english')).toBe('1, 2 and 4');
	});

	it('parses every formatted option back to its statement numbers', () => {
		for (const [language, sets] of [
			['hindi', [[1], [1, 2], [1, 2, 3], [2, 4]]],
			['english', [[1], [1, 2], [1, 2, 3], [2, 4]]],
		]) {
			for (const numbers of sets) {
				expect(parseStatementOption(formatStatementOption(numbers, language), language)).toEqual(
					numbers
				);
			}
		}
	});

	it('returns null for option strings from the other language', () => {
		expect(parseStatementOption('1 तथा 2', 'english')).toBeNull();
		expect(parseStatementOption('Only 1', 'hindi')).toBeNull();
	});

	it('returns null for malformed option strings', () => {
		for (const bad of [
			'',
			'1 तथा',
			'केवल 5',
			'1 तथा 1',
			'3 तथा 1',
			'1, 2 तथा 2',
			'1 and 2 and 3',
			'All of the above',
			'1-A, 2-B',
		]) {
			expect(parseStatementOption(bad, 'hindi')).toBeNull();
			expect(parseStatementOption(bad, 'english')).toBeNull();
		}
	});
});

describe('statementBuilder builds', () => {
	it('builds a Hindi question with composed framing, key, and unique options', () => {
		const result = buildStatementQuestion(
			{ statements: HINDI_STATEMENTS, rationale: 'केवल कथन 1 सही है।' },
			{ language: 'hindi', random: seededRandom(7) }
		);
		expect(result.ok).toBe(true);
		const question = result.question;
		expect(question.format).toBe('statement-based');
		expect(question.question).toContain('निम्नलिखित कथनों पर विचार कीजिए:');
		expect(question.question).toContain('1. भारत की संविधान सभा');
		expect(question.question).toContain('3. राष्ट्रीय ध्वज की लंबाई-चौड़ाई');
		expect(question.question).toContain('उपर्युक्त कथनों में से कौन-सा/से सही है/हैं?');
		expect(question.answer).toBe('केवल 1');
		expect(question.options).toHaveLength(4);
		expect(new Set(question.options).size).toBe(4);
		expect(question.options.filter((option) => option === question.answer)).toHaveLength(1);
	});

	it('builds a four-statement English question with English wording', () => {
		const result = buildStatementQuestion(
			{ statements: ENGLISH_STATEMENTS, rationale: 'Statements 1 and 4 are correct.' },
			{ language: 'english', random: seededRandom(11) }
		);
		expect(result.ok).toBe(true);
		const question = result.question;
		expect(question.question).toContain('Consider the following statements:');
		expect(question.question).toContain('Which of the statements given above is/are correct?');
		expect(question.answer).toBe('1 and 4');
		expect(question.options).toHaveLength(4);
	});

	it('collapses whitespace in statements so the numbered list stays intact', () => {
		const result = buildStatementQuestion(
			{
				statements: [
					{ text: 'Line one\n\nLine two', isTrue: true },
					{ text: '  Second   statement  ', isTrue: false },
					{ text: 'Third statement', isTrue: false },
				],
			},
			{ language: 'english', random: seededRandom(3) }
		);
		expect(result.ok).toBe(true);
		expect(result.question.question).toContain('1. Line one Line two');
		expect(result.question.question).toContain('2. Second statement');
		expect(result.question.question).not.toContain('\n\nLine two');
	});

	it('never marks a distractor as correct and keeps distractors near the key', () => {
		for (let seed = 1; seed <= 12; seed += 1) {
			const result = buildStatementQuestion(
				{ statements: ENGLISH_STATEMENTS, rationale: '' },
				{ language: 'english', random: seededRandom(seed) }
			);
			expect(result.ok).toBe(true);
			const question = result.question;
			const key = parseStatementOption(question.answer, 'english');
			expect(key).toEqual([1, 4]);
			const parsed = question.options.map((option) => parseStatementOption(option, 'english'));
			expect(parsed.every((numbers) => numbers !== null)).toBe(true);
			expect(parsed.filter((numbers) => numbers.join(',') === key.join(','))).toHaveLength(1);
			for (const numbers of parsed) {
				const keySet = new Set(key);
				const difference =
					numbers.filter((value) => !keySet.has(value)).length +
					key.filter((value) => !numbers.includes(value)).length;
				expect(difference).toBeLessThanOrEqual(2);
			}
		}
	});

	it('is deterministic for a seed and rotates the key position across seeds', () => {
		const build = (seed) =>
			buildStatementQuestion(
				{ statements: HINDI_STATEMENTS, rationale: '' },
				{ language: 'hindi', random: seededRandom(seed) }
			).question;
		expect(build(5)).toEqual(build(5));

		const positions = new Set();
		for (let seed = 1; seed <= 24; seed += 1) {
			positions.add(build(seed).options.indexOf(build(seed).answer));
		}
		expect(positions.size).toBeGreaterThan(1);
	});
});
