import { describe, expect, it } from 'vitest';
import { answerVerificationSchema, buildAnswerVerificationPrompt } from './answerVerifier';

// The verifier's network call lives in the generate route; this module only
// owns the schema and the prompt text, so everything here is offline.

function question(overrides = {}) {
	return {
		question: 'What is the SI unit of force?',
		rationale: 'Newton; Joule is energy.',
		options: ['Newton', 'Joule', 'Watt', 'Pascal'],
		...overrides,
	};
}

describe('buildAnswerVerificationPrompt', () => {
	it('numbers questions in order and labels options A-D', () => {
		const prompt = buildAnswerVerificationPrompt({
			questions: [question(), question({ question: 'What is the SI unit of power?' })],
		});
		expect(prompt).toContain('Q1: What is the SI unit of force?');
		expect(prompt).toContain('Q2: What is the SI unit of power?');
		expect(prompt).toContain('  A. Newton');
		expect(prompt).toContain('  B. Joule');
		expect(prompt).toContain('  D. Pascal');
		expect(prompt).toContain('Return exactly 2 entries');
		expect(prompt.indexOf('Q1:')).toBeLessThan(prompt.indexOf('Q2:'));
	});

	it('defaults to english and honours an explicit language', () => {
		expect(buildAnswerVerificationPrompt({ questions: [question()] })).toContain(
			'LANGUAGE: english'
		);
		expect(buildAnswerVerificationPrompt({ questions: [question()], language: '' })).toContain(
			'LANGUAGE: english'
		);
		expect(
			buildAnswerVerificationPrompt({ questions: [question()], language: 'hindi' })
		).toContain('LANGUAGE: hindi');
	});

	it('falls back to numeric labels beyond F', () => {
		const options = Array.from({ length: 7 }, (_, index) => `Option ${index + 1}`);
		const prompt = buildAnswerVerificationPrompt({ questions: [question({ options })] });
		expect(prompt).toContain('  E. Option 5');
		expect(prompt).toContain('  F. Option 6');
		expect(prompt).toContain('  7. Option 7');
	});

	it('composes structured questions through questionTextFor', () => {
		const matching = {
			question: '',
			format: 'matching',
			columnA: ['Vitamin A', 'Vitamin B1'],
			columnB: ['Night blindness', 'Beriberi'],
		};
		const prompt = buildAnswerVerificationPrompt({ questions: [matching] });
		expect(prompt).toContain('Column I: 1. Vitamin A 2. Vitamin B1');
		expect(prompt).toContain('Column II: A. Night blindness B. Beriberi');

		const assertion = {
			question: '',
			format: 'assertion-reasoning',
			assertion: 'A is true.',
			reason: 'R is true.',
		};
		expect(buildAnswerVerificationPrompt({ questions: [assertion] })).toContain(
			'Assertion (A): A is true.\nReason (R): R is true.'
		);
	});

	it('never leaks a keyed answer that is not one of the options', () => {
		const prompt = buildAnswerVerificationPrompt({
			questions: [question({ answer: 'SENTINEL_KEY_NOT_AN_OPTION' })],
		});
		expect(prompt).not.toContain('SENTINEL_KEY_NOT_AN_OPTION');
	});

	it('survives questions without options', () => {
		const prompt = buildAnswerVerificationPrompt({
			questions: [{ question: 'Odd one out?' }],
		});
		expect(prompt).toContain('Q1: Odd one out?');
	});
});

describe('answerVerificationSchema', () => {
	it('accepts one string per question, including an empty list', () => {
		expect(answerVerificationSchema.safeParse({ answers: ['Newton', 'Joule'] }).success).toBe(true);
		expect(answerVerificationSchema.safeParse({ answers: [] }).success).toBe(true);
	});

	it('rejects missing or non-string answers', () => {
		for (const invalid of [{}, { answers: 'Newton' }, { answers: [1] }, { answers: null }]) {
			expect(answerVerificationSchema.safeParse(invalid).success).toBe(false);
		}
	});
});
