import { describe, expect, it } from 'vitest';
import { stripAnswerKey } from './paperRedaction';

describe('stripAnswerKey', () => {
	const paper = {
		topic: 'Physics',
		questions: [
			{ question: 'Q1?', options: ['A', 'B', 'C', 'D'], answer: 'A' },
			{ question: 'Q2?', options: ['W', 'X', 'Y', 'Z'], answer: 'Z' },
		],
	};

	it('removes answers from a bare paper', () => {
		const redacted = stripAnswerKey(paper);
		expect(redacted.topic).toBe('Physics');
		expect(redacted.questions).toHaveLength(2);
		expect(redacted.questions[0]).toEqual({
			question: 'Q1?',
			options: ['A', 'B', 'C', 'D'],
		});
		expect(redacted.questions[0].answer).toBeUndefined();
	});

	it('removes answers from a test record ({ test: paper })', () => {
		const redacted = stripAnswerKey({ id: 7, test: paper });
		expect(redacted.id).toBe(7);
		expect(redacted.test.questions[1].answer).toBeUndefined();
		expect(redacted.test.questions[1]).toEqual({
			question: 'Q2?',
			options: ['W', 'X', 'Y', 'Z'],
		});
	});

	it('keeps original answers untouched', () => {
		const redacted = stripAnswerKey(paper);
		expect(paper.questions[0].answer).toBe('A');
		expect(redacted.questions[0].answer).toBeUndefined();
	});

	it('returns non-object values as-is', () => {
		expect(stripAnswerKey(null)).toBeNull();
		expect(stripAnswerKey('x')).toBe('x');
	});

	it('returns records without questions as-is', () => {
		const record = { id: 1, test: { topic: 'Physics' } };
		expect(stripAnswerKey(record)).toBe(record);
	});
});
