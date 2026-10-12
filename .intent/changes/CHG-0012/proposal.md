# Change intent

## Request and outcome

"can we implement in memory caching for test to speed up /api/test endpoint?"

`GET /api/test` serves both of its read branches from an in-process TTL+LRU
cache: list pages by their normalized query tuple for up to 60 s, and immutable
paper records by id for up to 30 min. A cache hit removes one database round
trip from the request; rate limiting, identity lookup, response shapes and API
events are unchanged.

## Context

- The list branch (`?q=…`) costs 3 database round trips (rate limiter, list
  query, API event) and the record branch (`?id=…`) costs 4 (rate limiter,
  record, own attempt, API event). On serverless Neon those round trips dominate
  the observed 0.7–2 s latency in `api_request_events`.
- `ai_test` rows are append-only: no UPDATE touches a column a read projection
  returns (`created_by_user_id` is not served) and no code deletes rows. A
  record read is immutable; a list read can only miss newer entries at the top.
- Records are small — p50 2.0 KB, p95 4.1 KB, max 29.5 KB over 1,693 rows
  (measured on production) — so an LRU of 100 costs a few MB at most. List rows
  are metadata only and far smaller.
- Vercel functions are per-instance: the cache is best effort, not a shared
  tier. The TTL is the staleness bound between instances; a cold instance starts
  empty.
- E2E specs seed `ai_test` through the dev-only `/api/test/db` bridge; without a
  clear, a seeded row can be missed by a cached list query inside its TTL.

## Scope

### Included

- New `src/lib/server/testResponseCache.js`: a generic TTL+LRU cache factory,
  the list cache (60 s / 100 entries), the record cache (30 min / 100 entries),
  a normalized `testListCacheKey`, invalidation, clearing and hit/miss stats.
- `GET /api/test` reads through the cache on both branches and answers
  `X-Cache: HIT|MISS` on 200s; `cache: hit|miss` joins the existing
  `api_request_events` metadata for both routes.
- `createTestRecord` invalidates the list cache after a successful insert, so a
  paper generated on this instance appears immediately.
- The dev-only `/api/test/db` seed bridge clears both caches on success so the
  e2e suite stays deterministic.
- New unit tests for the cache module and a new e2e spec for the endpoint.

### Excluded

- HTTP/CDN caching (`Cache-Control`) and any cross-instance shared cache.
- Caching the other routes that call `getTestRecordById` (`/api/test/hint`,
  `/api/test/submit`) or storage-internal callers.
- In-flight request coalescing.
- Caching identity-scoped data (the `myAttempt` payload) or 404 lookups.

## Preserved behavior

- Response bodies, status codes (including `404 TEST_NOT_FOUND`), rate-limit
  headers and `api_request_events` rows keep their current shape and meaning.
- The own-attempt lookup and `stripAnswerKey` still run per request.
- No pre-existing test is modified, deleted or skipped.

## Test changes

None to pre-existing tests. Additions under protected paths:

- `src/lib/server/testResponseCache.test.js` (new): miss/hit, TTL expiry, LRU
  eviction, key normalization, null lookups not cached, loader errors not
  cached, list invalidation scoping.
- `tests/e2e/test-cache.e2e.js` (new): MISS→HIT with identical bodies for list
  and record branches; distinct keys stay separate; seeding through the bridge
  makes the next list read fresh; unknown id stays uncached; rate-limit headers
  intact.

## Decisions and constraints

- Cache both branches: the list carries the request volume, the record the
  payload, and neither payload is identity-scoped, so both are shareable.
- Never cache errors or null lookups; a cached 404 could pin a just-created id.
- 60 s list TTL is the product trade-off: a newly generated test can be absent
  from search for at most a minute on other instances; the instance that created
  it is invalidated immediately.
- Per-instance caching is accepted with the TTL as the safety net; a cache miss
  is always correct, so correctness never depends on the cache.
- `X-Cache` and the metadata field make the hit rate observable in e2e now and
  in telemetry later.

## Verification

- `npm run lint`, `npm run test`, `npm run check`, `npm run test:e2e` all pass;
  the unit suite grows by the new cache tests and e2e by the new spec.
- The new e2e spec asserts cache headers and freshness deterministically;
  `test-results/e2e-artifact.json` records the results with attached evidence.
- Manual spot check: two identical list requests return MISS then HIT on one
  instance.
