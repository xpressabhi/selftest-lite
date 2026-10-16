# Conformance record

> Proposal revision 1, digest `sha256:acc52e494f843c167d6a262eacac36b03c3143ba995ed54b325a66724fdd172f`.

## Outcome

`TestStatsCard` now renders when `stats.visitors >= 2` (was `submissions >= 2`), so the activity card appears as soon as more than one identity has seen the test or result page, even with zero or one submissions. Card content, both mount surfaces, visit counting, and the full stats page are unchanged. Matches proposal revision 1.

## Verification

- Red state captured with the updated assertions and the old gate: `npx playwright test tests/e2e/test-stats.e2e.js tests/e2e/design-consistency.e2e.js` → 1 failed (`test-stats.e2e.js:117`, `expect(locator('.test-stats-card')).toBeVisible()` — element not found), 14 passed.
- Green after the gate flip: same command → 15 passed (30.0s).
- `npm run lint` exit 0; `npm run test` → 92 files / 1136 tests passed.
- `npm run test:e2e` → 233 passed (1.7m), exit 0.
- Every pre-existing test passed unmodified except the two declared below.

## Test changes

- `tests/e2e/test-stats.e2e.js` (modified) as declared: four visibility points now assert the visible state (two visitors / zero submissions: tiles 2/0/0 with no score rows and no my-score; the taker's results page and both summary views at two visitors / one submission; the creator's pre-run view with no my-score). The two single-visitor hidden assertions are unchanged.
- `tests/e2e/design-consistency.e2e.js` (modified) as declared: the probe test seeds two `ai_test_visits` rows so the card still renders under the visitors-based gate; layout assertions unchanged.

## Deviations and decisions

- None. The plan's snippets were applied as written.

## Approval constraints

Not required.
