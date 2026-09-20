import { describe, expect, it } from 'vitest';
import { buildPersonalizeQuestions, derivePersonalize } from './personalize.js';

function choice(selected, probabilities, confidence = 0.9) {
	return { type: 'choice', choice: selected, probabilities, confidence };
}

function noul(value) {
	return { type: 'noul', noul: value };
}

function score(value, confidence = 0.9) {
	return { type: 'score', score: value, confidence, probabilities: {} };
}

describe('buildPersonalizeQuestions', () => {
	it('builds a home fan-out with choice, score and nouls', () => {
		const questions = buildPersonalizeQuestions('home');
		expect(questions.primary_action.type).toBe('choice');
		expect(questions.exam_pressure.type).toBe('score');
		expect(questions.wants_revision.type).toBe('noul');
	});

	it('builds dynamic history candidates without leaking PII', () => {
		const questions = buildPersonalizeQuestions('history', { ids: ['a', 'b'] });
		expect(Object.keys(questions.recommended.criteria)).toContain('a');
	});
});

describe('derivePersonalize', () => {
	it('applies a confident home decision', () => {
		const result = derivePersonalize(
			'home',
			{
				primary_action: choice('review_due', { review_due: 0.85, new_quiz: 0.15 }, 0.85),
				exam_pressure: score(0.2, 0.8),
				wants_revision: noul(0.9),
				wants_new: noul(0.1),
			},
			{}
		);
		expect(result.applied).toBe(true);
		expect(result.action).toBe('review_due');
		expect(result.promote).toContain('review-queue');
	});

	it('falls back to current UI on low confidence', () => {
		const result = derivePersonalize(
			'home',
			{
				primary_action: choice('review_due', { review_due: 0.4, new_quiz: 0.35 }, 0.3),
				exam_pressure: score(0.5, 0.2),
				wants_revision: noul(0.5),
				wants_new: noul(0.5),
			},
			{}
		);
		expect(result.applied).toBe(false);
		expect(result.hide).toEqual([]);
	});

	it('prefills onboarding from a confident line', () => {
		const questions = buildPersonalizeQuestions('onboarding');
		expect(questions.class.type).toBe('choice');
		const result = derivePersonalize(
			'onboarding',
			{
				class: choice('class-10', { 'class-10': 0.85, none: 0.15 }, 0.85),
				language: choice('none', { none: 0.7, english: 0.3 }, 0.7),
			},
			{}
		);
		expect(result.applied).toBe(true);
		expect(result.prefill).toMatchObject({ class: 'class-10' });
	});
});
