// Failure modes S1-S13 were written in tasks/plan-intent-capture.md before
// this file and before src/lib/server/intentCapture.js existed.

import { describe, expect, it } from 'vitest';
import { buildOriginalRequest, sanitizeIntentCapture } from './intentCapture.js';

function baseCapture() {
	return {
		thread: ['python built-in data structures'],
		plan: {
			topic: 'python built-in data structures',
			testType: 'multiple-choice',
			difficulty: 'advanced',
			numQuestions: 20,
			examId: null,
			isFullExam: false,
			language: 'english',
		},
		provenance: {
			topicSource: 'span',
			parseMode: 'turn',
			fieldConfidence: { topic: 0.8, exam: null },
			explicit: { numQuestions: true },
			answers: { topic: 'python' },
			askedFields: ['difficulty'],
			skippedFields: [],
			round: 1,
		},
	};
}

describe('sanitizeIntentCapture failure modes', () => {
	it('S1: rejects non-object input', () => {
		expect(sanitizeIntentCapture(null)).toBeNull();
		expect(sanitizeIntentCapture(undefined)).toBeNull();
		expect(sanitizeIntentCapture('python')).toBeNull();
		expect(sanitizeIntentCapture(42)).toBeNull();
		expect(sanitizeIntentCapture([])).toBeNull();
	});

	it('S2/S13: requires a non-empty thread', () => {
		expect(sanitizeIntentCapture({ ...baseCapture(), thread: 'nope' })).toBeNull();
		expect(sanitizeIntentCapture({ ...baseCapture(), thread: [] })).toBeNull();
		expect(sanitizeIntentCapture({ ...baseCapture(), thread: ['  ', 42, null] })).toBeNull();
	});

	it('S3/S4: drops invalid messages and slices long ones', () => {
		const long = 'x'.repeat(1500);
		const capture = sanitizeIntentCapture({
			...baseCapture(),
			thread: ['python', '', 42, { text: 'data structures' }, long],
		});
		expect(capture.thread.map((message) => message.text)).toEqual([
			'python',
			'data structures',
			'x'.repeat(1000),
		]);
		expect(capture.thread.every((message) => message.role === 'user')).toBe(true);
	});

	it('S5: keeps only the last eight messages', () => {
		const thread = Array.from({ length: 10 }, (_, index) => `message ${index + 1}`);
		const capture = sanitizeIntentCapture({ ...baseCapture(), thread });
		expect(capture.thread).toHaveLength(8);
		expect(capture.thread[0].text).toBe('message 3');
		expect(capture.thread[7].text).toBe('message 10');
	});

	it('S6: drops the oldest messages until the total fits', () => {
		const thread = Array.from({ length: 5 }, (_, index) => `${index}:${'y'.repeat(899)}`);
		const capture = sanitizeIntentCapture({ ...baseCapture(), thread });
		expect(capture.thread).toHaveLength(4);
		expect(capture.thread[0].text.startsWith('1:')).toBe(true);
	});

	it('S7: strips invisible characters and collapses whitespace', () => {
		const capture = sanitizeIntentCapture({
			...baseCapture(),
			thread: ['python\u200b built\u0000  in\tdata structures'],
		});
		expect(capture.thread[0].text).toBe('python built in data structures');
	});

	it('S8/S9: drops unknown provenance keys and bounds strings', () => {
		const capture = sanitizeIntentCapture({
			...baseCapture(),
			provenance: {
				...baseCapture().provenance,
				hacker: 'payload',
				topicSource: 's'.repeat(80),
				answers: Object.fromEntries(
					Array.from({ length: 30 }, (_, index) => [`key${index}`, 'a'.repeat(200)])
				),
			},
		});
		expect(capture.provenance).not.toHaveProperty('hacker');
		expect(capture.provenance.topicSource.length).toBeLessThanOrEqual(32);
		expect(Object.keys(capture.provenance.answers)).toHaveLength(24);
		expect(Object.values(capture.provenance.answers).every((value) => value.length <= 64)).toBe(
			true
		);
	});

	it('S10: drops non-finite or out-of-range confidences', () => {
		const capture = sanitizeIntentCapture({
			...baseCapture(),
			provenance: {
				...baseCapture().provenance,
				fieldConfidence: { topic: 'NaN', exam: 2, isExam: 0.5 },
			},
		});
		expect(capture.provenance.fieldConfidence).toEqual({ isExam: 0.5 });
	});

	it('S11: drops invalid explicit and answer values', () => {
		const capture = sanitizeIntentCapture({
			...baseCapture(),
			provenance: {
				...baseCapture().provenance,
				explicit: { topic: 'yes', difficulty: true },
				answers: { topic: 42, difficulty: 'advanced' },
			},
		});
		expect(capture.provenance.explicit).toEqual({ difficulty: true });
		expect(capture.provenance.answers).toEqual({ difficulty: 'advanced' });
	});

	it('S12: normalizes the plan and clamps bad values', () => {
		const capture = sanitizeIntentCapture({
			...baseCapture(),
			plan: {
				topic: 'physics',
				testType: 'essay',
				difficulty: 'impossible',
				numQuestions: 999,
				examId: 'not-an-exam',
				language: 'klingon',
			},
		});
		expect(capture.plan).toMatchObject({
			topic: 'physics',
			testType: 'multiple-choice',
			difficulty: 'intermediate',
			numQuestions: 200,
			examId: null,
			language: 'english',
		});
	});

	it('keeps a valid capture intact', () => {
		const capture = sanitizeIntentCapture(baseCapture());
		expect(capture).toMatchObject({
			thread: [{ role: 'user', text: 'python built-in data structures' }],
			plan: { topic: 'python built-in data structures', numQuestions: 20 },
			provenance: { topicSource: 'span', parseMode: 'turn', round: 1 },
		});
	});
});

describe('buildOriginalRequest', () => {
	it('joins the thread and truncates to the cap', () => {
		expect(
			buildOriginalRequest([
				{ role: 'user', text: 'python built-in data structures' },
				{ role: 'user', text: '20 hard questions' },
			])
		).toBe('python built-in data structures | 20 hard questions');
		expect(buildOriginalRequest([])).toBe('');
		const long = buildOriginalRequest([{ role: 'user', text: 'z'.repeat(2000) }]);
		expect(long).toHaveLength(1000);
	});
});
