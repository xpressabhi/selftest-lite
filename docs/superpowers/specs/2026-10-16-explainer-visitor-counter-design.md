# Explainer visitor counter: show how many people have seen each public explain page

## Context

Every generated concept explainer is published at a public URL: `/explain/<slug>` and its Hindi twin `/hi/explain/<slug>` both render `PublicExplainerPage` from the shared `concept_explainers` cache row (`getExplainerBySlug`, slug backfilled lazily, stable once assigned). The pages are server-rendered for SEO and shareable via the Share button.

Nothing counts how many people open an explainer page:

- `concept_explainers.use_count` counts cache hits (playground generation opens), not page views.
- Telemetry events are admin analytics, not a public people-count.
- The test activity system (CHG-0027) solved the same problem for shared tests: identity-based visits (`ai_test_visits`), `GET /api/test/stats` records the caller before counting, and `TestStatsCard` shows the count from the second visitor on.

The operator wants the same "how many people have seen this" signal on each explain page.

## Objective

Each public explain page shows one muted line under the header summary — **"Viewed by N people"** — once **N ≥ 2 distinct viewers** have opened it. N counts identities that opened the page (both language routes count toward the same explainer) and includes the current viewer, because the page's own stats fetch records them before the count is returned.

## Non-goals

- No counter on the playground preview card or inline review embeds (public explain pages only).
- No per-explainer stats page, daily chart, or per-person viewer list.
- No SSR/SEO change: the counter is not in the served HTML and non-JS crawlers/link previews do not count.
- No new telemetry events; no changes to the test-stats system, explainer generation, caching, or sharing.

## Decisions

- **D1 — Client-side recording (approach A).** The page fetches a stats endpoint on mount; the fetch records the viewer's visit and returns the count. Rejected: recording server-side in the page load (every crawler and link preview would inflate a public indexed page's count, and the SSR path would gain a write) and reusing existing counters (wrong semantics).
- **D2 — Storage.** New table in `ensureStorageSchema`, shaped like `ai_test_visits`:

  ```sql
  CREATE TABLE IF NOT EXISTS explainer_visits (
    id BIGSERIAL PRIMARY KEY,
    cache_key TEXT NOT NULL REFERENCES concept_explainers(cache_key) ON DELETE CASCADE,
    identity_key TEXT NOT NULL,
    user_id BIGINT,
    client_id TEXT,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cache_key, identity_key)
  )
  ```

  Keyed by `cache_key` (the stable content address; slugs can be backfilled later). One row per identity, upsert refreshes `last_seen_at` only (append/update, never deleted, per AGENTS.md). No separate index: the `UNIQUE (cache_key, identity_key)` constraint already serves the count query. The DDL rides with a `SCHEMA_VERSION` bump (16 → 17) so warm databases get it, and `schemaMigrations.test.js`'s fingerprint is updated in the same change (recorded test change).
- **D3 — Identity.** The exact test-stats identity logic: `u:<userId>` when signed in, else `c:<clientId>` from the `x-client-id` header; no identity means no row (the count still returns). `buildVisitIdentityKey` + `normalizeClientId` move to a new `src/lib/server/visitIdentity.js`; `testStats.js` imports from it and re-exports `buildVisitIdentityKey`, so its callers and `testStats.test.js` are unchanged.
- **D4 — API.** `GET /api/explain/stats?slug=<slug>`, mirroring `/api/test/stats`: rate-limited at 120/min (bucket `/api/explain:stats`), empty slug → `400 INVALID_SLUG`, unknown slug → `404 EXPLAINER_NOT_FOUND`, records the caller's visit best-effort before counting, returns `{ visitors }` with `cache-control: no-store`, logs via `logApiEvent` (route `/api/explain:stats`, action `get_explainer_stats`). `getExplainerBySlug` gains `cache_key` in its SELECT (single consumer ignores extra fields). New server module `src/lib/server/explainerStats.js` owns `recordExplainerVisit` + `getExplainerStats({ slug, userId, clientId })` (resolve → record best-effort → count; `null` when the slug is unknown); the endpoint stays thin.
- **D5 — UI.** `ExplainerHeader` gains an optional `views` prop (default 0); when `views >= 2` it renders `<p class="explainer-header-views">` under the summary: muted, ~0.85rem. `PublicExplainerPage` fetches on mount (`cache: 'no-store'`, `getClientHeaders()`, canceled-flag cleanup) and passes `views`; the playground card passes nothing, so it stays pixel-identical. New locale key `explainViewedBy` in both dictionaries — always plural because the line only appears at 2+. A failed fetch, no JS, or a rate limit renders nothing (decorative, like the test card).
- **D6 — Both language routes, one explainer.** `/explain` and `/hi/explain` share the row, so they share N; a revisit from the same identity does not increment. Copy localizes per route.
- **D7 — A single viewer stays hidden.** Consistent with the test card: the first viewer (usually the creator checking their own page) sees nothing; social proof starts at the second.

## Behavior

| viewers | page |
| --- | --- |
| 0 or 1 | line absent (the lone viewer sees nothing) |
| 2+ | "Viewed by N people" / "इसे N लोगों ने देखा है" (N includes the current viewer) |

Edge cases:

- Same identity revisits (either language route): N unchanged.
- Signed-in viewer counts once across devices (`u:`); anonymous viewers count per device (`c:`).
- A viewer with no identity at all (storage blocked) is not recorded but still sees the count others produced.
- Crawlers and link previews (no JS) never count.
- Stats fetch fails or is rate-limited: the line stays absent; the page is unaffected.
- Unknown slug: the page 404s at load; the API also 404s (defense in depth).

## Files

- `src/lib/server/visitIdentity.js` (new) — identity helpers moved from `testStats.js`.
- `src/lib/server/testStats.js` — imports the helpers; re-exports `buildVisitIdentityKey` (no behavior change).
- `src/lib/server/explainerCache.js` — `getExplainerBySlug` also selects `cache_key`.
- `src/lib/server/explainerStats.js` (new) — `recordExplainerVisit`, `getExplainerStats`.
- `src/lib/server/storage.js` — `explainer_visits` DDL; `SCHEMA_VERSION` 16 → 17.
- `src/lib/server/schemaMigrations.test.js` — fingerprint update (recorded test change).
- `src/routes/api/explain/stats/+server.js` (new) — the endpoint.
- `src/lib/client/ExplainerHeader.svelte` — optional `views` prop + counter line.
- `src/lib/client/pages/PublicExplainerPage.svelte` — on-mount fetch; passes `views`.
- `src/lib/locales/english.json`, `src/lib/locales/hindi.json` — `explainViewedBy`.
- `tests/e2e/explain-stats.e2e.js` (new; recorded test change).
- `README.md` — endpoint table row after `/api/explain`.

## Testing

**New `tests/e2e/explain-stats.e2e.js`**, one test:

1. Seed one explainer through the DB bridge (`concept_explainers` row with a known `cache_key` and `slug`, payload `{ title, summary, recipes: [], html, css, js }` — the shape playground.e2e.js already seeds). Warm the schema with one real API request first (`GET /api/test?id=1`, as playground.e2e.js does — the bridge does not create tables).
2. First browser context opens `/explain/<slug>`, holding the `/api/explain/stats` response: `.explainer-header-views` has count 0; an identity-less API probe (`request.get`) reports `visitors: 1` (probes never add rows — no identity).
3. Second browser context (fresh storage → fresh `clientId`) opens the same URL: the line is visible with exactly `Viewed by 2 people`; probe reports `visitors: 2`.
4. The same second context opens `/hi/explain/<slug>`: the line is visible with exactly `इसे 2 लोगों ने देखा है` — same N, no new visitor.
5. Contract checks: `/api/explain/stats` without slug → 400; with an unknown slug → 404.
6. Attach a JSON evidence block (both counts, both localized strings).

Existing specs stay green untouched: playground.e2e.js's public-page assertions read server HTML (the counter is client-side, so the HTML is byte-identical), `visual-explanation.e2e.js` reads HTML the same way, and design-consistency does not audit `/explain` routes. No new unit tests: counting is SQL and the identity helper is already covered by `testStats.test.js` through the re-export; `schemaMigrations.test.js` changes by design.

## Rollout

- No feature flag: a new surface that hides itself below two viewers.
- Intent record `CHG-0028` carries the scope and the two recorded test changes (`schemaMigrations.test.js` modified; `explain-stats.e2e.js` added).
- Verify with the repo gates (`lint`, `check`, unit, `test:e2e`, `verify:vercel`) and, post-deploy, open an explain page from a second device/incognito window to see the counter appear at 2.

## Known limitations

- Counts public-page opens only: the same explainer seen inline (review card, playground) does not count.
- Identity-based approximation, same as tests: one person signed out on two devices counts twice.
- The counter is client-rendered: absent for no-JS visitors, and it appears right after hydration, inserting one text row under the summary (content below may shift by that row on first paint).
- Aggregate number only: no daily history, no viewer list, no owner view.
- Privacy: reuses the existing anonymous device identifier / account identity already described in the privacy policy; no new data categories, no policy change.
