# Conformance — CHG-0029

Linked revision: proposal r2 (`sha256:a489307befecea6cd021aa8fda380f8f47e624edf591c82f0595f56e0bf10ce6`). Revision r1 parsed to r2 only to correct the shipped placement wording in the Outcome (below the composer panel), after the final review; no scope or behavior change.

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
- Pre-ship baseline recorded for the +1/+2-week comparison (fleet-filtered per the new runbook section): activation 46 page:view identities → 17 activated (37%); tour funnel 19 started → 8 step 2 → 5 step 5 → 3 completed. **Metric note:** `tour:start` now fires on every on-demand open, including replays by returning users, so tour-funnel counts are not comparable to the auto-open era; read activation as the primary signal and treat tour starts as intentional help opens.

## Final review (fresh-context reviewer subagent)

Verdict at r1: "With fixes"; no Critical findings; the reviewer independently ran the affected specs (39/39) and measured every finding. One fix pass closed two Important items and the record-wording item, each reproducing RED before the fix and GREEN after:

- **Reveal layout shift** (measured +0.0168 CLS at 390×844, +0.0119 at 320×568; home CLS is already weak): the card's box is now reserved from the first paint (`hintReserved`, hidden until `revealed`), so the reveal is a visibility flip, not an insertion. Test: `the card reserves its space before it reveals` (clock-controlled), RED→GREEN.
- **Pre-delay tour open** left the hint armed behind the modal and consumed a show: `openTour()` now retires the hint for good — silently when it had not revealed (nothing was shown, no event), with `onboarding:hint-dismissed { reason: 'close' }` when it had. Test: `opening the tour retires the hint for good`, RED→GREEN.
- Record wording corrected to the shipped placement (spec Objective + proposal Outcome; r2 above).

Deferred minors (recorded in the execution ledger): `?qa=0` also tags (any non-empty value); `hasFinishedTour()` is now unread (flag write kept per spec); the hint survives a Daily-5/quick-start generation; no screen-reader announcement for the late-appearing card; test gaps (qa stickiness across loads, orphan-event assertion needs `app.localhost`, pre-delay reload case); the entry's footprint moves Daily 5 off the first screen at 320px (trade-off of the under-composer placement). Declined-to-judge lines were ruled on individually and all stand (ledger).

Post-fix verification: `npx playwright test` across the four affected specs — 35/35; the commit carrying this record passes the repository's full pre-commit smoke gate (lint + vitest + full Playwright).
- Manual device pass (physical phone, iOS notch/home-indicator safe areas) was not possible in this environment; automated coverage stands in: 320px fit + 44px targets (hint spec), reduced motion (hint spec + tour spec), both locales (hint/tour gallery specs), horizontal safe-area shell spec, `?qa=1` stickiness (qa-tagging spec).
