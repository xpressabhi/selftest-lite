# Implementation Plan: Challenge + Score Card

## Overview
Results-page sharing cluster: challenge-a-friend via URL-carried claimed score with a compare block, plus a vertical 1080x1920 canvas score card for WhatsApp. Client-only; no server changes, no new tables.

## Architecture Decisions
- Pure `src/lib/client/scoreCard.js` for canvas drawing + text helpers (`stripMarkdown`, `clampLines`), with `scoreCard.test.js` covering the pure helpers (canvas itself verified manually).
- Challenge params parsed in `results/+page.svelte` from `page.url` (`ch`, `by`); compare block derived, no fetching.
- Share functions extended in place (`shareResult` gains `ch`/`by`); test-page share untouched (no score pre-start).
- Telemetry keys same-commit with emit sites.

## Task List
### Phase 1: Challenge slice
- [ ] Task 1: challenge URL params + compare block + challenge-back
- [ ] Task 2: canvas card module + helper tests
### Checkpoint: Slices built
- [ ] Focused tests pass, lint clean on touched files
### Phase 2: Wire-up
- [ ] Task 3: Card button + share/download + telemetry keys
### Checkpoint: Complete
- [ ] `npm run test`, `npm run lint`, `npm run check`; manual mobile + Hindi checks

## Risks and Mitigations
| Risk | Impact | Mitigation |
| Spoofed scores | Low | friendly framing, no verification (accepted) |
| Canvas Hindi shaping | Med | system fonts only; manual check with Hindi paper |
| Long topics overflow card | Low | 3-line clamp + ellipsis, tested helper |
| Telemetry allowlist test | Med | keys + emit sites same commit |

## Open Questions
- None. Tasks tracked in `tasks/todo-challenge.md`.
