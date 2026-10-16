---
protocol_version: "2.0"
id: "CHG-0028"
title: "Show how many people have seen each public explain page"
status: "complete"
created_at: "2026-10-16T05:26:55Z"
request: "can we add visitor counter on each explain page as well to see how many people have seen the explanation"
proposal:
  revision: 1
  digest: "sha256:57af2eb1b4f69f892714afb6d664922b0355fe87755a9ef2e41b12fed74387b0"
scope:
  paths:
    - "src/lib/server/visitIdentity.js"
    - "src/lib/server/testStats.js"
    - "src/lib/server/explainerCache.js"
    - "src/lib/server/explainerStats.js"
    - "src/lib/server/storage.js"
    - "src/lib/server/schemaMigrations.test.js"
    - "src/routes/api/explain/stats/+server.js"
    - "src/lib/client/ExplainerHeader.svelte"
    - "src/lib/client/pages/PublicExplainerPage.svelte"
    - "src/lib/locales/english.json"
    - "src/lib/locales/hindi.json"
    - "tests/e2e/explain-stats.e2e.js"
    - "README.md"
test_changes:
  - path: "tests/e2e/explain-stats.e2e.js"
    kind: "added"
    reason: "New coverage: the stats API records one row per identity, dedupes revisits, counts distinct viewers and rejects bad slugs; the browser test pins the counter hidden at one viewer and visible with exact English and Hindi copy at two."
  - path: "src/lib/server/schemaMigrations.test.js"
    kind: "modified"
    reason: "DDL fingerprint updated 16 → 17 alongside the explainer_visits table and SCHEMA_VERSION bump, as that guard requires; no assertion weakened."
links:
  related:
    - "CHG-0025"
    - "CHG-0027"
  supersedes: []
  decisions: []
review_required: false
---

# Change intent

## Outcome

Each public explain page (`/explain/<slug>` and `/hi/explain/<slug>`) shows one muted line under the header summary — "Viewed by N people" — once N >= 2 distinct viewers have opened it. N counts identities (account-based when signed in, device-based otherwise) that opened the page, includes the current viewer, and is shared across both language routes of the same explainer.

## Scope

### Included

- A new `explainer_visits` ledger keyed by the explainer's stable `cache_key`, with `SCHEMA_VERSION` bumped 16 -> 17 and the DDL fingerprint updated.
- `GET /api/explain/stats?slug=` that records the caller's visit first and returns `{ visitors }` (rate-limited, mirroring `/api/test/stats`).
- The counter line on the public page via an optional `views` prop on `ExplainerHeader`, one new locale key in both dictionaries.
- The identity-key helpers extracted to `visitIdentity.js` (reused from the test-stats system; `testStats.js` re-exports so nothing else changes).

### Excluded

- Counters on the playground preview card or inline review embeds (public explain pages only).
- A per-explainer stats page, daily history, viewer list, or owner view.
- SSR/SEO changes: the counter is client-rendered and crawlers/link previews do not count.
- Telemetry events; changes to the test-stats system, explainer generation, caching, or sharing.

## Preserved behavior

A single viewer (usually the creator) sees nothing. The playground explainer card stays pixel-identical (it never passes `views`). The served HTML of public explain pages stays byte-identical for crawlers. `testStats.js` behavior and its unit tests are unchanged (re-export only).

## Test changes

- `tests/e2e/explain-stats.e2e.js` (added): API recording/dedupe/counts plus 400/404 contracts; browser test for the counter hidden at one viewer, visible at two with exact English and Hindi copy, Hindi twin sharing the count.
- `src/lib/server/schemaMigrations.test.js` (modified): DDL fingerprint updated 16 -> 17 with the schema bump, as the warm-database guard requires. No assertion weakened.

## Decisions and constraints

- Client-side recording: a failed fetch, no JS, or a rate limit renders nothing (decorative, like the test activity card). Server-side recording was rejected because it would count crawlers and link previews on public indexed pages.
- The ledger is keyed by `cache_key` (stable content address; slugs can be backfilled). No separate index: the UNIQUE (cache_key, identity_key) constraint serves the count query. Rows are upsert-only, never deleted (AGENTS.md).
- Identity reuse: the same `u:<userId>` / `c:<clientId>` builder as tests, extracted to `visitIdentity.js`.

Design: docs/superpowers/specs/2026-10-16-explainer-visitor-counter-design.md

## Verification

- Focused e2e red then green: `npx playwright test tests/e2e/explain-stats.e2e.js` at the server stage (API test) and again at the UI stage (browser test).
- Full gates: `npm run lint`, `npm run test`, `npm run test:e2e`, `npm run check`, `npm run verify:vercel` (a route and i18n are touched).
- Post-deploy (operational): open an explain page from a second device or an incognito window; the counter appears at 2.
