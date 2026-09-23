# Implementation Plan: Calm Planner (settle + coexistence + keyboard tiers)

## Overview

Ship the approved design in `docs/superpowers/specs/2026-09-23-calm-morph-planner-design.md`:
a pure settle module that gates preview values into the plan card, a search/planner coexistence
contract (strip + overlay footer + numeric-query isolation), and viewport tiers (full/dense/micro)
so the card survives the keyboard-halved screen. No API, schema, locale-key-count or dependency
changes beyond new UI strings. E2E-first; artifact updated.

## Architecture Decisions

- Settle logic is a pure module (`src/lib/client/previewSettler.js`) with adapters for the two
  preview sources; HomePage applies only committed output. This keeps the state machine vitest-testable
  and the UI components dumb.
- Explicit user edits stay authoritative via the existing `plannerDraft.explicit` — the settler reads
  it, `plannerState.js` does not change.
- The settle tick is a local-only re-run of Tier 0 after 400ms of quiet; no new network traffic.
- Viewport tier is a pure function of the visual viewport height (`viewportTier.js`); components read
  the tier, E2E emulates the keyboard by shrinking the viewport.
- Choreography stays CSS-only (no new dependency); all motion respects `.reduce-motion` / `.data-saver`.

## Task List

### Phase 1: Tests first (repo rule: failure modes, then code)

- [ ] Task 1: `tests/e2e/planner-calm.e2e.js` — failing specs: no-fragment topic log, two-win commit,
  strip+card coexistence, numeric-query isolation (zero preview requests), overlay footer + plan
  status, density tiers (390×844 / 390×420 / 390×300), reduce-motion
- [ ] Task 2: `src/lib/client/previewSettler.test.js` — the ten failure modes from the spec, written
  before the module

### Checkpoint: Tests

- [ ] New specs fail for the right reason; existing suite still green

### Phase 2: Pure logic

- [ ] Task 3: `src/lib/client/previewSettler.js` (state, rules, adapters, constants)
- [ ] Task 4: `src/lib/client/viewportTier.js` (`tierForHeight`, guarded height reader) + tests

### Checkpoint: Logic

- [ ] `npm run test` green (settler + tier + allowlist + locale parity)

### Phase 3: Wiring

- [ ] Task 5: HomePage — settler in both preview paths, settle tick, reset points, provenance from
  committed values, density prop, `handleTestNavigate` cancels + resets
- [ ] Task 6: PreviewCard — `settling` / `changedFields` props, pulse, dense/micro tier styles
- [ ] Task 7: PlannerComposer + TestSearchDropdown — one-row strip in dense/micro, always-visible
  overlay footer (plan status + plan action), arrow-key focus
- [ ] Task 8: Locale keys EN + HI

### Checkpoint: Wiring

- [ ] `npm run lint` + `npm run test` green; manual pass on 390×844 / 390×420 / 390×300

### Phase 4: Verification

- [ ] Task 9: Full `npm run test:e2e` green, artifact written
- [ ] Task 10: `npm run check` (build) + spec self-review + docs touch-up if drift

### Checkpoint: Complete

- [ ] All acceptance criteria met; committed in small conventional commits

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Settle starves the card | Med | Tick + strong-evidence paths; E2E asserts final commit |
| E2E flakiness from debounce timing | Med | Scripted route responses + deterministic waits, no sleeps |
| Tier classes break existing layouts | Low | Tier styles additive; full tier is the current CSS |
| New strings break locale parity | Low | Same-change EN/HI edits, parity test in `npm run test` |

## Open Questions

None — thresholds (0.85 / 2 wins / 400ms / 480 / 360) are initial values; all live in the two new
modules and can be tuned from `intent:preview` telemetry after launch.
