import { describe, expect, it } from 'vitest';
import { artifactPayloadSchema, conceptBriefSchema } from './quizSchema';

const validBrief = {
	concept: 'Ohm law',
	title: 'Ohm law, in motion',
	summary: 'Voltage pushes current through resistance.',
	level: 'class 10',
	recipes: ['step-reveal'],
	sections: [
		{ heading: 'Setup', purpose: 'introduce the circuit', recipe: 'step-reveal' },
		{ heading: 'Compare', purpose: 'show both states', recipe: 'toggle-compare' },
	],
};

describe('conceptBriefSchema', () => {
	it('accepts a valid brief', () => {
		expect(conceptBriefSchema.safeParse(validBrief).success).toBe(true);
	});

	it('rejects unknown recipe ids at either level', () => {
		expect(conceptBriefSchema.safeParse({ ...validBrief, recipes: ['unknown'] }).success).toBe(
			false
		);
		const withBadSection = {
			...validBrief,
			sections: [
				{ heading: 'A', purpose: 'p', recipe: 'unknown' },
				{ heading: 'B', purpose: 'q', recipe: 'step-reveal' },
			],
		};
		expect(conceptBriefSchema.safeParse(withBadSection).success).toBe(false);
	});

	it('requires two to five sections', () => {
		const section = { heading: 'A', purpose: 'p', recipe: 'step-reveal' };
		expect(conceptBriefSchema.safeParse({ ...validBrief, sections: [section] }).success).toBe(
			false
		);
		expect(
			conceptBriefSchema.safeParse({ ...validBrief, sections: Array(5).fill(section) }).success
		).toBe(true);
		expect(
			conceptBriefSchema.safeParse({ ...validBrief, sections: Array(6).fill(section) }).success
		).toBe(false);
	});

	it('rejects empty strings', () => {
		expect(conceptBriefSchema.safeParse({ ...validBrief, concept: '' }).success).toBe(false);
		expect(
			conceptBriefSchema.safeParse({
				...validBrief,
				sections: [
					{ heading: '', purpose: 'p', recipe: 'step-reveal' },
					{ heading: 'B', purpose: 'q', recipe: 'step-reveal' },
				],
			}).success
		).toBe(false);
	});
});

describe('artifactPayloadSchema', () => {
	it('accepts html, css and js', () => {
		expect(
			artifactPayloadSchema.safeParse({ html: '<div></div>', css: '', js: '' }).success
		).toBe(true);
	});

	it('requires every field', () => {
		expect(artifactPayloadSchema.safeParse({ html: '<div></div>', css: '' }).success).toBe(false);
		expect(artifactPayloadSchema.safeParse({ css: '', js: '' }).success).toBe(false);
	});
});
