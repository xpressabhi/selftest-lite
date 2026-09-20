import { describe, expect, it } from 'vitest';
import {
	RECENT_CACHE_TTL_MS,
	isCacheFresh,
	mergeRecentTests,
	normalizeLocalEntry,
	normalizeServerEntry,
	readRecentCache,
} from './recentTests.js';

const LOCAL = [
	{ id: 3, topic: 'Physics', totalQuestions: 10, test_mode: 'quiz-practice' },
	{ id: 'review-1', topic: 'Chem retry', questions: [{}, {}] },
];

const SERVER = [
	{ id: 5, topic: 'Maths', num_questions: 10, test_mode: 'quiz-practice' },
	{ id: 3, topic: 'Physics', num_questions: 10, test_mode: 'quiz-practice' },
];

describe('mergeRecentTests', () => {
	it('keeps server order and appends local-only entries without duplicates', () => {
		const merged = mergeRecentTests({ local: LOCAL, server: SERVER, hidden: [] });
		expect(merged.map((entry) => String(entry.id))).toEqual(['5', '3', 'review-1']);
	});

	it('drops hidden ids and caps the list', () => {
		const merged = mergeRecentTests({ local: LOCAL, server: SERVER, hidden: ['5'], limit: 2 });
		expect(merged.map((entry) => String(entry.id))).toEqual(['3', 'review-1']);
	});

	it('falls back to local when the server list is empty', () => {
		const merged = mergeRecentTests({ local: LOCAL, server: [], hidden: [] });
		expect(merged.map((entry) => String(entry.id))).toEqual(['3', 'review-1']);
	});
});

describe('normalize entries', () => {
	it('normalizes both shapes to one view model', () => {
		expect(normalizeServerEntry(SERVER[0])).toMatchObject({
			id: '5',
			topic: 'Maths',
			totalQuestions: 10,
			isFullExam: false,
		});
		expect(normalizeLocalEntry(LOCAL[1])).toMatchObject({
			id: 'review-1',
			totalQuestions: 2,
		});
		expect(normalizeLocalEntry({ topic: 'no id' })).toBeNull();
	});
});

describe('recent cache TTL', () => {
	it('treats fresh caches as fresh and malformed ones as stale', () => {
		const now = Date.now();
		expect(isCacheFresh(now - 1000, now)).toBe(true);
		expect(isCacheFresh(now - RECENT_CACHE_TTL_MS - 1000, now)).toBe(false);
		expect(isCacheFresh(null, now)).toBe(false);
		expect(readRecentCache({ at: now, tests: SERVER })).not.toBeNull();
		expect(readRecentCache({ at: 'yesterday', tests: SERVER })).toBeNull();
		expect(readRecentCache(null)).toBeNull();
	});
});
