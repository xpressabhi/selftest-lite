## scope.included

- playwright.config.js: fullyParallel true with three documented file-level opt-outs.
- tests/e2e/design-consistency.e2e.js: frame-based settle wait; shell audit split into one test per breakpoint width.
- tests/e2e/sign-in-methods.e2e.js: per-call unique Google identity so parallel tests cannot collide on UNIQUE columns.
- tests/e2e/test-cache.e2e.js, tests/e2e/security-hardening.e2e.js, tests/e2e/exam-notifications.e2e.js: explicit mode default opt-out from fullyParallel.
- tests/e2e/page-width.e2e.js: redundant cross-page column test deleted.
- src/lib/server/transientErrors.test.js: fake timers replace a real 750ms sleep.

## scope.excluded

- No application code changes; no assertion weakened, no test skipped, no retries added.
- No route x width coverage matrices were cut.

## preserved

- All 992 unit tests pass on the same assertions.
- All 199 e2e tests pass; the same audits run on the same routes, widths, and invariants.

## decisions

- Keep the default worker count: a measured --workers=9 run was slower (2.5m) and produced two failures on the shared dev server.
- Parallelize globally via fullyParallel plus targeted opt-outs instead of per-file mode parallel flags.
- Remove only provably redundant work; keep the route x width coverage matrices.

