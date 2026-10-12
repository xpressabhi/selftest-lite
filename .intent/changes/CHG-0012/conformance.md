# Conformance record

> Complete at `conformance_review`. Keep it factual and short; scale detail to the change.

## Outcome

`GET /api/test` serves both read branches from an in-process TTL+LRU cache:
list pages keyed by their normalized query tuple (60 s / 100 entries) and paper
records by id (30 min / 100 entries). `createTestRecord` invalidates the list
cache after a successful insert, and the dev-only `/api/test/db` bridge clears
both caches so the e2e suite stays deterministic. Both branches answer
`X-Cache: HIT|MISS` on 200s and record `cache: hit|miss` in their
`api_request_events` metadata. Nothing else about the endpoint changed.

Change `CHG-0012` revision 1, proposal digest
`sha256:9f1864d9858f9209d89bce590fd583b577fa09fcc3cdd0c6d34f587cf5df6936`.

## Verification

| Command                        | Result                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `npm run lint`                 | pass, no output                                                                                 |
| `npm run test`                 | **992 passed / 79 files** (9 new tests for the cache module; every pre-existing test unchanged) |
| `npm run check`                | **check-build-mode: OK — 195 chunks**, no DEV-only code, service worker present                 |
| `npm run test:e2e`             | **191 passed (1.8 min)** — the 188 pre-existing plus 3 new cache specs, no flakes               |
| `test-results/e2e-artifact.json` | 191 passed / 0 failed, stamped `58294dc` (dirty), all 3 cache specs attached                    |

What the new specs prove on the live endpoint: a repeated list read MISSes then
HITs with an identical body; a seeded paper MISSes then HITs with an identical
body and a stripped answer key; unknown ids stay 404 and are never cached; a
seed through the dev bridge makes the next list read fresh instead of serving
the cached empty result.

## Test changes

Additions only, matching the proposal:

- `src/lib/server/testResponseCache.test.js` (new): 9 cases — miss/hit stats,
  TTL expiry, LRU eviction order, key normalization, failed loads not cached,
  null records not cached, list invalidation leaving records cached.
- `tests/e2e/test-cache.e2e.js` (new): 3 specs.

No pre-existing test was modified, deleted or skipped.

## Deviations and decisions

- **An incorrect assumption was removed from the spec, not worked around.** The
  first draft asserted `x-ratelimit-limit` on a 200 response; this route sends
  rate-limit headers only on 429s, so the assertion was wrong. It was dropped;
  limiter behavior stays covered by `security-hardening.e2e.js`.
- **The HIT assertions re-warm immediately before reading.** The dev server is
  shared by parallel spec workers and any worker's bridge seed clears the
  cache; a miss is always correct, so re-warming removes a race without
  weakening the claim.
- **`createTestRecord`'s invalidation line is covered at both ends.** The cache
  layer's invalidation is unit-tested, and the shared clear function is
  exercised end-to-end through the bridge; if the line were ever dropped, the
  60 s list TTL still bounds staleness rather than breaking correctness.
- **No latency number is claimed.** A hit removes one database round trip (list
  3→2, by-id 4→3 for anonymous callers); the hit rate is now observable through
  the `cache` metadata field, and the report can adopt it later.

## Approval constraints

Not required. `.intent/config.yaml` has `review.required: false`, the requested
outcome was unambiguous, and the protected-path test additions are declared in
the proposal.
