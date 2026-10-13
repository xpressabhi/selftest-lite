# Conformance record

> Complete at `conformance_review`. Keep it factual and short; scale detail to the change.

## Outcome

The e2e suite is ~20% faster with three extra tests yet no coverage loss: 196 tests at
~1:54 before → 199 tests at **1:29 / 1:36 / 1:36** across three consecutive green runs.
The biggest serialization and dead-time offenders were removed: the 51s shell-matrix test
is now five parallel per-width tests, `settled()` no longer sleeps 200ms per route, and
globally parallel scheduling eliminates the late serial-file tail. One redundant test was
deleted and unit-suite waste dropped (slowest file 757ms → 121ms).

Change `CHG-0018` revision 1, proposal digest
`sha256:b48c59f29737a3dc6aee787bcf61487bf640e5bda5058beb65a65a680187ac8b`.

## Verification

| Command                                                       | Result                                   |
| ------------------------------------------------------------- | ---------------------------------------- |
| `npm run lint`                                                | pass                                     |
| `npm run test`                                                | **992 passed / 79 files**                |
| `npx playwright test` ×3                                      | **199 passed** — 1:29.1 / 1:36.1 / 1:36.6 |
| `npx playwright test tests/e2e/sign-in-methods.e2e.js --repeat-each=2` | **12 passed** (race fixed)      |
| `npx playwright test --workers=9` (experiment, rejected)      | 194 passed / **2 failed** at 2.5m        |

Before/after instrumentation: total test work 425s → 394s (Playwright JSON reporter);
`design-consistency.e2e.js` worker time 83s serial → file finished in 24s with tests
overlapping; `welcome-tour`/`smoke` no longer tail the run.

## Test changes

All declared changes are confirmed:

- `tests/e2e/page-width.e2e.js` — one test deleted (redundant cross-page column check;
  per-page tests pin the same absolute geometry).
- `tests/e2e/design-consistency.e2e.js` — frame-based wait; shell test split per width
  (same matrix; failure granularity improved).
- `tests/e2e/sign-in-methods.e2e.js` — unique Google identity per call; the pre-existing
  assertions were updated to the seeded values.
- `tests/e2e/test-cache.e2e.js`, `tests/e2e/security-hardening.e2e.js`,
  `tests/e2e/exam-notifications.e2e.js` — `mode: 'default'` opt-out only.
- `src/lib/server/transientErrors.test.js` — fake timers; identical assertion.

No other test file was modified, skipped, or deleted.

## Deviations and decisions

- **`--workers=9` was measured and rejected**: slower (2.5m) with two failures
  (`test-cache` MISS/HIT race, `exam-notifications` filter race), confirming the shared
  dev server, not CPU, is the bottleneck.
- **The sign-in race was fixed, not serialized**: duplicate `google_sub`/`email` UNIQUE
  violations under intra-file parallelism now use per-call identities.
- **Three files stay sequential on purpose**: shared cache re-warm race, intentionally
  consumed rate-limit budget, and a shared seeded set — each cheap (< 1s of work).
- **Remaining headroom not taken**: the shell matrix cross-product (5 widths × ~19
  routes) is still the largest single block (~35s of work); cutting route × width
  combinations would trade coverage, so it is left as a future option.

## Approval constraints

Not required. `.intent/config.yaml` has `review.required: false`; the operator explicitly
requested refactoring/removing tests for speed.
