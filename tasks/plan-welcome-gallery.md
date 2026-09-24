# Implementation Plan: Welcome Gallery (empty planner state)

## Overview

Ship the approved design in `docs/superpowers/specs/2026-09-24-welcome-gallery-design.md`: for a
user with no test history, the blank planner log gets a greeting, three goal-based example groups
(2 rows each) and a modifier tip — visible until the first real keystroke. Tapping an example
fills the composer without submitting and without triggering previews. English + Hindi, CSS-only
motion, no API/schema/dependency changes. E2E-first; artifact updated.

## Architecture Decisions

- `showWelcome` is derived in `HomePage`; `ChatThread` stays a dumb renderer (new `welcome` +
  `exampleGroups` props, replacing `examples`); `PlannerComposer` only reports real typing
  (`ontyping` from its input handler).
- Previews are gated on `plannerTyped`: the existing `$effect` on `intentValue`
  (`HomePage.svelte:704`) must not run for programmatic fills, otherwise a tap would commit a
  local topic, pop the plan card and wipe the gallery.
- Tap = fill + `planner:example-tap`, no submit, no focus, no request.
- Gallery is conditionally rendered (removed from the DOM on typing) so a plan card that commits
  mid-typing lands at the top of the log; entry fade is a CSS keyframe disabled by
  `.reduce-motion` / `.data-saver`.
- The greeting is static markup — never appended to `plannerDraft.messages`.
- Stable test hooks: `.welcome-gallery`, `.welcome-example`, `.welcome-tip`.

## Task List

### Phase 1: Specs first (repo rule)

- [x] Task 1 (S): `tests/e2e/welcome-gallery.e2e.js` — the seven cases from spec §10 (new user
  renders gallery; returning user unaffected; tap fills + no requests + gallery stays; type/clear
  hide/return; `/hi` copy; panel height stable; data-saver disables the animation), each attaching
  evidence. Written before app code; expected to fail only on the missing selectors.

### Checkpoint: Specs

- [x] New suite fails for the right reason (missing `.welcome-gallery` / `.welcome-tip`), no harness
  errors; existing 33 e2e tests still green

### Phase 2: Copy and rendering

- [x] Task 2 (XS): Locale keys — add the 11 new en + hi strings from spec §7; `npm run test` locale
  parity green.
- [x] Task 3 (M): `ChatThread.svelte` — `welcome` / `exampleGroups` props, greeting + groups inside
  the log and tip pinned below it, styles + 44px rows, `role`/`aria-live` omitted while welcome,
  delete the `examples` block and `.example-chip(s)` styles; delete `plannerExample1-3` and
  `welcomeTryThese` from both locales.

### Checkpoint: Rendered

- [x] `npm run test` green; manual look at `/` and `/hi` — gallery visible, recent-list path for
  seeded history unchanged (tap still submits until Task 4 — known, temporary)

### Phase 3: Behaviour

- [x] Task 4 (M): `PlannerComposer` `ontyping`; `HomePage` `plannerTyped` (set on typing, reset on
  empty / Start over), `showWelcome`, example group data, `handleExampleTap` (fill + `track`),
  preview-effect gate; add `planner:example-tap` to `telemetryEvents.js` (emit site and allowlist
  in the same change).
- [x] Task 5 (S): E2E — make all seven cases green, tune selectors/waits; full suite + artifact.

### Checkpoint: Behaviour

- [x] `tests/e2e/welcome-gallery.e2e.js` green; `planner-calm.e2e.js` green (typed previews still
  work through the new gate); panel height unchanged by typing

### Phase 4: Verification

- [x] Task 6 (S): `npm run lint`, `npm run test`, `npm run check`, `npm run test:e2e`,
  `npm run verify:vercel`; manual 390×844 and data-saver pass; docs touch-up only if drift;
  small conventional commits.

### Checkpoint: Complete

- [x] All acceptance criteria met; artifact written with the new suite's evidence; ready for review

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Gallery scrolls at 390×844 | Med | E2E measures; trim the tip or one example row if it does not fit |
| Preview gate breaks typed previews | High | `planner-calm` + smoke "typed search still reaches the server" guard the path; gate is one line, revertable |
| E2E flakiness (keystroke vs debounce) | Med | Deterministic route stubs and DOM waits, no sleeps (existing patterns) |
| aria-live churn when the gallery returns | Low | `role`/`aria-live` omitted in the welcome state (spec §8) |
| Locale parity drift | Low | Same-change en + hi edits; parity test in `npm run test` |

## Open Questions

None — copy is approved in the spec; group data lives in `HomePage` and is cheap to edit.
