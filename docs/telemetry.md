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
npm run telemetry:report                 # last 30 days
npm run telemetry:report -- --days=90    # custom window
```

The script loads `DATABASE_URL` from `.env.local` / `.env` and is **read-only**.
It prints:

- database overview and weekly activity (events, sessions, identities)
- retention: new vs returning identities per week
- activation funnel: page view → generate → test start → submit → explain
- top feature events, plus allowlisted events not seen in the window
- conversational planner: client parse/clarification counts, clarifications by
  field/outcome, and server-side topic source + confidence + token usage
- API hotspots (requests, errors excluding expected 401/429, 401s, 429s, avg/p95 latency)
- rate-limiter requests per route (every limiter call, not only blocked ones)
- generation failures: stage/code/model breakdown, top issue codes per failing
  batch, and client-reported `generate:fail` codes
- data-quality checks: null `test_mode`/`difficulty`/`language`, generate and
  explain success rates, server 5xx count
- quality gates (PASS/FAIL). Pass `--strict` to exit non-zero when any gate
  fails (used by the scheduled workflow).

### Quality gates

| Gate                                                | Target     |
| --------------------------------------------------- | ---------- |
| Generate success rate                               | >= 95%     |
| Explain failure rate                                | < 2%       |
| Server 5xx                                          | 0          |
| Null `test_mode` on generated tests                 | 0          |
| `/api/user/state` and `/api/auth/me` p95            | <= 3000 ms |
| Requests slower than 10s                            | < 2%       |
| Answer at A/B (served)                              | < 60%      |
| Longest-answer tell (key >1.25x longest distractor) | < 35%      |
| Duplicate questions (7d)                            | 0          |
| Non-discriminating repeated items                   | < 35%      |
| D1 retention                                        | >= 15%     |
| D7 retention                                        | >= 8%      |

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

## Weekly automation

`.github/workflows/telemetry-report.yml` runs every Monday (and on manual
dispatch): it executes the report with `--strict`, archives old telemetry rows,
and uploads both outputs as artifacts.

Setup: add a repository secret named `DATABASE_URL` (Settings → Secrets and
variables → Actions). Without it the workflow fails at the report step.

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

1. **Funnel** — did activate → generate → test → submit hold or improve?
2. **Dead events** — allowlisted but unseen means the feature is unused or
   instrumentation broke; decide to remove or fix.
3. **Errors** — real errors exclude expected anonymous `401`s and rate-limit
   `429`s. For generation, start from the `generationFailure` breakdown
   (stage, issue codes, model) before reading raw logs.
4. **Latency** — p95 for `/api/user/state`, `/api/auth/me`, `/api/test:list`
   is dominated by cold-start schema bootstrap; flag regressions.
5. **Rate limits** — normal clients tripping limits means limits are too tight
   or the client is too chatty.
6. **Data quality** — null `test_mode` on new tests means the generate endpoint
   stopped recording metadata.
7. **Bot noise** — spikes with few identities are usually crawlers; do not read
   them as growth.
8. **Planner health** — check `intent:parse-failed` stays near zero, the
   clarification asked → answered ratio, and whether `topicSource` is mostly
   `span`/`exam` (good) versus `raw` (the model found no subject).

## Caveats

- Bots and crawlers inflate page views and API requests. Treat identity counts
  (distinct `client_id`) as the closest thing to real users.
- `401` on `/api/auth/me` is expected for anonymous visitors and is excluded
  from the admin error metric.
- Data is archived, never deleted (see Archival above); archive tables grow
  forever by design.
- Stored context includes user agent and IP-derived country/city/timezone. The
  privacy page covers analytics; keep it in sync if tracking changes.
