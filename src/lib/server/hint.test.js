import { describe, expect, it } from 'vitest';
import {
	HINT_DWELL_SEC,
	HINT_SKIP_STREAK,
	MAX_HINTS_PER_TEST,
	pickElimination,
	sanitizeHintedIndexes,
	shouldOfferHint,
	verifyEliminated,
} from './hint.js';

const QUESTION = {
	question: 'What is 2 + 2?',
	options: ['3', '4', '5', '6'],
	answer: '4',
};

describe('pickElimination', () => {
	it('eliminates exactly two wrong options, never the answer', () => {
		const eliminated = pickElimination(QUESTION);
		expect(eliminated).toHaveLength(2);
		for (const index of eliminated) {
			expect(QUESTION.options[index]).not.toBe(QUESTION.answer);
		}
	});

	it('is deterministic for the same question', () => {
		expect(pickElimination(QUESTION)).toEqual(pickElimination(QUESTION));
	});

	it('excludes every option matching duplicate answer text', () => {
		const eliminated = pickElimination({
			question: 'Pick four',
			options: ['4', 'four', '4', '5'],
			answer: '4',
		});
		expect(eliminated).toHaveLength(2);
		for (const index of eliminated) {
			expect(['four', '5']).toContain(['4', 'four', '4', '5'][index]);
		}
	});

	it('returns empty when elimination is impossible', () => {
		expect(pickElimination({ question: 'x', options: ['a', 'b'], answer: 'a' })).toEqual([]);
		expect(pickElimination({ question: 'x', options: 'nope', answer: 'a' })).toEqual([]);
	});

	it('verifies eliminated indexes against the stored key', () => {
		expect(verifyEliminated(QUESTION, [0, 2])).toBe(true);
		expect(verifyEliminated(QUESTION, [1, 2])).toBe(false);
		expect(verifyEliminated(QUESTION, [0])).toBe(false);
		expect(verifyEliminated(QUESTION, [0, 0])).toBe(false);
		expect(verifyEliminated(QUESTION, [0, 9])).toBe(false);
	});

	it('sanitizes a hinted-indexes payload for storage', () => {
		const questions = [QUESTION, QUESTION];
		expect(sanitizeHintedIndexes({ 0: [0, 2], 1: [0, 2] }, questions)).toEqual({
			0: [0, 2],
			1: [0, 2],
		});
		// Drops unknown questions, cheating payloads, and past the cap.
		expect(
			sanitizeHintedIndexes({ 0: [1, 2], 5: [0, 2], foo: [0, 1] }, questions)
		).toEqual({});
		expect(
			sanitizeHintedIndexes({ 0: [0, 1], 1: [0, 1], 2: [0, 1], 3: [0, 1] }, questions)
		).toEqual({});
		expect(sanitizeHintedIndexes('nope', questions)).toEqual({});
	});
});

describe('shouldOfferHint', () => {
	it('offers after a long dwell on an unanswered question', () => {
		expect(
			shouldOfferHint({ dwellSec: HINT_DWELL_SEC, consecutiveSkips: 0, offersUsed: 0, answered: false })
		).toBe(true);
	});

	it('offers on a skip streak', () => {
		expect(
			shouldOfferHint({ dwellSec: 5, consecutiveSkips: HINT_SKIP_STREAK, offersUsed: 0, answered: false })
		).toBe(true);
	});

	it('refuses when answered, capped, or cold', () => {
		expect(
			shouldOfferHint({ dwellSec: 120, consecutiveSkips: 5, offersUsed: 0, answered: true })
		).toBe(false);
		expect(
			shouldOfferHint({ dwellSec: 120, consecutiveSkips: 0, offersUsed: MAX_HINTS_PER_TEST, answered: false })
		).toBe(false);
		expect(
			shouldOfferHint({ dwellSec: 5, consecutiveSkips: 0, offersUsed: 0, answered: false })
		).toBe(false);
	});
});
