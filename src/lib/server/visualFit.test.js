import { describe, expect, it } from 'vitest';
import { buildVisualFitQuestions, deriveVisualFit } from './visualFit.js';

/** Builds a Jev Choice answer the way the SDK returns one. */
function choice(selected, probabilities, confidence = 0.9) {
	return { type: 'choice', choice: selected, probabilities, confidence };
}

const UNKNOWN = { category: 'unknown', confidence: null, suggested: false };

describe('deriveVisualFit', () => {
	it('suggests a visual explanation when worth_it is confident', () => {
		expect(
			deriveVisualFit({
				visual_fit: choice('worth_it', {
					worth_it: 0.83,
					too_vague: 0.1,
					not_visual: 0.07,
				}),
			})
		).toEqual({ category: 'worth_it', confidence: 0.83, suggested: true });
	});

	it('keeps the category but withholds the suggestion below the 0.6 threshold', () => {
		expect(
			deriveVisualFit({
				visual_fit: choice('worth_it', {
					worth_it: 0.59,
					too_vague: 0.1,
					not_visual: 0.07,
				}),
			})
		).toEqual({ category: 'worth_it', confidence: 0.59, suggested: false });
	});

	it('suggests at exactly the threshold (>= 0.6)', () => {
		expect(
			deriveVisualFit({
				visual_fit: choice('worth_it', { worth_it: 0.6, too_vague: 0.1, not_visual: 0.07 }),
			})
		).toEqual({ category: 'worth_it', confidence: 0.6, suggested: true });
	});

	it('never suggests too_vague, however sure the judge is', () => {
		expect(
			deriveVisualFit({
				visual_fit: choice('too_vague', {
					too_vague: 0.9,
					worth_it: 0.06,
					not_visual: 0.04,
				}),
			})
		).toEqual({ category: 'too_vague', confidence: 0.9, suggested: false });
	});

	it('takes the highest-probability category, not the first key present', () => {
		expect(
			deriveVisualFit({
				visual_fit: choice('not_visual', { too_vague: 0.4, not_visual: 0.7 }),
			})
		).toEqual({ category: 'not_visual', confidence: 0.7, suggested: false });
	});

	it('breaks a probability tie with the criteria order', () => {
		// worth_it and too_vague both sit at 0.5; criteria order puts worth_it
		// first, so the tie resolves to worth_it (still below the 0.6 bar).
		expect(
			deriveVisualFit({
				visual_fit: choice('too_vague', { worth_it: 0.5, too_vague: 0.5, not_visual: 0 }),
			})
		).toEqual({ category: 'worth_it', confidence: 0.5, suggested: false });
	});

	it('returns unknown for missing or malformed answers', () => {
		expect(deriveVisualFit()).toEqual(UNKNOWN);
		expect(deriveVisualFit({})).toEqual(UNKNOWN);
		expect(deriveVisualFit({ visual_fit: { type: 'noul', noul: 0.9 } })).toEqual(UNKNOWN);
		expect(deriveVisualFit({ visual_fit: choice('banana', { worth_it: 0.9 }) })).toEqual(
			UNKNOWN
		);
	});
});

describe('buildVisualFitQuestions', () => {
	it('builds one Choice question over the three verdict categories', () => {
		const questions = buildVisualFitQuestions({ topic: 'X', question: 'Q?', answer: 'A' });
		expect(Object.keys(questions)).toEqual(['visual_fit']);

		const { visual_fit: question } = questions;
		expect(question.type).toBe('choice');
		expect(Object.keys(question.criteria)).toEqual(['worth_it', 'too_vague', 'not_visual']);
		for (const criterion of Object.values(question.criteria)) {
			expect(typeof criterion).toBe('string');
			expect(criterion.length).toBeGreaterThan(0);
		}
	});
});
