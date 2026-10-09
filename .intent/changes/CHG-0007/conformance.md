# Conformance record

> Complete at `conformance_review`. Keep it factual and short; scale detail to the change.

## Outcome

`vercel.json` now pins the serverless functions to `sin1` (Singapore), the region that holds the Neon
database:

```json
{
	"framework": "sveltekit",
	"regions": ["sin1"],
	...
}
```

Change `CHG-0007` revision 1, proposal digest
`sha256:b1be375e645b1736469e76096a4cbcecf4c28e49fe8bdbfc7ab85c23a2121dbb`.

The final diff is **one added line in one file**. Everything else that had been built during the
investigation — an in-process read cache (`memoryCache.js`, `testReadCache.js`, a dev-only
`/api/test/cache` control route), its unit test and its E2E spec, the `normalizeTestListQuery`
extraction in `storage.js`, the list-cache invalidation in `/api/generate`, and the concurrent
paper+attempt read in `/api/test` — was **reverted unshipped**, because measurement showed it was not
worth its weight once the region is correct.

## Verification

| Command | Result |
| ------- | ------ |
| `npm run lint` | pass, no output |
| `npm run test` | **923 passed / 75 files** — exactly the pre-change counts (the 21 cache tests are gone with the cache) |
| `npm run verify:vercel` | **OK** — `236 sitemap URLs, 232 prerendered pages, 232 clean-URL overrides, SSR function present` |
| `npm run test:e2e` | **176 passed** — exactly the pre-change count, no retries |
| `node -e "require('./vercel.json')"` | valid JSON; `regions` present; all 5 `headers` entries intact |
| dangling-reference grep | no reference to `memoryCache`, `testReadCache`, `invalidateTestListCache`, `testListQueryFromRequest` or `api/test/cache` remains in `src/`, `tests/` or `scripts/` |

Working tree after the change: `M vercel.json` and `?? .intent/changes/CHG-0007/` only.

## Test changes

None. No test was added, modified, skipped or deleted. The suite is byte-for-byte the pre-change set:
923 unit tests across 75 files, 176 E2E tests.

## Deviations and decisions

- **The requested outcome was delivered by reverting, not by adding.** The user asked to drop changes
  that were not useful. The measurements made the call unambiguous: `/api/test:list` spends ~500 ms
  per request of which only ~15-65 ms is query work, because each of two round trips crosses
  Virginia → Singapore at ~230 ms. An in-memory cache cannot help a request whose instance is cold —
  which at ~114 requests/day is most of them — so the cache was removed rather than shipped. The
  concurrent-read refactor was removed for the same reason: worth ~2-4 ms after the fix, at the cost
  of a wasted attempt query on every 404.
- **`sin1` chosen over `bom1`.** Co-locating with the database is what removes the round-trip cost;
  moving functions to Mumbai instead would leave the database ~60 ms away and require a Neon project
  migration to a new region.
- **Not verifiable locally.** `regions` is applied by Vercel at deploy time and is not encoded in the
  build output, so `verify:vercel` confirms the output is still valid but cannot confirm the region
  took effect. Post-deploy confirmation is a human step: `x-vercel-id` should read `bom1::sin1`
  (currently `bom1::iad1`), and `/api/test:list` p50 should fall from ~500 ms to ~60-80 ms.
- **Plan constraint.** `regions` sets the default region for serverless functions and Hobby permits a
  single region, which is what this is. No `functionFailoverRegions` (Enterprise-only) was added.
- **Reverted work is not recorded as a shipped change.** `CHG-0006` described the cache and was
  deleted with the code rather than left as a record of something that does not exist in the tree; the
  measurements that justified dropping it live in this record and in `CHG-0007`'s context.

## Follow-ups (not part of this change)

- **`logApiEvent` is on the critical path but invisible in the report.** It is awaited before the
  response is returned, while `durationMs` is computed before the call, so
  `api_request_events.duration_ms` understates real server time by roughly one write (~230 ms today,
  ~150 ms once co-located). Deferring it with `event.platform.context.waitUntil(...)` would remove
  that from every API response; it was left alone because telemetry durability is a documented
  guarantee in `AGENTS.md`, not a latency knob.
- **The rate limiter's INSERT is the other mandatory write** on every request. Making it cheaper
  (edge/KV store) would change a deliberately DB-backed, fail-closed control.
- **The better end state for an India-first product** is Neon in `ap-south-1` (Mumbai) with functions
  in `bom1`: ~1-5 ms round trips *and* a local edge. It needs a Neon project migration and a data
  move, so it is a separate change.
- **`/api/test:list` does a `Seq Scan`** over `ai_test` for its leading-wildcard `ILIKE` on
  `COALESCE(topic, test->>'topic')` (`Execution Time: 63 ms` at 1677 rows). Still cheap after the
  region fix; a trigram index on `topic` is the fix if the table grows an order of magnitude.
- **Re-measure after deploy.** Baselines to compare against: `/api/test:list` avg 738 ms / p95
  1411 ms and `/api/test:get` avg 1930 ms / p95 3397 ms (30 d, production only).

## Approval constraints

Not required. `.intent/config.yaml` has `review.required: false`; the change is one config line inside
the declared path.
