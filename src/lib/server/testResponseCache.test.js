import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clearTestResponseCaches,
	createTtlLruCache,
	getCachedTestList,
	getCachedTestRecord,
	invalidateTestListCache,
	testListCacheKey,
	testResponseCacheStats,
} from './testResponseCache';

// The cache must never be load-bearing for correctness: a miss is always
// correct, errors and null lookups are never stored, and the TTL is the
// staleness bound. These tests pin exactly those guarantees.

describe('createTtlLruCache', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns a stored value and records hit/miss stats', () => {
		const cache = createTtlLruCache({ ttlMs: 1000, maxEntries: 10 });
		expect(cache.get('a')).toBeUndefined();
		cache.set('a', 1);
		expect(cache.get('a')).toBe(1);
		expect(cache.stats()).toEqual({ size: 1, hits: 1, misses: 1 });
	});

	it('expires entries after the TTL', () => {
		vi.useFakeTimers();
		const cache = createTtlLruCache({ ttlMs: 1000, maxEntries: 10 });
		cache.set('a', 1);
		vi.advanceTimersByTime(1001);
		expect(cache.get('a')).toBeUndefined();
	});

	it('evicts the least recently used entry past maxEntries', () => {
		const cache = createTtlLruCache({ ttlMs: 1000, maxEntries: 2 });
		cache.set('a', 1);
		cache.set('b', 2);
		cache.get('a'); // refresh a, making b the least recently used
		cache.set('c', 3);
		expect(cache.get('b')).toBeUndefined();
		expect(cache.get('a')).toBe(1);
		expect(cache.get('c')).toBe(3);
	});
});

describe('test response caches', () => {
	beforeEach(() => {
		clearTestResponseCaches();
	});

	it('builds the same key for equivalent list params', () => {
		const key = testListCacheKey({
			search: '  Fractions ',
			limit: 10,
			offset: 0,
			language: 'EN',
			examType: 'All',
		});
		expect(key).toBe(
			testListCacheKey({
				search: 'Fractions',
				limit: 10,
				offset: 0,
				language: 'en',
				examType: 'all',
			})
		);
		expect(key).not.toBe(testListCacheKey({ search: 'Fractions', limit: 5 }));
		expect(key).not.toBe(testListCacheKey({ search: 'Fractions', offset: 10 }));
	});

	it('serves the list loader once and reports cached on the second call', async () => {
		const load = vi.fn(async () => [{ id: 1 }]);
		const first = await getCachedTestList('key', load);
		const second = await getCachedTestList('key', load);
		expect(first).toEqual({ value: [{ id: 1 }], cached: false });
		expect(second).toEqual({ value: [{ id: 1 }], cached: true });
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('does not cache a failed list load', async () => {
		const load = vi.fn(async () => {
			throw new Error('db down');
		});
		await expect(getCachedTestList('key', load)).rejects.toThrow('db down');
		await expect(getCachedTestList('key', load)).rejects.toThrow('db down');
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('serves records from the cache and never caches a missing record', async () => {
		const found = vi.fn(async () => ({ id: 7 }));
		expect((await getCachedTestRecord('7', found)).cached).toBe(false);
		expect((await getCachedTestRecord('7', found)).cached).toBe(true);
		expect(found).toHaveBeenCalledTimes(1);

		const missing = vi.fn(async () => null);
		expect((await getCachedTestRecord('8', missing)).value).toBeNull();
		expect((await getCachedTestRecord('8', missing)).cached).toBe(false);
		expect(missing).toHaveBeenCalledTimes(2);
	});

	it('invalidating the list cache leaves records cached', async () => {
		await getCachedTestList('key', async () => []);
		await getCachedTestRecord('9', async () => ({ id: 9 }));

		invalidateTestListCache();

		const listLoad = vi.fn(async () => []);
		expect((await getCachedTestList('key', listLoad)).cached).toBe(false);
		expect(listLoad).toHaveBeenCalledTimes(1);

		const recordLoad = vi.fn(async () => ({ id: 9 }));
		expect((await getCachedTestRecord('9', recordLoad)).cached).toBe(true);
		expect(recordLoad).not.toHaveBeenCalled();
	});

	it('reports sizes through stats', async () => {
		await getCachedTestList('a', async () => []);
		await getCachedTestRecord('1', async () => ({ id: 1 }));
		const stats = testResponseCacheStats();
		expect(stats.list.size).toBe(1);
		expect(stats.record.size).toBe(1);
	});
});
