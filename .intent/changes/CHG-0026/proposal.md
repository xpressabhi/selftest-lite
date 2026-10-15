---
protocol_version: "2.0"
id: "CHG-0026"
title: "Make the history day-group e2e test time-of-day independent"
status: "complete"
created_at: "2026-10-15T18:56:41Z"
request: "Commits are blocked between 00:00 and 02:00 local because the history group e2e test fails in that window."
proposal:
  revision: 1
  digest: "sha256:131aaf0839687b99c29fa69ebf079be3e0e2a67dc496a01f58f8fc5a6980b72f"
scope:
  paths:
    - "tests/e2e/taste-pass.e2e.js"
test_changes:
  - path: "tests/e2e/taste-pass.e2e.js"
    kind: "modified"
    reason: "Seeds now anchor to local midnight instead of fixed offsets from now: between 00:00 and 02:00 local the fixed offsets collapsed the Today/Yesterday/Earlier grouping to two groups, failing the test daily in that window. Every assertion is unchanged."
links:
  related: []
  supersedes: []
  decisions: []
review_required: false
---

# Change intent

## Outcome

`tests/e2e/taste-pass.e2e.js` "history groups rows by day and keeps destructive actions quiet" passes at every local run time. It fails between 00:00 and 02:00 local: the page groups history by calendar day, and the test's fixed offsets from "now" (2 hours ago, 26 hours ago) put the newest entry in Yesterday and the second in Earlier after midnight, so the expected three groups (Today / Yesterday / Earlier) collapse to two and the suite goes red.

## Scope

### Included

- The four seeded history timestamps in the test, anchored to local midnight: today = `max(midnight, now - 1 minute)`, yesterday = midnight - 1 hour, earlier = midnight - 25 hours and midnight - 9 days.

### Excluded

- The app's calendar-day grouping (correct behavior: just after midnight, a 22:00 entry is yesterday); other specs and seeds.

## Preserved behavior

The test asserts exactly what it asserted before: three group labels with Today first, four rows, the first row's score chip, and the quiet icon-only remove control. No assertion is weakened, removed, or added.

## Test changes

- `tests/e2e/taste-pass.e2e.js` (modified): midnight-anchored seeds because the previous fixed offsets are only valid while the local time of day is at least 02:00. The red state is pinned in this change's verification: at 00:2x IST the unmodified test produced two groups, with the "2 hours ago" entry grouped under Yesterday.

## Decisions and constraints

- Fix the test, not the app: the calendar grouping is intended UX, and "2 hours ago is today" is the invalid assumption.
- The seeds use the same local-midnight formula as the page's `dayBucket`, so the two cannot drift.

## Verification

- Focused: `npx playwright test tests/e2e/taste-pass.e2e.js --grep "history groups rows"` — red before the fix at 00:2x IST (two groups), green after.
- Full suite: `npm run test:e2e` green, plus the pre-commit hook.
