# Feature-Usage Telemetry — Implementation Plan

**Date**: 2026-08-06
**Status**: Approved, implementing
**Decision drivers**: User chose Neon DB + admin dashboard, micro-interaction depth, track all users (incl. data-saver).

## Goal

Capture what users _can_ do and what they _actually do_ across the app, at micro-interaction level, and surface a most-used → least-used feature ranking in the admin dashboard so feature planning is data-driven.

## Architecture

```
Browser track() → in-memory queue → batch flush (30s / 20 events / pagehide beacon)
  → POST /api/telemetry (rate-limited, allowlisted, validated)
  → Neon feature_events table (auto-created via ensureStorageSchema)
  → /api/admin/feature-usage (admin auth) → /admin "Feature usage" panel
```

## Files

| File                                                                                                                                       | Purpose                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `src/lib/client/telemetry.js`                                                                                                              | Browser tracker: `track(event, props)`, queue, batch flush, sendBeacon on pagehide           |
| `src/lib/server/telemetry.js`                                                                                                              | `TELEMETRY_EVENTS` allowlist, `validateTelemetryEvents`, `recordTelemetryEvents` (DB insert) |
| `src/routes/api/telemetry/+server.js`                                                                                                      | Ingest endpoint (POST, 204, rate-limited)                                                    |
| `src/routes/api/admin/feature-usage/+server.js`                                                                                            | Admin stats endpoint (auth + rate limit, like `/api/admin/stats`)                            |
| `src/lib/server/storage.js`                                                                                                                | Add `feature_events` table + indexes to `ensureStorageSchema`; add `getFeatureUsageStats`    |
| `src/routes/admin/+page.svelte`                                                                                                            | "Feature usage" panel: ranking list, per-page table, 30-day trend                            |
| `src/routes/+layout.svelte`, `+page.svelte`, `test/+page.svelte`, `results/+page.svelte`, `history/+page.svelte`, `bookmarks/+page.svelte` | Wire `track()` calls                                                                         |
| `src/lib/client/telemetry.test.js`, `src/lib/server/telemetry.test.js`                                                                     | Unit tests (queue batching, validation)                                                      |

## Data model

```sql
CREATE TABLE IF NOT EXISTS feature_events (
  id BIGSERIAL PRIMARY KEY,
  event TEXT NOT NULL,
  page TEXT,
  props JSONB NOT NULL DEFAULT '{}',
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feature_events_event ON feature_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feature_events_created ON feature_events (created_at);
```

## Event inventory (~45 types)

- **Page views**: `page:view` (all routes incl. content pages)
- **Quiz setup**: `setup:mode`, `setup:language`, `setup:difficulty`, `setup:test-type`, `setup:category`, `setup:topic-toggle`, `setup:topic-input` (debounced), `setup:exam-select`, `setup:exam-search`, `setup:exam-group-filter`, `setup:syllabus-toggle`, `setup:questions-count`
- **Generation**: `generate:start`, `generate:success`, `generate:fail` (props: error code), `generate:quick-start-exam`, `generate:quick-start-preset`, `generate:save-preset`
- **Search**: `search:open`, `search:keystroke` (debounced), `search:submit`, `search:result-click`, `search:scroll-more`, `search:close`
- **Test**: `test:start`, `test:answer` (props: q index), `test:prev`, `test:next`, `test:jump`, `test:panel-toggle`, `test:submit`, `test:submit-fail`, `test:share`
- **Results**: `results:view`, `results:explain`, `results:explain-fail`, `results:bookmark-question`, `results:print`, `results:share`
- **Bookmarks/history**: `bookmarks:view`, `bookmark:add-exam`, `bookmark:remove-exam`, `bookmark:add-preset`, `bookmark:remove-preset`, `bookmark:remove-question`, `history:view`, `history:clear`, `history:search`, `history:open-test`
- **Global**: `settings:language-toggle`, `settings:theme-toggle`, `settings:data-saver-toggle`, `pwa:install-prompt`, `pwa:install-accepted`, `pwa:install-dismissed`
- **Scroll**: `scroll:depth` (props: 25|50|75|100)

## Server rules

- POST body: `{ sessionId, events: [{ event, page, props }] }`
- Caps: ≤50 events/request, event name ≤64 chars, props JSON ≤2KB per event, body ≤64KB → 400/413 otherwise
- Event name must be in `TELEMETRY_EVENTS` allowlist; unknown events dropped (not an error)
- Rate limit: bucket `/api/telemetry`, limit 120/min, window 1 min (generous for 30s batches)
- Insert: parameterized single multi-row INSERT
- Response: 204 No Content

## Admin reporting (`GET /api/admin/feature-usage`)

Query param `days` (default 30, cap 90). Returns:

- `total`, `sessions`, `first_at`, `last_at`
- `by_event`: `[{ event, count, pct }]` sorted DESC — **the most→least ranking**
- `by_page`: page → count sorted DESC
- `trend`: daily counts last N days
- `engagement`: events per session (avg), sessions per day (avg)

## Admin UI

New card in `/admin`: "Feature usage" — ranked list (event, count, % bar), page table, small 30-day trend bar chart. New strings added to `english.json` / `hindi.json` (admin strings are English-only in the existing admin page? — follow existing admin page language convention).

## Privacy & abuse

- Anonymous: session_id = random UUID per tab, no cookies/IP stored
- Props contain only user-entered form values already stored in the app DB (topics, modes)
- No data-saver gating (user decision), but batches are small (~200-500B) and infrequent (30s)

## Testing

- `telemetry.test.js` (client): queue append, batch size flush, debounce behavior (pure parts only)
- `telemetry.test.js` (server): allowlist validation, caps, props size rejection, malformed payload
- Run `npm run lint`, `npm run check`, `npm run test`
