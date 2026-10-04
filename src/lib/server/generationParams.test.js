import { describe, expect, it } from 'vitest';
import { resolveGenerationParams } from './generationParams';
import { MAX_QUESTIONS, MIN_QUESTIONS } from './quizConfig';
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
	// numQuestions drives ceil(count / BATCH_SIZE) model batches per section, and
	// a full-exam request fans out across up to 20 sections concurrently. Every
	// source here can be a pattern or constraint rather than the user's own
	// request, and MAX_QUESTIONS on the request body did not cover them, so the
	// clamp lives at the single point where they are merged.
	const fanOut = (numQuestions) =>
		resolveGenerationParams({
			request: { difficulty: 'intermediate', numQuestions, testType: 'multiple-choice' },
		}).numQuestions;

	it.each([
		['a pattern section', 9999, MAX_QUESTIONS],
		['a profile-adapted count', 5_000, MAX_QUESTIONS],
		['a zero count', 0, MIN_QUESTIONS],
		['a negative count', -50, MIN_QUESTIONS],
		['a fractional count', 12.7, 12],
		['Infinity', Number.POSITIVE_INFINITY, MAX_QUESTIONS],
	])('clamps %s', (_label, input, expected) => {
		expect(fanOut(input)).toBe(expected);
	});

	// A count no source can supply falls back to the request default, so a
	// malformed pattern degrades to a normal paper rather than a stub.
	it.each([
		['NaN', Number.NaN, MIN_QUESTIONS],
		['a non-numeric string', 'twelve', MIN_QUESTIONS],
	])('falls back to the request minimum when the request itself is %s', (_l, input, expected) => {
		expect(fanOut(input)).toBe(expected);
	});

	it('prefers the request default over the minimum when only the merge is unusable', () => {
		const fromPattern = resolveGenerationParams({
			request: { difficulty: 'intermediate', numQuestions: 15, testType: 'multiple-choice' },
			section: { questionCount: Number.NaN, questionTypes: [] },
		});
		expect(fromPattern.numQuestions).toBe(15);
	});

	it('leaves an in-range count untouched', () => {
		expect(fanOut(25)).toBe(25);
		expect(fanOut(1)).toBe(1);
		expect(fanOut(MAX_QUESTIONS)).toBe(MAX_QUESTIONS);
	});
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
