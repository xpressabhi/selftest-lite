---
protocol_version: "2.0"
id: "CHG-0027"
title: "Show the activity card once more than one visitor has seen the test"
status: "complete"
created_at: "2026-10-16T03:00:03Z"
request: "show how many people have visited the shared test page as soon as more than one user has seen the test or result page, at minimum the visitor count"
proposal:
  revision: 1
  digest: "sha256:acc52e494f843c167d6a262eacac36b03c3143ba995ed54b325a66724fdd172f"
scope:
  paths:
    - "src/lib/client/TestStatsCard.svelte"
    - "tests/e2e/test-stats.e2e.js"
    - "tests/e2e/design-consistency.e2e.js"
test_changes:
  - path: "tests/e2e/test-stats.e2e.js"
    kind: "modified"
    reason: "Four visibility points flipped from hidden to visible under the visitors-based gate, each gaining tile/score/my-score assertions for the new state; the two single-visitor hidden assertions are unchanged. No assertion was weakened."
  - path: "tests/e2e/design-consistency.e2e.js"
    kind: "modified"
    reason: "The layout audit's probe test seeds two `ai_test_visits` rows so the card still renders under the visitors-based gate; all layout assertions are unchanged."
links:
  related:
    - "CHG-0010"
    - "CHG-0025"
  supersedes: []
  decisions: []
review_required: false
---

# Change intent

## Outcome

The test activity card is visible as soon as more than one identity has seen the test or result page (visitors >= 2), even with zero or one submissions. Today it appears only with two or more submissions, so a shared test with several viewers but fewer than two submissions shows nothing at all.

## Scope

### Included

- The card's visibility gate in `src/lib/client/TestStatsCard.svelte`: `submissions >= 2` becomes `visitors >= 2`.
- The e2e assertions that pin the old gate, updated to assert the new visible states (tiles, score rows, my-score presence/absence).

### Excluded

- How visits are recorded and counted (identity-based, unchanged).
- The card's content, the full `/test/stats` page, and card placement on either surface.
- Per-person visitor lists or a viewer-status line (operator chose the aggregate view).

## Preserved behavior

A single visitor still sees nothing (the creator alone; a lone challenge taker). Score rows and the my-score line render exactly when submissions exist. The full stats page stays ungated. No locale strings, telemetry events, or server code change.

## Test changes

- `tests/e2e/test-stats.e2e.js` (modified): four visibility points flipped from hidden to visible under the new gate, each gaining tile/score/my-score assertions; the single-visitor hidden assertions are unchanged. No assertion weakened.
- `tests/e2e/design-consistency.e2e.js` (modified): the layout audit's probe test seeds two `ai_test_visits` rows so the card still renders under the new gate; layout assertions unchanged.

## Decisions and constraints

- The gate lives in the component: the `/api/test/stats` payload already carries `visitors`; the server does not decide presentation.
- Calendar-day counting and identity keying are unchanged; one person signed out on two devices still counts as two visitors (existing approximation).

Design: docs/superpowers/specs/2026-10-16-test-stats-visibility-design.md

## Verification

- Focused e2e red then green: `npx playwright test tests/e2e/test-stats.e2e.js tests/e2e/design-consistency.e2e.js`.
- Full suite: `npm run test:e2e` plus the pre-commit hook.
- Post-deploy (operational): open a shared test with 2+ visitors on `/test` and `/results`.
