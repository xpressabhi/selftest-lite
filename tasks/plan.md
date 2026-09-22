# Implementation Plan: Spotlight results hero

## Overview

Ship the approved design in `docs/superpowers/specs/2026-09-22-results-spotlight-hero-design.md`:
replace the results page summary card with the dark Spotlight hero, add the personal-comparison pill,
move the primary next step inside the hero, and relocate every demoted control (auto-explain, rating,
reminder, print, retake, share sheet). Pure comparison helper, EN/HI copy, E2E coverage, artifact.

## Architecture Decisions

- The comparison is a pure function (`buildScoreComparison`) in `src/lib/client/learning.js`, reusing
  the existing `accuracy()` helper and `completedTests()` filter.
- The hero keeps the existing ring markup, count-up effect, and `shouldCountUp` gating; only the
  palette and layout change.
- The share sheet reuses `shareResult()` and `shareCard()` unchanged, so tracking events keep firing.
- The `.card-more-*` disclosure is deleted, not hidden; each control moves to its spec'd home.

## Task List

### Phase 1: Hero

- [x] Task 1: `buildScoreComparison` helper + comparison state on the page
- [x] Task 2: Spotlight hero markup and styles (dark stage, ring, pill, CTA, share sheet)
- [x] Task 3: Under-hero links, utility row, retake confirm

### Checkpoint: Hero

- [x] `npm run lint` + `npm run test` pass
- [x] `/results` renders the hero with a seeded paper (manual + e2e)

### Phase 2: Relocation

- [x] Task 4: auto-explain below the filter bar
- [x] Task 5: page footer with rating + reminder; teaser scrolls to it
- [x] Task 6: delete `.card-more-*`, drop `cardActionsSettings`, add/adjust locale keys

### Checkpoint: Relocation

- [x] No dead styles or keys; EN/HI parity test passes
- [x] All controls reachable; no duplicate controls

### Phase 3: Verification

- [x] Task 7: `tests/e2e/results-hero.e2e.js` (comparison matrix, CTA swap, share sheet, data-saver, footer)
- [x] Task 8: update `smoke.e2e.js` score assertion (+ `reminders.e2e.js` selectors)
- [x] Task 9: print + dark-mode polish; full `npm run test:e2e` with artifact

### Checkpoint: Complete

- [x] `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e` all green
- [x] Artifact written; manual mobile/dark/print checks done

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Dark hero reads as pasted on | Med | Hairline border, 860px width, spec'd spacing; check both themes |
| e2e assertions on removed classes | Low | Update `smoke.e2e.js` score assertion |
| Share sheet focus/outside-click bugs | Med | Keyboard + Escape handling, e2e covers open/select |

## Open Questions

None.
