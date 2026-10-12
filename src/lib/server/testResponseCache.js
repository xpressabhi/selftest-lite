// In-memory, per-process read caches for GET /api/test.
//
// ai_test rows are append-only: no UPDATE touches a column these reads serve
// (created_by_user_id is never projected) and no code deletes rows. A paper
// record is therefore immutable, and a list read can only miss newer entries
// at the top. That makes both branches safe to cache with a TTL:
//
// - List pages are global corpus metadata (no identity, no answer key), so one
//   entry can serve every visitor. The short TTL bounds how long a newly
//   generated paper can be absent from search on instances that did not create
//   it; the creating instance is invalidated immediately.
// - Records are the full stored row; callers strip the answer key per request.
//   A long TTL with an LRU cap keeps at most a few MB (p95 ~4 KB per row).
//
// This is a per-instance cache: serverless instances do not share it and a
// cold instance starts empty, so a cache miss is always correct and nothing
// may depend on a hit. Errors and null lookups are never stored — a cached
// 404 would pin a just-created id.

const LIST_TTL_MS = 60_000;
const LIST_MAX_ENTRIES = 100;
const RECORD_TTL_MS = 30 * 60_000;
const RECORD_MAX_ENTRIES = 100;

/**
 * Small TTL + LRU cache. Map insertion order is the recency order: a hit
 * refreshes an entry by re-inserting it, and exceeding maxEntries evicts the
 * oldest. Entries expire lazily on read (bounded anyway by maxEntries).
 * @param {{ ttlMs: number, maxEntries: number }} options
 */
export function createTtlLruCache({ ttlMs, maxEntries }) {
	const entries = new Map();
	let hits = 0;
	let misses = 0;

	return {
		get(key) {
			const entry = entries.get(key);
			if (!entry) {
				misses += 1;
				return undefined;
			}
			if (entry.expiresAt <= Date.now()) {
				entries.delete(key);
				misses += 1;
				return undefined;
			}
			entries.delete(key);
			entries.set(key, entry);
			hits += 1;
			return entry.value;
		},
		set(key, value) {
			entries.delete(key);
			entries.set(key, { value, expiresAt: Date.now() + ttlMs });
			while (entries.size > maxEntries) {
				const oldest = entries.keys().next().value;
				entries.delete(oldest);
			}
		},
		clear() {
			entries.clear();
		},
		stats() {
			return { size: entries.size, hits, misses };
		}
	};
}

const listCache = createTtlLruCache({ ttlMs: LIST_TTL_MS, maxEntries: LIST_MAX_ENTRIES });
const recordCache = createTtlLruCache({ ttlMs: RECORD_TTL_MS, maxEntries: RECORD_MAX_ENTRIES });

/**
 * Normalizes list parameters the way listTestRecords does (trimmed search,
 * lowercased filters) so padding or case differences share one entry.
 */
export function testListCacheKey({
	search = '',
	limit = 10,
	offset = 0,
	language = 'all',
	examType = 'all'
} = {}) {
	return JSON.stringify({
		search: String(search).trim(),
		limit: Number(limit) || 10,
		offset: Number(offset) || 0,
		language: String(language).trim().toLowerCase(),
		examType: String(examType).trim().toLowerCase()
	});
}

/** Read-through for a list page. Returns the loader's value on a miss. */
export async function getCachedTestList(key, load) {
	const cached = listCache.get(key);
	if (cached !== undefined) {
		return { value: cached, cached: true };
	}
	const value = await load();
	listCache.set(key, value);
	return { value, cached: false };
}

/** Read-through for a paper record. Null lookups are returned but not stored. */
export async function getCachedTestRecord(id, load) {
	const cached = recordCache.get(id);
	if (cached !== undefined) {
		return { value: cached, cached: true };
	}
	const value = await load();
	if (value) {
		recordCache.set(id, value);
	}
	return { value, cached: false };
}

/**
 * Called after a successful insert so a paper created on this instance is
 * immediately visible to its own list reads. Other instances catch up within
 * the list TTL.
 */
export function invalidateTestListCache() {
	listCache.clear();
}

/** Dev-only e2e helper: seeds may make any cached read stale. */
export function clearTestResponseCaches() {
	listCache.clear();
	recordCache.clear();
}

/** Hit/miss observability for tests (and future telemetry). */
export function testResponseCacheStats() {
	return { list: listCache.stats(), record: recordCache.stats() };
}
