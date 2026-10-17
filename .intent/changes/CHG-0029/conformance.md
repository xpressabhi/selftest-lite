# Conformance — CHG-0029

Linked revision: proposal r1 (`sha256:f8db33ccd3298a4b5c86381635975b7090e71baae6a1f82115b3723197a24da9`).

## Outcome

Delivered as proposed: the blocking first-visit tour is replaced by a non-blocking coach hint (dismissal paths `close` / `composer` / `example` / `submit`, persistence, 3-show cap, silent pre-delay cancel); the tour is on-demand behind "How it works" with `tour:start` emitted on open; QA traffic is excludable via `/?qa=1` (`props.qa = true` on every feature event) with the "Known QA traffic" runbook section in `docs/telemetry.md`.

## Deviations

- **Placement.** The "How it works" entry and the hint card render as siblings below the `.planner-panel` (new layout-neutral `planner-block` wrapper carrying the old `mb-4`), not inside it. An in-flow child of the fixed-height panel steals chat-log height and broke the pre-existing welcome-gallery success criterion (greeting, tip and the first four examples visible on a phone). The app layout was fixed; no pre-existing test was modified to accommodate. The coach hint carries a one-line copy deviating slightly from the plan draft (drops the em dash, US "practice") to satisfy the repo's taste-pass rule.
- The earlier "controls must be at least 44px" measurement in the new spec was hardened after a flake: `boundingBox()` sampled mid-entrance-animation returned 43.99997px; `waitForHintSettled()` now awaits the hint's animations before measuring (verified with 5× repeats).

## Decisions and assumptions (ledger: `.superpowers/sdd/2026-10-17-first-visit-onboarding/progress.md`, R1–R4)

- Worked in place on `feat/first-visit-onboarding` instead of a worktree (repo convention is PR branches; no worktree preference declared).
- `verify-change.sh --strict` is unavailable in this environment (no python3/PyYAML/jsonschema); verification ran non-strict with digest + scope + verify_command checks passing.
- E2E telemetry capture uses `http://app.localhost:5174/` + a `pagehide` dispatch (existing repo pattern; plain `localhost` is filtered by `isLocalhost()`).
- Every commit passed the repo's pre-commit smoke gate (lint + 1138 vitest tests + full Playwright).

## Verification evidence

- Focused suites: `tests/e2e/qa-tagging.e2e.js` 2/2; `tests/e2e/welcome-tour.e2e.js` 13/13 (rewritten on-demand contract); `tests/e2e/first-visit-hint.e2e.js` 11/11; with `welcome-gallery.e2e.js`, 31/31 at task close (RED→GREEN shown per task; the 320px tests also passed 5× repeats after the settle fix).
- Full gates: `npm run lint` clean; `npm run check` clean (`check-build-mode: OK — 200 chunks, no DEV-only code, service worker registration present`); `npm run test` 93 files / 1138 tests passed; `npm run test:e2e` 248/248 passed with `test-results/e2e-artifact.json` (26 entries across the three specs, every one carrying attached evidence).
- Telemetry trust: allowlist doctor green in both directions (`onboarding:hint-shown`, `onboarding:hint-dismissed` added with their emit sites in the same commit).
- Pre-ship baseline recorded for the +1/+2-week comparison (fleet-filtered per the new runbook section): activation 46 page:view identities → 17 activated (37%); tour funnel 19 started → 8 step 2 → 5 step 5 → 3 completed.
- Manual device pass (physical phone, iOS notch/home-indicator safe areas) was not possible in this environment; automated coverage stands in: 320px fit + 44px targets (hint spec), reduced motion (hint spec + tour spec), both locales (hint/tour gallery specs), horizontal safe-area shell spec, `?qa=1` stickiness (qa-tagging spec).
