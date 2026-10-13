## scope.included

- New src/lib/server/testResponseCache.js: TTL+LRU list cache (60s/100) and record cache (30min/100), normalized list key, invalidation, stats.
- GET /api/test list and by-id branches read through the cache and answer X-Cache: HIT|MISS on 200s.
- cache: hit|miss joins the existing api_request_events metadata for both branches.
- createTestRecord invalidates the list cache after a successful insert.
- The dev-only /api/test/db bridge clears both caches on success so e2e stays deterministic.

## scope.excluded

- HTTP/CDN caching (Cache-Control) and any cross-instance shared cache.
- Caching /api/test/hint, /api/test/submit or storage-internal getTestRecordById callers.
- Caching identity-scoped data (myAttempt) or 404 lookups.

## preserved

- Response bodies, status codes and rate-limit headers are unchanged, including 404 TEST_NOT_FOUND for unknown ids.
- api_request_events rows keep their current shape and meaning; the new cache field is additive.
- The own-attempt lookup and stripAnswerKey still run per request.

## decisions

- Cache both branches: neither payload is identity-scoped, and the list carries the request volume while the record carries the payload.
- Never cache errors or null lookups: a cached 404 would pin a just-created id.
- 60s list TTL bounds cross-instance staleness for newly generated papers; the creating instance is invalidated immediately.
- Per-instance caching is accepted because a miss is always correct and the TTL is the safety net; the cache is never relied on for correctness.
- X-Cache plus the metadata field make the hit rate observable in e2e today and in telemetry later.
- The createTestRecord invalidation line is covered by the cache layer's invalidation tests and exercised end-to-end via the shared clear path in the e2e bridge; the 60s TTL still bounds staleness if it were ever dropped.

