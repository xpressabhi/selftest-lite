import { describe, expect, it } from 'vitest';
import { questionTextFor } from './questionText';

// The composer is what dedupe, quality checks, and explain requests see for a
// structured question, so empty stems must still produce full context.

describe('questionTextFor', () => {
	it('composes matching columns with numbering and lettering', () => {
		const text = questionTextFor({
			format: 'matching',
			question: 'Match the vitamin with its deficiency disease.',
			columnA: ['Vitamin A', 'Vitamin B1'],
			columnB: ['Night blindness', 'Beriberi'],
		});
		expect(text).toContain('Match the vitamin with its deficiency disease.');
		expect(text).toContain('Column I: 1. Vitamin A 2. Vitamin B1');
		expect(text).toContain('Column II: A. Night blindness B. Beriberi');
	});

	it('keeps the columns when the stem is empty', () => {
		const text = questionTextFor({
			format: 'matching',
			question: '',
			columnA: ['A1'],
			columnB: ['B1'],
		});
		expect(text).toContain('Column I: 1. A1');
		expect(text).toContain('Column II: A. B1');
	});

	it('composes assertion and reason lines', () => {
		const text = questionTextFor({
			format: 'assertion-reasoning',
			question: '',
			assertion: 'Ice floats on water.',
			reason: 'Ice is less dense than liquid water.',
		});
		expect(text).toContain('Assertion (A): Ice floats on water.');
		expect(text).toContain('Reason (R): Ice is less dense than liquid water.');
	});

	it('returns the plain question for legacy formats', () => {
		expect(questionTextFor({ question: 'What is 2 + 2?' })).toBe('What is 2 + 2?');
	});

	it('composes raw model drafts that have no format marker yet', () => {
		expect(
			questionTextFor({
				assertion: 'Ice floats on water.',
				reason: 'Ice is less dense than liquid water.',
				answer: 'a',
			})
		).toContain('Assertion (A): Ice floats on water.');
		expect(
			questionTextFor({
				question: '',
				columnA: ['Vitamin A'],
				columnB: ['Night blindness'],
			})
		).toContain('Column II: A. Night blindness');
	});

	it('degrades safely on missing or malformed input', () => {
		expect(questionTextFor(null)).toBe('');
		expect(questionTextFor(undefined)).toBe('');
		expect(questionTextFor('nope')).toBe('');
		expect(questionTextFor({})).toBe('');
		expect(questionTextFor({ format: 'matching', columnA: 'nope', question: 'Only stem' })).toBe(
			'Only stem'
		);
	});
});
