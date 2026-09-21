# Implementation Plan: Own Tests Only on Home

## Overview
From `docs/superpowers/specs/2026-09-21-own-tests-only-home-design.md`: home's recent block and the planner search dropdown's empty/short-query state show only the visitor's own tests. Global discovery moves behind explicit search (4+ chars or test ID). Deletes the `SERVER_RECENT_TESTS` cache and its TTL helpers.

## Architecture Decisions
- `src/lib/client/recentTests.js` stays the pure view-model layer: local-only `mergeRecentTests` for the home block plus `toOwnTestResults` for the dropdown's local mode.
- Home paints synchronously from `getHistory()`; a best-effort `hydrateHistoryFromServer()` repaints once when server attempts change the list. The `recentListTouched` guard is preserved.
- The dropdown needs no new state machine: non-searchable queries resolve locally to `status='done'`; searchable queries keep the existing debounced fetch and paging.
- No locale, telemetry, or API changes.

## Task List

### Phase 1: Home block
- [x] Task 1: Local-only helpers + home paint
- [x] Task 2: Unit tests for the local-only merge

### Checkpoint: Home
- [x] `npm run test -- recentTests` passes
- [x] Fresh profile shows no recent block; generation adds the first row

### Phase 2: Search dropdown
- [x] Task 3: `toOwnTestResults` helper + tests
- [x] Task 4: Dropdown local mode for empty/short queries

### Checkpoint: Complete
- [x] `npm run lint`, `npm run test`, `npm run check` pass
- [x] Manual check: empty dropdown lists own tests only; 4+ char search still returns server tests

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Hydration repaint swaps rows mid-read | Low | Keep `recentListTouched` guard |
| History entries lack `test_mode`/topic | Low | Fallbacks to `untitledTest` / `quizPractice` as today |
| Stale `SERVER_RECENT_TESTS` localStorage key | None | Key constant removed; orphan data ignored |

## Open Questions
- None; design approved 2026-09-21.
