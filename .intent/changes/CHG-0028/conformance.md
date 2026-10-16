# Conformance record

> Proposal revision 1, digest `sha256:57af2eb1b4f69f892714afb6d664922b0355fe87755a9ef2e41b12fed74387b0`.

## Outcome

Each public explain page (`/explain/<slug>` and `/hi/explain/<slug>`) shows "Viewed by N people" / "इसे N लोगों ने देखा है" under the header summary once N >= 2 distinct viewers have opened it. A new `explainer_visits` ledger (keyed by `cache_key`, `SCHEMA_VERSION` 16 -> 17) backs a new `GET /api/explain/stats?slug=` that records the caller's visit before counting; the page fetches it on mount and passes the count to `ExplainerHeader`'s optional `views` prop. Matches proposal revision 1.

## Verification

- Red at the server stage: `npx playwright test tests/e2e/explain-stats.e2e.js` → 1 failed (`first.status()` expected 200, received 404 — route not yet registered).
- Unit guard red -> green: `npm run test` → `schemaMigrations.test.js` failed printing the new digest; after the declared fingerprint update to `41bb3d481f45d8ce46665170e929e51902dc248436b806f0bd498c25b1272105:17` → 92 files / 1136 tests passed.
- `npx vitest run src/lib/server/testStats.test.js` → 13 passed through the re-export (test-stats behavior unchanged).
- Green at the server stage: focused spec → 1 passed (3.4s).
- Red at the UI stage: focused spec → 1 failed (browser test, `page.waitForResponse` timed out — the page did not fetch yet), 1 passed.
- Green at the UI stage: focused spec → 2 passed (5.2s).
- Full gates: `npm run lint` exit 0; `npm run test` 92 files / 1136 tests; `npm run test:e2e` 235 passed (233 pre-existing + the 2 new); `npm run check` exit 0 (200 chunks, no DEV-only code); `npm run verify:vercel` exit 0 (238 sitemap URLs, 234 prerendered pages, SSR function present).
- Every pre-existing test passed unmodified except the declared `schemaMigrations.test.js` fingerprint.
- Post-deploy (operational): open an explain page from a second device or an incognito window; the counter appears at 2.

## Test changes

- `tests/e2e/explain-stats.e2e.js` (added) as declared: the API test (one row per identity, revisit dedupe, distinct counts, identity-less probe adds nothing, 400/404 contracts) and the browser test (hidden at one viewer, visible at two with exact English and Hindi copy, Hindi twin sharing the count).
- `src/lib/server/schemaMigrations.test.js` (modified) as declared: `DDL_FINGERPRINT` updated to `41bb3d48...:17` with the `SCHEMA_VERSION` bump; no assertion weakened.

## Deviations and decisions

- The spec described one e2e flow; it shipped as two tests in one file (server stage + UI stage), each with its own red -> green cycle — the plan's single refinement over the spec.
- The two `schemaMigrations.test.js` failures before the fingerprint update were the warm-database guard working as designed; the single declared edit fixed both.
- No separate index on `explainer_visits`: the UNIQUE (cache_key, identity_key) constraint serves the count query.

## Final review

Whole-branch review (fresh context, range e4e6b55..a18cc7c): one Important finding — the lone-viewer assertion could pass vacuously (the response event fires before the body is processed, and an absent-element check passes immediately), and it is the only guard for "a lone viewer sees nothing". Fixed: the check now asserts the response status, awaits `finished()`, and settles two animation frames before asserting absence. Verified by a temporary 1-viewer gate regression: the hardened assertion failed against it (`Received: 1`), then passed with the gate restored; full suite 235/235 after the fix. One Minor deferred (the browser test's evidence block restates assertion constants instead of observed values).

## Approval constraints

Not required.
