import { describe, expect, it } from 'vitest';
import { resolveGenerationParams } from './generationParams';
import { normalizeExamPattern } from './examPattern';

const pattern = normalizeExamPattern({
	examName: 'SSC CGL Tier 1',
	board: null,
	classLevel: null,
	subject: null,
	patternYear: '2026',
	durationMinutes: 60,
	totalMarks: 200,
	negativeMarking: 0.5,
	sections: [
		{
			name: 'Reasoning',
			questionTypes: ['matching'],
			questionCount: 25,
			marksPerQuestion: 2,
			negativeMarks: 0.5,
			instructions: null,
		},
	],
	generalInstructions: [],
});

const section = pattern.sections[0];

describe('resolveGenerationParams', () => {
	it('falls back to the request when nothing overrides it', () => {
		const resolved = resolveGenerationParams({
			request: { difficulty: 'intermediate', numQuestions: 10, testType: 'multiple-choice' },
		});
		expect(resolved).toMatchObject({
			difficulty: 'intermediate',
			numQuestions: 10,
			testType: 'multiple-choice',
			explicit: [],
		});
	});

	it('lets profile-derived values beat request defaults, but not exam constraints', () => {
		const fromProfile = resolveGenerationParams({
			request: { difficulty: 'beginner', numQuestions: 10, testType: 'multiple-choice' },
			resolvedDifficulty: 'advanced',
			resolvedNumQuestions: 20,
		});
		expect(fromProfile.difficulty).toBe('advanced');
		expect(fromProfile.numQuestions).toBe(20);

		const behindExam = resolveGenerationParams({
			request: { difficulty: 'beginner' },
			constraint: { defaultDifficulty: 'expert' },
			resolvedDifficulty: 'advanced',
		});
		expect(behindExam.difficulty).toBe('expert');
	});

	it('always lets an explicit user choice win', () => {
		const resolved = resolveGenerationParams({
			request: {
				difficulty: 'beginner',
				numQuestions: 5,
				testType: 'true-false',
				durationMinutes: 15,
				explicit: ['difficulty', 'numQuestions', 'testType', 'durationMinutes'],
			},
			pattern,
			section,
			constraint: { defaultDifficulty: 'expert' },
			resolvedDifficulty: 'advanced',
		});
		expect(resolved).toMatchObject({
			difficulty: 'beginner',
			numQuestions: 5,
			testType: 'true-false',
			durationMinutes: 15,
		});
	});

	it('lets a section define its count and format when nothing was touched', () => {
		const resolved = resolveGenerationParams({
			request: { difficulty: 'intermediate', numQuestions: 100, testType: 'multiple-choice' },
			pattern,
			section,
		});
		expect(resolved.numQuestions).toBe(25);
		expect(resolved.testType).toBe('matching');
	});

	it('takes the duration from the pattern unless the user changed it', () => {
		expect(
			resolveGenerationParams({
				request: { durationMinutes: 180 },
				pattern,
			}).durationMinutes
		).toBe(60);
		expect(
			resolveGenerationParams({
				request: { durationMinutes: 30, explicit: ['durationMinutes'] },
				pattern,
			}).durationMinutes
		).toBe(30);
	});

	it('ignores malformed explicit lists', () => {
		const resolved = resolveGenerationParams({
			request: { difficulty: 'intermediate', explicit: ['difficulty', 42, '', null] },
			section,
			resolvedDifficulty: 'advanced',
		});
		expect(resolved.difficulty).toBe('intermediate');
		expect(resolved.explicit).toEqual(['difficulty']);
	});
});
