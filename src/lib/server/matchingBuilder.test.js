import { describe, expect, it } from 'vitest';
import {
	MATCHING_DISTRACTOR_MIN_DIFFS,
	MATCHING_ITEM_MAX_CHARS,
	MATCHING_PAIR_COUNT,
	buildMatchingQuestion,
	parseCombination,
} from './matchingBuilder';

// Failure modes first (spec: docs/superpowers/specs/2026-09-24-question-formats-design.md).
// The builder is the only place combination options are created, so these tests
// pin the contracts the rest of the pipeline trusts.

function baseRaw(overrides = {}) {
	return {
		question: 'Match the vitamin in Column I with the deficiency disease in Column II.',
		rationale: 'Vitamin A prevents night blindness; B1 beriberi; C scurvy; D rickets.',
		columnA: ['Vitamin A', 'Vitamin B1', 'Vitamin C', 'Vitamin D'],
		columnB: ['Night blindness', 'Beriberi', 'Scurvy', 'Rickets'],
		...overrides,
	};
}

function seededRandom(seed) {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

describe('buildMatchingQuestion input guards', () => {
	it('rejects a wrong pair count in either column', () => {
		const shortB = buildMatchingQuestion(
			baseRaw({ columnB: ['Night blindness', 'Beriberi', 'Scurvy'] }),
			{ random: seededRandom(1) }
		);
		expect(shortB.ok).toBe(false);
		expect(shortB.issues).toContain('matching-pairs-invalid');

		const longA = buildMatchingQuestion(
			baseRaw({ columnA: [...baseRaw().columnA, 'Vitamin K'] }),
			{ random: seededRandom(1) }
		);
		expect(longA.ok).toBe(false);
		expect(longA.issues).toContain('matching-pairs-invalid');
	});

	it('rejects missing or non-array columns', () => {
		for (const override of [{ columnA: undefined }, { columnB: null }, { columnA: 'nope' }]) {
			const result = buildMatchingQuestion(baseRaw(override), { random: seededRandom(1) });
			expect(result.ok).toBe(false);
			expect(result.issues).toContain('matching-pairs-invalid');
		}
	});

	it('rejects blank or non-string items', () => {
		const blank = buildMatchingQuestion(baseRaw({ columnA: ['Vitamin A', '   ', 'Vitamin C', 'Vitamin D'] }), {
			random: seededRandom(1),
		});
		expect(blank.ok).toBe(false);
		expect(blank.issues).toContain('matching-pairs-invalid');

		const nonString = buildMatchingQuestion(
			baseRaw({ columnB: ['Night blindness', 42, 'Scurvy', 'Rickets'] }),
			{ random: seededRandom(1) }
		);
		expect(nonString.ok).toBe(false);
		expect(nonString.issues).toContain('matching-pairs-invalid');
	});

	it('rejects a duplicate item within a column', () => {
		const duplicateA = buildMatchingQuestion(
			baseRaw({ columnA: ['Vitamin A', 'Vitamin A', 'Vitamin C', 'Vitamin D'] }),
			{ random: seededRandom(1) }
		);
		expect(duplicateA.ok).toBe(false);
		expect(duplicateA.issues).toContain('matching-pairs-invalid');

		const duplicateB = buildMatchingQuestion(
			baseRaw({ columnB: ['Scurvy', 'Scurvy', 'Rickets', 'Beriberi'] }),
			{ random: seededRandom(1) }
		);
		expect(duplicateB.ok).toBe(false);
		expect(duplicateB.issues).toContain('matching-pairs-invalid');
	});

	it('rejects items over the structural length cap', () => {
		const longItem = `Vitamin ${'A'.repeat(MATCHING_ITEM_MAX_CHARS)}`;
		const result = buildMatchingQuestion(baseRaw({ columnA: [longItem, 'Vitamin B1', 'Vitamin C', 'Vitamin D'] }), {
			random: seededRandom(1),
		});
		expect(result.ok).toBe(false);
		expect(result.issues).toContain('matching-item-too-long');
	});
});

describe('buildMatchingQuestion output contract', () => {
	it('returns four options that are all full A-D permutations', () => {
		const result = buildMatchingQuestion(baseRaw(), { random: seededRandom(7) });
		expect(result.ok).toBe(true);
		const { question } = result;
		expect(question.format).toBe('matching');
		expect(question.options).toHaveLength(4);
		expect(new Set(question.options).size).toBe(4);
		for (const option of question.options) {
			expect(parseCombination(option)).not.toBeNull();
		}
		expect(parseCombination(question.answer)).not.toBeNull();
		expect(question.options).toContain(question.answer);
	});

	it('keeps exactly one correct option', () => {
		const result = buildMatchingQuestion(baseRaw(), { random: seededRandom(3) });
		const correct = result.question.options.filter((option) => option === result.question.answer);
		expect(correct).toHaveLength(1);
	});

	it('uses the scrambled display order of column B', () => {
		const raw = baseRaw();
		const result = buildMatchingQuestion(raw, { random: seededRandom(11) });
		const { columnB } = result.question;
		expect(columnB).toHaveLength(MATCHING_PAIR_COUNT);
		expect([...columnB].sort()).toEqual([...raw.columnB].sort());
		// The stored answer must match the stored display order, so the paper
		// never contradicts what the learner sees.
		const keyLetters = parseCombination(result.question.answer);
		const displayIndexByItem = new Map(columnB.map((item, index) => [item, index]));
		raw.columnB.forEach((match, row) => {
			const displayLetter = String.fromCharCode(65 + displayIndexByItem.get(match));
			expect(keyLetters[row]).toBe(displayLetter);
		});
	});

	it('keeps every distractor at least two positions away from the key', () => {
		const result = buildMatchingQuestion(baseRaw(), { random: seededRandom(5) });
		const key = parseCombination(result.question.answer);
		for (const option of result.question.options) {
			if (option === result.question.answer) {
				continue;
			}
			const letters = parseCombination(option);
			const differences = letters.filter((letter, index) => letter !== key[index]).length;
			expect(differences).toBeGreaterThanOrEqual(MATCHING_DISTRACTOR_MIN_DIFFS);
		}
	});

	it('is deterministic for a fixed seed and varies the key position across seeds', () => {
		const first = buildMatchingQuestion(baseRaw(), { random: seededRandom(42) });
		const second = buildMatchingQuestion(baseRaw(), { random: seededRandom(42) });
		expect(first.question).toEqual(second.question);

		const keyPositions = new Set();
		for (let seed = 0; seed < 12; seed += 1) {
			const result = buildMatchingQuestion(baseRaw(), { random: seededRandom(seed) });
			keyPositions.add(result.question.options.indexOf(result.question.answer));
		}
		expect(keyPositions.size).toBeGreaterThan(1);
	});

	it('trims items and preserves the rationale', () => {
		const result = buildMatchingQuestion(
			baseRaw({ columnA: ['  Vitamin A ', 'Vitamin B1', 'Vitamin C', 'Vitamin D'] }),
			{ random: seededRandom(9) }
		);
		expect(result.ok).toBe(true);
		expect(result.question.columnA[0]).toBe('Vitamin A');
		expect(result.question.rationale).toBe(baseRaw().rationale);
	});
});

describe('parseCombination', () => {
	it('parses the canonical combination format', () => {
		expect(parseCombination('1-B, 2-D, 3-A, 4-C')).toEqual(['B', 'D', 'A', 'C']);
	});

	it('rejects malformed, incomplete, or repeating combinations', () => {
		for (const bad of [
			'1-B, 2-D, 3-A, 4-C, 5-E',
			'1-B, 2-D, 3-A',
			'1-B, 2-B, 3-A, 4-C',
			'B-D-A-C',
			'',
			null,
			42,
			'1-B; 2-D; 3-A; 4-C',
		]) {
			expect(parseCombination(bad)).toBeNull();
		}
	});
});
