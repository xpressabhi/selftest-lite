import { describe, expect, it } from 'vitest';
import { mergeRecentTests, normalizeLocalEntry, toOwnTestResults } from './recentTests.js';

const LOCAL = [
	{ id: 3, topic: 'Physics', totalQuestions: 10, test_mode: 'quiz-practice', timestamp: 30 },
	{ id: 'review-1', topic: 'Chem retry', questions: [{}, {}], timestamp: 20 },
	{ id: 1, topic: 'History', totalQuestions: 5, timestamp: 10 },
];

describe('mergeRecentTests', () => {
	it('keeps local order and normalizes entries', () => {
		const merged = mergeRecentTests({ local: LOCAL, hidden: [] });
		expect(merged.map((entry) => entry.id)).toEqual(['3', 'review-1', '1']);
		expect(merged[1]).toMatchObject({ topic: 'Chem retry', totalQuestions: 2 });
	});

	it('drops hidden ids, invalid rows, and caps the list', () => {
		const merged = mergeRecentTests({ local: LOCAL, hidden: ['3'], limit: 2 });
		expect(merged.map((entry) => entry.id)).toEqual(['review-1', '1']);

		const filtered = mergeRecentTests({ local: [...LOCAL, { topic: 'no id' }], limit: 10 });
		expect(filtered).toHaveLength(3);
	});

	it('returns an empty list for malformed input', () => {
		expect(mergeRecentTests({ local: null })).toEqual([]);
		expect(mergeRecentTests()).toEqual([]);
	});
});

describe('normalizeLocalEntry', () => {
	it('normalizes history shapes to one view model', () => {
		expect(normalizeLocalEntry(LOCAL[0])).toMatchObject({
			id: '3',
			topic: 'Physics',
			totalQuestions: 10,
			isFullExam: false,
		});
		expect(normalizeLocalEntry(LOCAL[1])).toMatchObject({
			id: 'review-1',
			totalQuestions: 2,
		});
		expect(normalizeLocalEntry({ topic: 'no id' })).toBeNull();
		expect(normalizeLocalEntry(null)).toBeNull();
	});
});

describe('toOwnTestResults', () => {
	it('returns newest-first api-shaped rows for an empty query', () => {
		const results = toOwnTestResults(LOCAL, '', {});
		expect(results.map((row) => row.id)).toEqual(['3', 'review-1', '1']);
		expect(results[0]).toEqual({
			id: '3',
			topic: 'Physics',
			test_mode: 'quiz-practice',
		});
	});

	it('caps results and marks full-exam papers', () => {
		const history = [
			{ id: 9, topic: 'JEE mock', test_mode: 'full-exam', timestamp: 40 },
			{ id: 8, topic: 'Polity', timestamp: 35 },
			{ id: 7, topic: 'Algebra', timestamp: 25 },
		];
		const results = toOwnTestResults(history, '', { limit: 2 });
		expect(results.map((row) => row.id)).toEqual(['9', '8']);
		expect(results[0].test_mode).toBe('full-exam');
	});

	it('matches topic or id substrings case-insensitively', () => {
		expect(toOwnTestResults(LOCAL, 'phys').map((row) => row.id)).toEqual(['3']);
		expect(toOwnTestResults(LOCAL, 'REVIEW').map((row) => row.id)).toEqual(['review-1']);
		expect(toOwnTestResults(LOCAL, '1').map((row) => row.id)).toEqual(['review-1', '1']);
		expect(toOwnTestResults(LOCAL, 'nothing here')).toEqual([]);
	});

	it('drops hidden ids', () => {
		const results = toOwnTestResults(LOCAL, '', { hidden: ['3', '1'] });
		expect(results.map((row) => row.id)).toEqual(['review-1']);
	});
});
