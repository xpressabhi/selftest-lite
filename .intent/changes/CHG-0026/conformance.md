# Conformance record

> Proposal revision 1, digest `sha256:131aaf0839687b99c29fa69ebf079be3e0e2a67dc496a01f58f8fc5a6980b72f`.

## Outcome

`tests/e2e/taste-pass.e2e.js` seeds its four history entries against local midnight instead of fixed offsets from `Date.now()`. The test now passes at any local run time; previously it failed daily between 00:00 and 02:00 local, when the "2 hours ago" entry belongs to yesterday and the expected three groups collapsed to two. Matches proposal revision 1.

## Verification

- Red state pinned at 00:2x IST on the unmodified test: `history groups rows by day and keeps destructive actions quiet` failed with `Expected: 3 / Received: 2` group labels (the "2 hours ago" row grouped under Yesterday, "1 day ago" under Earlier).
- `npx playwright test tests/e2e/taste-pass.e2e.js --grep "history groups rows"` at 00:27 IST → 1 passed (4.9s), inside the window that was failing.
- `npm run test:e2e` → 233 passed (1.7m), exit 0.
- Every pre-existing test passed unmodified; the only pre-existing test touched is the one declared below, and its assertions are unchanged.

## Test changes

- `tests/e2e/taste-pass.e2e.js` (modified) as declared: midnight-anchored seeds, assertions untouched. The other failure in the blocked pre-commit run (`visual-explanation.e2e.js` "arms the linked visual…") did not reproduce here or in focused reruns; it is the known intermittent shared rate-limit-bucket flake tracked separately and is unrelated to this change.

## Deviations and decisions

- Fixed the test, not the app: calendar-day grouping is the intended UX; "2 hours ago is today" was the invalid assumption.
- Checked the same fixed-offset pattern in `nudges.e2e.js` (1 hour ago): nothing in that spec branches on calendar days, and it passed during the failing window; left untouched.

## Approval constraints

Not required.
