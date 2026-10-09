# Change intent

## Request and outcome

DB-backed requests must stop paying a cross-Pacific round trip per statement. `vercel.json` pins the
serverless functions to the region that holds the database (`"regions": ["sin1"]`), so
`/api/test` and every other DB-backed route answers in tens of milliseconds instead of ~500 ms+.

## Context

Measured on production (`www.selftest.in`) and its database:

| Observation | Value | How it was measured |
| ----------- | ----- | ------------------- |
| Function region | `iad1` (us-east-1, Virginia) | `x-vercel-id: bom1::iad1::…` on `/`, `/exams`, `/history` (a `/practice` CDN HIT has no function) |
| Database region | `ap-southeast-1` (Singapore) | `ep-round-river-…-pooler.ap-southeast-1.aws.neon.tech` |
| `/api/test:list` p10 / p50 / p90 | 464 / 500 / 1200 ms | `api_request_events.duration_ms`, production rows only, 30 d, n=3430 |
| Requests under 400 ms | 0 % | same query |
| Real query work for that endpoint | ~15-65 ms | `EXPLAIN ANALYZE` on production: `Seq Scan on ai_test … Execution Time: 63 ms`, 1677 rows, all buffers `shared hit` |
| Warm round trip, same database from ~60 ms away | 56-71 ms/statement | timed `SELECT 1` over the app's `Pool` driver |
| One `api_request_events` INSERT | ~211 ms | timed insert from ~60 ms away; the extra ~150 ms over a read is Neon's commit |
| Paper payloads that the by-id branch returns | avg 2 KB, p90 3 KB, max 29 KB on disk | `AVG/PERCENTILE_CONT(pg_column_size(test))` |

Virginia ↔ Singapore is ~230 ms per round trip, so the flat ~500 ms p50 of `/api/test:list` is two
round trips (rate limiter + list query) rather than anything the query does — which is why the p10
floor sits at 464 ms and *nothing* completes under 400 ms.

Two consequences ruled out the alternatives:

- **Caching is the wrong lever.** An in-process cache exists to skip a read, but the read is ~15-65 ms
  of work behind a ~230 ms round trip, and a per-instance cache is empty on exactly the cold instances
  that sparse traffic (~114 requests/day) hits. An implementation of this was measured, tested and
  then **reverted unshipped** (see "Preserved behavior"); keeping it would have left ~350 lines of
  cache machinery to save single-digit milliseconds once the region is correct.
- **The telemetry write is invisible in the report.** `logApiEvent` is awaited before the response is
  returned, so it delays every request, but `durationMs` is computed *before* it, so
  `api_request_events.duration_ms` understates real server time by one write. Recorded as a
  follow-up rather than changed here: it is a telemetry-integrity decision, not a latency one.

## Scope

### Included

- `vercel.json`: `"regions": ["sin1"]`, pinning serverless functions to Singapore next to Neon.

### Excluded

- Any caching layer. It was built, measured against this traffic, and reverted as unjustified.
- Moving the database to `ap-south-1`/Mumbai with functions in `bom1` (the better end state for an
  India-first product). A Neon project's region is fixed at creation, so it needs a new project and a
  data migration; pinning functions to the existing database region is the change with no migration.
- Deferring `logApiEvent` with `waitUntil`, and replacing the DB-backed rate limiter with a cheaper
  store. Both change guarantees the repository deliberately relies on.
- Any change to route handlers, the schema, or `src/`.

## Preserved behavior

Application behavior is unchanged: no route, schema, query or response is modified. The only
difference is where the function process runs.

A previously considered change to `src/routes/api/test/+server.js` (concurrent paper + attempt reads,
with an id guard so a non-numeric `id` still answers 404) was **reverted before shipping**. Once round
trips cost ~1-5 ms instead of ~230 ms, it would have saved ~2-4 ms while adding a wasted attempt
query on every 404 and an extra validation branch. None of it remains in the tree.

## Test changes

None. No test was added, modified, skipped or deleted by this change, and the reverted work left the
suite exactly as it was (no cache spec, no cache unit test).

## Decisions and constraints

- **`sin1` rather than `bom1`.** Co-locating with the database removes the ~230 ms per statement;
  moving functions to Mumbai instead would leave the database a 60 ms hop away and would require a
  Neon migration. Singapore also improves SSR for Indian users (Mumbai → Singapore is ~60 ms versus
  ~230 ms to Virginia).
- **One line, no comments.** `vercel.json` is strict JSON, so the rationale lives here rather than in
  the file.
- **The plan must allow a single function region.** `regions` is documented as the default region for
  serverless functions; Hobby permits one region, so this is within it.
- **This is a deployment-topology change and cannot be verified locally.** `regions` is applied by
  Vercel at deploy time; the build output does not encode it. Confirmation after deploy: `x-vercel-id`
  should become `bom1::sin1`, and `/api/test:list` p50 should fall from ~500 ms to ~60-80 ms.

## Verification

- `npm run lint`, `npm run test`, `npm run check` — the tree must be back to its pre-change state plus
  one config line, with the suite passing.
- `npm run verify:vercel` — the repository's own Vercel-output check, since this change touches the
  Vercel configuration.
- `npm run test:e2e` — the full suite must pass unmodified, confirming the revert left nothing behind.
- Post-deploy (human, needs a deployment): `x-vercel-id` contains `sin1`, and
  `npm run telemetry:report -- --days=7` shows `/api/test:list` p50 in the tens of milliseconds.
