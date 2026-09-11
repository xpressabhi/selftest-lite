# Telemetry & Product Analytics

Selftest-lite records anonymous product telemetry so feature decisions are based
on real usage instead of guesses. This document is the runbook: what is stored,
how to read it, and how to keep the data trustworthy.

## Pipeline

| Layer | Source | Table | Notes |
| --- | --- | --- | --- |
| Feature events | `track()` / `trackDebounced()` in `src/lib/client/telemetry.js` | `feature_events` | Queued client-side, flushed every 30s / 20 events / on unload |
| API events | `logApiEvent()` in `src/lib/server/storage.js` | `api_request_events` | Route, status, duration, country/city, user agent |
| Rate limits | `rateLimiter()` | `api_rate_limit_events` | Cleaned up after 2 days |

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
- Do not add speculative names. If a feature is deleted, delete its events in
  the same change.

Run `npm run test` before shipping any telemetry change.

## Running the report

```bash
npm run telemetry:report                 # last 30 days
npm run telemetry:report -- --days=90    # custom window
```

The script loads `DATABASE_URL` from `.env.local` / `.env` and is **read-only**.
It prints:

- database overview and weekly activity (events, sessions, identities)
- activation funnel: page view → generate → test start → submit → explain
- top feature events, plus allowlisted events not seen in the window
- API hotspots (requests, errors excluding expected 401/429, 401s, 429s, avg/p95 latency)
- rate-limit trips per route
- data-quality checks: null `test_mode`/`difficulty`/`language`, generate and
  explain success rates, server 5xx count

## Weekly review checklist

1. **Funnel** — did activate → generate → test → submit hold or improve?
2. **Dead events** — allowlisted but unseen means the feature is unused or
   instrumentation broke; decide to remove or fix.
3. **Errors** — real errors exclude expected anonymous `401`s and rate-limit
   `429`s. Look at the recent list in `/admin` for details.
4. **Latency** — p95 for `/api/user/state`, `/api/auth/me`, `/api/test:list`
   is dominated by cold-start schema bootstrap; flag regressions.
5. **Rate limits** — normal clients tripping limits means limits are too tight
   or the client is too chatty.
6. **Data quality** — null `test_mode` on new tests means the generate endpoint
   stopped recording metadata.
7. **Bot noise** — spikes with few identities are usually crawlers; do not read
   them as growth.

## Caveats

- Bots and crawlers inflate page views and API requests. Treat identity counts
  (distinct `client_id`) as the closest thing to real users.
- `401` on `/api/auth/me` is expected for anonymous visitors and is excluded
  from the admin error metric.
- There is no retention policy yet for `feature_events` or
  `api_request_events`; delete old rows periodically if storage grows.
- Stored context includes user agent and IP-derived country/city/timezone. The
  privacy page covers analytics; keep it in sync if tracking changes.
