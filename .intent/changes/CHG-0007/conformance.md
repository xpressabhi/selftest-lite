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

| Command                              | Result                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                       | pass, no output                                                                                                                                                     |
| `npm run test`                       | **923 passed / 75 files** — exactly the pre-change counts (the 21 cache tests are gone with the cache)                                                              |
| `npm run verify:vercel`              | **OK** — `236 sitemap URLs, 232 prerendered pages, 232 clean-URL overrides, SSR function present`                                                                   |
| `npm run test:e2e`                   | **176 passed** — exactly the pre-change count, no retries                                                                                                           |
| `node -e "require('./vercel.json')"` | valid JSON; `regions` present; all 5 `headers` entries intact                                                                                                       |
| dangling-reference grep              | no reference to `memoryCache`, `testReadCache`, `invalidateTestListCache`, `testListQueryFromRequest` or `api/test/cache` remains in `src/`, `tests/` or `scripts/` |

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
  in `bom1`: ~1-5 ms round trips _and_ a local edge. It needs a Neon project migration and a data
  move, so it is a separate change.
- **`/api/test:list` does a `Seq Scan`** over `ai_test` for its leading-wildcard `ILIKE` on
  `COALESCE(topic, test->>'topic')` (`Execution Time: 63 ms` at 1677 rows). Still cheap after the
  region fix; a trigram index on `topic` is the fix if the table grows an order of magnitude.
- **Re-measure after deploy.** Baselines to compare against: `/api/test:list` avg 738 ms / p95
  1411 ms and `/api/test:get` avg 1930 ms / p95 3397 ms (30 d, production only).

## Post-deploy verification (209 minutes of real traffic)

Re-read at `2026-10-09T12:33:40Z`, 209 minutes after the region fix went live (~09:00Z). Only real
browser traffic is counted (`user_agent LIKE 'Mozilla/%'`); the `client_key` is shared between my curl
probes and the user's browser, so the user agent is what separates them.

| Check                                   | Result                                            |
| --------------------------------------- | ------------------------------------------------- |
| `x-vercel-id` on `/` and `/api/auth/me` | `bom1::sin1::…` — edge Mumbai, function Singapore |
| 5xx since deploy, all traffic           | 0                                                 |
| DB-bound browser requests since deploy  | 105, of which 5 (4.8%) over 100 ms                |

Per route, 30 days before the deploy versus since it (mean with p50 in brackets, ms):

| Route                                             | pre n | pre mean (p50) | post n | post mean (p50) | post p90 | post max | mean speedup |
| ------------------------------------------------- | ----- | -------------- | ------ | --------------- | -------- | -------- | ------------ |
| `/api/user/history:get_user_history`              | 3343  | 992 (845)      | 21     | 50 (14)         | 70       | 473      | 19.8x        |
| `/api/test:list:list_tests`                       | 4816  | 592 (485)      | 19     | 52 (44)         | 77       | 303      | 11.4x        |
| `/api/user/state:get_user_state`                  | 12035 | 568 (188)      | 17     | 90 (17)         | 169      | 980      | 6.3x         |
| `/api/test:stats:get_test_stats`                  | 1391  | 1054 (358)     | 12     | 59 (54)         | 76       | 88       | 17.9x        |
| `/api/test:activity:test_activity`                | 868   | 593 (278)      | 11     | 23 (23)         | 38       | 38       | 25.8x        |
| `/api/user/profile/insights:get_profile_insights` | 655   | 1784 (1646)    | 5      | 33 (22)         | 84       | 84       | 54.1x        |
| `/api/user/state:upsert_user_state`               | 364   | 1707 (1597)    | 5      | 26 (27)         | 33       | 33       | 65.7x        |
| `/api/user/profile:get_user_profile`              | 646   | 998 (703)      | 5      | 10 (10)         | 17       | 17       | 99.8x        |
| `/api/exam:pattern:get_exam_pattern`              | 48    | 445 (283)      | 4      | 29 (11)         | 83       | 83       | 15.3x        |
| `/api/test:submit:submit_test`                    | 458   | 830 (699)      | 3      | 23 (20)         | 30       | 30       | 36.1x        |
| `/api/test:get:fetch_test`                        | 641   | 788 (257)      | 2      | 13 (11)         | 14       | 14       | 60.6x        |
| `/api/auth/me:resolve_session`                    | 407   | 2746 (1483)    | 1      | 23 (23)         | 23       | 23       | 119.4x       |

No DB-bound route failed to improve. The remote-dependency routes moved too but are not evidence for
this change (small n, their floor is the upstream call): `/api/generate` mean 31954 → 8122 ms (n=2),
`/api/explain` 7551 → 1436 (n=3), `/api/parse-intent` 1634 → 309 (n=4), `/api/personalize` 814 → 305
(n=26, p50 289 ms — that route's floor is the TypeSafe call, not the database).

Every one of the 5 requests over 100 ms is accounted for:

| Time (UTC)   | Route          | ms  | Cause                                                                  |
| ------------ | -------------- | --- | ---------------------------------------------------------------------- |
| 10:04:40.813 | `user/state`   | 980 | Cold start of the **shared** function — see below                      |
| 10:04:40.892 | `user/history` | 473 | Same cold start, 79 ms later                                           |
| 09:07:17.363 | `test:list`    | 303 | `search='189'`, cold buffers (the leading-wildcard `ILIKE` case above) |
| 11:27:51.130 | `user/state`   | 169 | First request from that client; cold-start class                       |
| 10:18:58.968 | `user/history` | 153 | First request from that client; cold-start class                       |

**The remaining tail is cold start, not the database.** In `.vercel/output/functions`, every route's
`.func` is a symlink to a single `![-]/catchall.func` (25 MB), so the whole app is **one** serverless
function; three different routes going slow inside the same 300 ms window (980 / 473 / 468 ms while
`personalize`'s own floor is ~290 ms) is one Lambda initialising, not three slow queries. Idle resume
is ruled out again by bucketing DB-bound requests on the gap since that client's previous request:
`>120s` (which includes Neon resume) averaged 45 ms with an 83 ms max, against 29 ms mean for 2-30 s
gaps. A keep-warm ping would buy nothing.

`npm run telemetry:report -- --days=7`: **all 13 quality gates PASS** — generate 53/53 ok, explain 0
failures, server 5xx 0, duplicate questions 0, device-profile coverage 100%. The gate line
`state/auth p95 <= 3000ms (state 2187ms / auth 1869ms)` is not a post-deploy reading: the 7-day window
is still ~96% pre-fix traffic. Post-deploy p50 on those routes is 17 ms and 23 ms.

### Correction to the trigram follow-up

The earlier follow-up said a trigram index on `topic` is the next step. Measurement says otherwise.
`ai_test` is 1,681 rows / 5.1 MB total (1.67 MB heap) and `topic` is NULL for **870 rows (52%)**, so
the production predicate falls through to the `json` column for half the table:

| Variant                                                | Execution                                         |
| ------------------------------------------------------ | ------------------------------------------------- |
| `topic ILIKE '%Bihar%'` (text only)                    | 0.6 ms, 209 buffers                               |
| `test->>'topic' ILIKE '%Bihar%'` (json only)           | 95 ms, 2,971 buffers (TOAST detoast + json parse) |
| Production predicate `COALESCE(topic, test->>'topic')` | 35 ms warm, 294 ms with cold buffers              |
| `id = 189` (primary key)                               | 2.2 ms                                            |
| Temp copy with `topic` filled for every row            | 1.2 ms                                            |

The cost is per-row JSON detoast, not the scan, so the fix is to stop reading the JSON: backfill
`topic` for the 870 NULL rows (`npm run telemetry:backfill`), and optionally convert `test` from `json`
to `jsonb` (measured 2.9x on this query). That is ~29x on the search path; a trigram index needs
`CREATE EXTENSION pg_trgm` (not installed — `installed_version` is null) plus a GIN index on the
COALESCE expression, and only pays off an order of magnitude more rows. Numeric searches also filter
`CAST(id AS TEXT) ILIKE '%189%'`; an exact-match path for all-digit input would be 2.2 ms, but that
changes substring semantics into exact-match and is a product decision, not a silent one.

## Approval constraints

Not required. `.intent/config.yaml` has `review.required: false`; the change is one config line inside
the declared path.
