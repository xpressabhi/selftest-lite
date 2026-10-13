# Change intent

## Request and outcome

"Refactor or remove unit tests or e2e tests if they are too much and double check the same thing, ideally i want them to run faster." (operator)

The e2e suite runs ~20% faster (196-test suite at ~1:54 → 199-test suite at 1:29–1:36
across three consecutive green runs), the fixed dead-time and serialization were removed,
and one provably redundant test was deleted. Unit-suite waste also dropped: its slowest
file no longer sleeps 750ms of real time.

## Context

- Per-test durations (Playwright JSON reporter) showed the run was bound by whole-file
  serialization, not by test count: `design-consistency.e2e.js` alone occupied 83s of
  worker time — including a single 51s test walking every route at five breakpoints —
  while `nudges.e2e.js` spent ~22s in fixed dwell sleeps, and `welcome-tour`/`smoke`
  formed a ~25s tail because serial files start late.
- The `settled()` helper slept a flat 200ms after fonts; across ~160 route loads in the
  layout audits that was ~25s of pure sleeping, on top of work that is already frozen of
  animations (`reducedMotion`).
- A measured `--workers=9` experiment was slower (2.5m) and produced two failures on the
  shared dev server, so the bottleneck is the server, not the CPU: deduplicating work and
  balancing workers matters more than raising concurrency.
- `.intent/config.yaml` protects test paths (`tests/**`, `**/*.test.*`); every test change
  is declared under "Test changes".

## Scope

### Included

- `playwright.config.js`: `fullyParallel: true` — tests are isolated (fresh context per
  test, per-test seeding, no shared module state; verified by grep for module-scope
  mutable state and serial markers).
- `tests/e2e/design-consistency.e2e.js`: `settled()` now waits two animation frames after
  fonts settle instead of 200ms; the five-breakpoint shell audit is one test per width
  (same routes, widths, and audits).
- `tests/e2e/sign-in-methods.e2e.js`: Google-link seeds now use a unique sub/email per
  call (both columns are UNIQUE; parallel tests collided).
- `tests/e2e/test-cache.e2e.js`, `tests/e2e/security-hardening.e2e.js`,
  `tests/e2e/exam-notifications.e2e.js`: explicit `mode: 'default'` opt-out from
  `fullyParallel`, with rationale comments.
- `tests/e2e/page-width.e2e.js`: the redundant test "the content column does not move
  between pages" is deleted.
- `src/lib/server/transientErrors.test.js`: the "waits when there is room" case uses fake
  timers instead of sleeping 750ms for real.

### Excluded

- No application code changes.
- No assertion weakened, no test skipped, no retries added.
- Further coverage cuts (route × width cross-products) were deliberately not taken; they
  remain a future option if more speed is needed.

## Preserved behavior

- All 992 unit tests and all 199 e2e tests pass; the same audits still run on the same
  routes, widths, and invariants.

## Test changes

- `tests/e2e/page-width.e2e.js` — **deleted** one test: "the content column does not move
  between pages". Redundant: every per-page test in the same file already pins absolute
  container left/right to the centered-column formula at 1440px, so cross-page movement
  is impossible without an individual page failing.
- `tests/e2e/design-consistency.e2e.js` — **modified**: timed wait → frame-based wait;
  one combined shell test split into five per-width tests (same matrix, parallel-safe).
- `tests/e2e/sign-in-methods.e2e.js` — **modified**: per-call unique Google identity
  (fixes two `duplicate key` failures exposed by intra-file parallelism).
- `tests/e2e/test-cache.e2e.js`, `tests/e2e/security-hardening.e2e.js`,
  `tests/e2e/exam-notifications.e2e.js` — **modified**: `mode: 'default'` opt-out only;
  no test body changed.
- `src/lib/server/transientErrors.test.js` — **modified**: fake timers in one case;
  identical assertion.

## Decisions and constraints

- Keep the default worker count: `--workers=9` measured slower and flaky; the shared dev
  server is the bottleneck.
- Parallelize globally (`fullyParallel`) with three targeted opt-outs instead of per-file
  `mode: 'parallel'` flags (first tried per-file, then superseded — no net change there).
- Only remove work that is provably redundant; keep the route×width coverage matrices.

## Verification

- Three consecutive full e2e runs green: **199 passed** at 1:29, 1:36, 1:36 (before:
  196 passed at ~1:54).
- Unit: **79 files / 992 tests pass**; slowest file 757ms → 121ms; suite wall 2.3–2.5s.
- `npm run lint` green. Details in `conformance.md`.
