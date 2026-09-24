import { describe, expect, it } from 'vitest';
import { computeAttemptMarks } from './marks';

const sections = [
	{
		id: 'a',
		name: 'Section A',
		marksPerQuestion: 2,
		negativeMarks: 0.5,
		questionIndexes: [0, 1],
	},
	{
		id: 'b',
		name: 'Section B',
		marksPerQuestion: 4,
		negativeMarks: 0,
		questionIndexes: [2],
	},
];
const questions = [
	{ question: 'Q1', answer: 'A1' },
	{ question: 'Q2', answer: 'A2' },
	{ question: 'Q3', answer: 'A3' },
];

describe('computeAttemptMarks', () => {
	it('returns null for a paper without sections', () => {
		expect(computeAttemptMarks({ questions, answers: {}, sections: [] })).toBeNull();
		expect(computeAttemptMarks({ questions, answers: {} })).toBeNull();
	});

	it('adds marks per section and applies negative marking only when set', () => {
		const result = computeAttemptMarks({
			questions,
			answers: { 0: 'A1', 1: 'WRONG', 2: 'A3' },
			sections,
		});
		expect(result).toEqual({
			marks: 5.5, // +2 correct, -0.5 wrong, +4 correct
			totalMarks: 8,
			correct: 2,
			wrong: 1,
			unanswered: 0,
		});
	});

	it('scores unanswered questions as zero and counts them', () => {
		const result = computeAttemptMarks({ questions, answers: { 0: 'A1' }, sections });
		expect(result).toMatchObject({ marks: 2, totalMarks: 8, unanswered: 2 });
	});

	it('falls back to the first section when indexes are missing', () => {
		const result = computeAttemptMarks({
			questions,
			answers: { 0: 'A1' },
			sections: [{ name: 'Whole paper', marksPerQuestion: 3, questionIndexes: [] }],
		});
		expect(result).toMatchObject({ marks: 3, totalMarks: 9 });
	});

	it('rounds floating-point noise', () => {
		const result = computeAttemptMarks({
			questions: [{ question: 'Q1', answer: 'A1' }],
			answers: { 0: 'A1' },
			sections: [{ questionIndexes: [0], marksPerQuestion: 0.1, negativeMarks: 0.2 }],
		});
		expect(result.marks).toBe(0.1);
	});

	it('treats an empty-string answer as unanswered', () => {
		const result = computeAttemptMarks({ questions, answers: { 0: '' }, sections });
		expect(result).toMatchObject({ marks: 0, unanswered: 3 });
	});
});
