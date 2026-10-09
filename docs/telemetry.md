# Telemetry & Product Analytics

Selftest-lite records anonymous product telemetry so feature decisions are based
on real usage instead of guesses. This document is the runbook: what is stored,
how to read it, and how to keep the data trustworthy.

## Pipeline

| Layer          | Source                                                          | Table                   | Notes                                                         |
| -------------- | --------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------- |
| Feature events | `track()` / `trackDebounced()` in `src/lib/client/telemetry.js` | `feature_events`        | Queued client-side, flushed every 30s / 20 events / on unload |
| API events     | `logApiEvent()` in `src/lib/server/storage.js`                  | `api_request_events`    | Route, status, duration, country/city, user agent             |
| Rate limits    | `rateLimiter()`                                                 | `api_rate_limit_events` | Cleaned up after 2 days                                       |

Identity: a stable anonymous `client_id` (browser) plus an optional `user_id`
after Google sign-in. Anonymous activity is backfilled to the user on login
(`backfillUserIdentity`). Localhost traffic is never tracked.

## Allowlist rules (important)

The telemetry API **drops event names that are not on the allowlist** in
`src/lib/shared/telemetryEvents.js`. A missing entry therefore loses data
silently.

- Adding a `track('new:event')` call requires adding the same name to the
  allowlist in the same commit.
- `src/lib/shared/telemetryEvents.test.js` scans every `track()` call under
  `src/` and fails when an emitted event is not allowlisted, or when an
  allowlisted event has no emit site anywhere.
- Do not add speculative names. If a feature is removed, remove its event names
  in the same change (code only — recorded data stays archived).

Run `npm run test` before shipping any telemetry change.

## Running the report

```bash
npm run telemetry:report                          # 30d sections, 7d gates
npm run telemetry:report -- --days=90             # wider trend window
npm run telemetry:report -- --days=90 --gate-days=30   # gates on the wide window too
npm run telemetry:report -- --strict              # non-zero exit when a gate fails
```

The script loads `DATABASE_URL` from `.env.local` / `.env` and is **read-only**.

Two windows are in play and they answer different questions:

| Flag        | Default | Answers                                              |
| ----------- | ------- | ---------------------------------------------------- |
| `--days`    | 30      | Descriptive sections: trend and context over time    |
| `--gate-days` | 7     | Quality gates: is the product healthy *right now*   |

Gates deliberately default to a short window. A gate answers a question about
the present, so an incident fixed three weeks ago must not keep it red — that
only teaches everyone to ignore the gate. The weekly workflow runs `--strict`,
which means a stale window there produced a permanently red build.

It prints:

- database overview and weekly activity (events, sessions, identities)
- the production / non-production split of `api_request_events`, with the count
  of excluded rows called out (see Production vs non-production below)
- retention: new vs returning identities per week
- engaged retention: cohorts that start at the first generate/test start, plus
  the drive-by share (identities that never started one)
- activation funnel: page view → generate → test start → submit → explain
- top feature events, plus allowlisted events not seen in the window
- conversational planner: client parse/clarification counts, clarifications by
  field/outcome, and server-side topic source + confidence + token usage
- API hotspots (requests, errors excluding expected 401/429, the date of the
  last such error, 401s, 429s, avg/p95 latency)
- rate-limiter requests per route (every limiter call, not only blocked ones)
- generation failures: stage/code/model breakdown, top issue codes per failing
  batch, and client-reported `generate:fail` codes
- device & network: per-identity device tier mix, top low-tier models, network
  mix per session, generate outcomes by downlink bucket, and the supported floor
- data-quality checks: null `test_mode`/`difficulty`/`language` on rows the
  generate endpoint wrote, plus how many foreign rows were skipped, server-side
  generate and explain outcomes (including how many papers came back trimmed by
  the deadline), the server 5xx count, and the count of fail-open responses
  (upstream errors served to users as a handled 200 fallback)
- quality gates (PASS/FAIL). Pass `--strict` to exit non-zero when any gate
  fails (used by the scheduled workflow).

### Production vs non-production

Vercel attaches `x-vercel-ip-country` and friends to production traffic. A local
dev server pointed at the production database, a Playwright run, or a `curl`
probe does not, so those rows carry `ip_country IS NULL`.

Those are real requests but not real users, and they were **~70% of the API
table** — one local client key alone made 11,365 requests in seven days. Every
latency average, error count and rate-limit number was a blend of a dev loop and
production. The report therefore splits them:

- API hotspots, the 5xx count, latency gates, the `>10s` gate and the
  generate/explain success rates read **production rows only**.
- The report prints the excluded row and client-key count right under the
  hotspot table, so a dev loop pointed at production stays visible instead of
  being silently filtered.

### Quality gates

Gates run over `--gate-days` (default 7) and over production rows only.

| Gate                                                | Target     |
| --------------------------------------------------- | ---------- |
| Generate success rate (server attempts)             | >= 95%     |
| Explain failure rate (server)                       | < 2%       |
| Server 5xx                                          | 0          |
| Null `test_mode` on generated tests                 | 0          |
| `/api/user/state` and `/api/auth/me` p95            | <= 3000 ms |
| Requests slower than 10s                            | < 2%       |
| Answer at A/B (served)                              | < 60%      |
| Longest-answer tell (key >1.25x longest distractor) | < 35%      |
| Duplicate questions (7d)                            | 0          |
| Non-discriminating repeated items                   | < 35%      |
| D1 retention (engaged)                              | >= 15%     |
| D7 retention (engaged)                              | >= 8%      |
| Device profile coverage                             | >= 80%     |

Notes on what each gate deliberately measures:

- **Generate / explain success** come from `api_request_events`, not client
  events. `generate:fail` only fires once the client exhausts its retries, and a
  premium rejection (`403`) is never reported as a failure at all, so the client
  funnel could show a healthier rate than the server saw. Server rows count
  every attempt, including the premium-gated ones (reported separately in the
  gate detail).
- **Server 5xx** counts responses users actually met. A row carrying
  `metadata.failOpen` (an upstream error handled with a 200 fallback) is
  reported separately and does not fail the gate.
- **Answer position and longest-answer tell** exclude `matching`,
  `assertion-reasoning` and `statement-based`. Their options are built
  server-side in a deliberate order and never shuffled, which
  `isServerBuiltFormat` in `questionQuality.js` already accounts for at
  runtime; including them here measured a shuffle the product never performs.
- **Duplicate questions** key on the composed text that `questionTextFor()`
  builds, not on `question`. An `assertion-reasoning` item stores an
  intentionally empty stem with its content in `assertion`/`reason`, so grouping
  on `question` collapsed all of them into one group of identical empty strings
  and reported them as duplicates.
- **Non-discriminating items** deduplicate per respondent before counting
  (last answer per person per item, >= 4 distinct respondents). Counting raw
  attempts let one person retaking a paper 25 times manufacture "too easy"
  items — discrimination means different people got different answers.
- **Device profile coverage** only counts sessions on or after the first
  `device:profile` row. Sessions from before that instrumentation shipped had no
  chance of passing, so the gate was mathematically unable to clear on any
  window longer than the instrumentation's own age.
- **Null `test_mode`** counts only rows the generate endpoint could have
  written. `createTestRecord()` always writes `test_mode`, `test_type` and
  `difficulty` together, so a row missing all three came from a manual insert
  or a probe, and the report lists those separately as "foreign rows ignored".
- **D1 / D7 retention are engaged retention**: an identity's cohort starts at
  its first `generate:start` / `test:start`, not at its first page view. The
  all-identity cohorts stay printed above for context, but a one-day wave of
  single-session drive-bys (crawler, campaign, or audit traffic) must not pin
  the gate red — it measures engagement, not traffic volume. Both gates report
  `inconclusive` and pass below 60 engaged identities; at that size a retention
  percentage moves by whole points on a single visitor, which is not a
  measurement. The drive-by line reports the identities the gate excludes.

## Generation failure diagnostics

Failed `/api/generate` calls store a structured `metadata.generationFailure`
object on `api_request_events` (in addition to the human-readable
`error_message`):

| Field                                             | Meaning                                                                                                                                      |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `stage`                                           | Where it failed: `quality`, `batch-validation`, `verification`, `count`, `api-limit`, `timeout`, `internal`                                  |
| `code`                                            | Client-facing error code from `classifyApiError`                                                                                             |
| `issues`                                          | `[{ index, issue }]`, e.g. `longest-answer-tell` at question 3 (capped at 50)                                                                |
| `questionStats`                                   | Option-length aggregates for the failed batch: `count`, `tellCount`, `keyLongestCount`, `maxKeyToDistractorRatio`, `avgKeyToDistractorRatio` |
| `batchIndex` / `batchTotal` / `validationAttempt` | Which batch and retry produced the failure                                                                                                   |
| `model`                                           | Model used for the failing run                                                                                                               |
| `message`                                         | Truncated error message (no question text)                                                                                                   |

Privacy rule: never add question or option text to this block. Indexes, issue
codes and aggregate stats are enough for prompt and check tuning.

```sql
SELECT
  metadata->'generationFailure'->>'stage' AS stage,
  entry.value->>'issue' AS issue,
  COUNT(*) AS n
FROM api_request_events e
CROSS JOIN LATERAL jsonb_array_elements(e.metadata->'generationFailure'->'issues') AS entry(value)
WHERE e.route = '/api/generate' AND e.status_code >= 400
  AND e.created_at >= NOW() - INTERVAL '7 days'
GROUP BY 1, 2
ORDER BY n DESC;
```

The client mirrors the final failure code, HTTP status, attempt and elapsed
seconds in the `generate:fail` event props.

## Conversational planner diagnostics

The home planner records one `api_request_events` row per
`/api/parse-intent` turn (server) plus client feature events:

| Client event                    | Props                                                                        | Meaning                               |
| ------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------- |
| `intent:parse`                  | `intent` (64 chars), `round`                                                 | A planner turn started                |
| `intent:parsed`                 | `confidence`, `isFullExam`, `round`                                          | Jev returned a plan                   |
| `intent:parse-failed`           | `round`                                                                      | The turn fell back to manual defaults |
| `intent:clarification-asked`    | `field`, `round`                                                             | A clarification question was shown    |
| `intent:clarification-answered` | `field`, `outcome` (`answered`/`skipped`), `round`                           | The user resolved it                  |
| `intent:preview`                | `source` (`local`/`jev`), `ok`, `latencyMs`, `hasTopic`, `inputTokens` (jev) | Live plan preview tick                |
| `preview:edit-toggle`           | `open`                                                                       | The plan card's Edit plan toggle      |

Server metadata on each successful turn:

| Field                | Meaning                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `provider` / `model` | Always `typesafe` / the versioned Jev model that answered               |
| `round`              | Clarification rounds used so far                                        |
| `confidence`         | Min of the turn's Choice confidences, mapped to high/medium/low         |
| `clarifyField`       | Field the turn asked about, or `null`                                   |
| `answeredFields`     | Plan fields the user answered as clarifications on this turn            |
| `topicSource`        | How the topic was produced: `span`, `exam`, `answer`, `previous`, `raw` |
| `fieldConfidence`    | Per-field probability/confidence snapshot                               |
| `usage`              | Jev input/output tokens                                                 |

Use it to answer: how often does the planner ask questions (and about what),
how often are topics span-extracted vs raw, is failure rate stable, and whether
Hindi turns show lower confidence or more failures.

## Device & network diagnostics

Every session emits one `device:profile` event (flat props) plus capped
`net:change` events when the connection tuple moves. Data-saver users are
tracked like everyone else — they are the population of interest.

| Event           | Props                                                                                                                                                          | Meaning                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `device:profile` | `tier` (`low`/`mid`/`high`/`unknown`), `ramGb`, `cores`, `model`, `android`, `screen`, `dpr`, `platform`, `standalone`, `type`, `down`, `rtt`, `save`?, `wifi` | One per session, after the ≤400 ms UA-CH race |
| `net:change`     | `type`, `down`, `rtt`, `save`?, `wifi`                                                                                                                          | Debounced 1.5 s, bucket-compared, ≤10/session |

Rules to keep in mind when reading the numbers:

- Tier is RAM-primary (`<= 2` low, `4` mid, `8` high; cores only when RAM is
  unknown, and never `high` alone). Budget SoCs report 8 cores.
- Downlink is quantized to 25 kbps and capped at 10 Mbps; RTT is quantized to
  25 ms and capped at 3 s. Buckets are ranges, not exact speeds.
- iOS Safari and Firefox do not expose the Connection API; their rows are
  `unknown` and are reported separately, not as slow.
- Model strings come from UA client hints (Chrome reduced the model to `"K"` in
  the UA); they are sanitized and capped at 40 chars.
- Correlation uses `session_id`: the report joins the nearest
  `device:profile`/`net:change` row before each `generate:success`/`generate:fail`
  to attribute outcomes to the connection at call time.
- The "supported floor" line is the p10 of per-session worst downlink, the p90
  of per-session worst RTT, and the generate failure rate at or below the floor
  bucket — use it when deciding what speed to optimize for.

The coverage gate (`device:profile` sessions ÷ `page:view` sessions >= 80%)
exists to catch instrumentation breakage: if the tracker stops emitting, the
distributions silently skew, so the weekly strict run must fail instead.

## Weekly automation

`.github/workflows/telemetry-report.yml` runs every Monday (and on manual
dispatch): it executes the report with `--strict`, archives old telemetry rows,
and uploads both outputs as artifacts.

Setup: add a repository secret named `DATABASE_URL` (Settings → Secrets and
variables → Actions). Without it the workflow fails at the report step. Both
telemetry steps run with `set -o pipefail` so a failing gate (or archive) fails
the workflow — the `tee` that saves the artifact must not swallow the exit code.

## Archival (no deletions)

Telemetry is never deleted. Rows past the retention window are moved into
matching `*_archive` tables (with an `archived_at` timestamp) in a single
`DELETE ... RETURNING` → `INSERT` statement, so a failed insert rolls back the
delete and nothing can be lost. Archived rows stay queryable, e.g.
`SELECT * FROM feature_events_archive`.

```bash
npm run telemetry:archive                 # dry run
npm run telemetry:archive -- --apply      # move rows into archive tables
```

Defaults: feature events > 180 days, API events > 90 days, rate-limit events >
2 days. The weekly workflow performs the archival automatically. The same
archive-first pattern is used for superseded state rows (`app_user_state`),
expired/revoked sessions (`app_user_session`), and legacy tables.

## Weekly review checklist

1. **Funnel** — did activate → generate → test → submit hold or improve? Check
   the drive-by line first: a spike in identities with no generate/test start
   is traffic, not activation.
2. **Dead events** — allowlisted but unseen means the feature is unused or
   instrumentation broke; decide to remove or fix.
3. **Errors** — real errors exclude expected anonymous `401`s and rate-limit
   `429`s. For generation, start from the `generationFailure` breakdown
   (stage, issue codes, model) before reading raw logs.
4. **Latency** — p95 for `/api/user/state`, `/api/auth/me`, `/api/test:list`
   is dominated by cold-start schema bootstrap; flag regressions. Read these on
   the gate window, not the trend window, so a fixed regression stops counting.
5. **Rate limits** — normal clients tripping limits means limits are too tight
   or the client is too chatty.
6. **Data quality** — null `test_mode` on new tests means the generate endpoint
   stopped recording metadata. Ignore the "foreign rows ignored" line when
   reading this: those rows were never written by the endpoint, and a rising
   count means something is inserting into `ai_test` by hand.
7. **Generation deadline** — papers are salvaged and trimmed rather than failed
   when the 180s deadline lands with enough approved questions, so a
   `trimmed_by_deadline` count is the honest measure of how often the deadline
   bites. A non-zero count here with a passing success rate still means real
   users are getting shorter papers than they asked for.
8. **Bot noise** — spikes with few identities are usually crawlers; do not read
   them as growth. Check the excluded-row count under the API hotspot table: a
   jump there is local dev, e2e or probes writing to the production database,
   which is itself worth fixing (see Production vs non-production).
9. **Planner health** — check `intent:parse-failed` stays near zero, the
   clarification asked → answered ratio, and whether `topicSource` is mostly
   `span`/`exam` (good) versus `raw` (the model found no subject).
10. **Device & network** — read the tier/network mix, the top low-tier models,
    failures by downlink bucket, and whether the supported floor moved; a
    coverage-gate failure means the tracker broke, not that devices changed.

## Caveats

- Bots and crawlers inflate page views and API requests. Treat identity counts
  (distinct `client_id`) as the closest thing to real users.
- `401` on `/api/auth/me` is expected for anonymous visitors and is excluded
  from the admin error metric.
- Data is archived, never deleted (see Archival above); archive tables grow
  forever by design.
- Stored context includes user agent and IP-derived country/city/timezone. The
  privacy page covers analytics; keep it in sync if tracking changes.
