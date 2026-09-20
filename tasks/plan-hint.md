# Implementation Plan: In-Test 50-50 Hint

## Overview
Contextual 50-50 lifeline on the test page: always-visible disabled button beside Flag that enables when Tier-0 (45s dwell or 2-3 skip streak, max 3/test) + Jev `test-moment` stuck confirm agree. Server endpoint returns 2 wrong indexes only; scoring unchanged; usage stored with the attempt.

## Architecture Decisions
- Pure `src/lib/server/hint.js` (`pickElimination`, `shouldOfferHint`) mirroring `personalize.js`/`intentParse.js` conventions; thin `POST /api/test/hint` route.
- Reuse existing `test-moment` decision (`promote: ['hint']` on stuck>=0.7) — no `personalize.js` changes.
- Cap enforcement: rateLimiter bucket + max 3 hinted questions validated server-side at submit; new nullable `hinted_indexes JSONB` column via `ADD COLUMN IF NOT EXISTS` (repo pattern, no migration tooling).
- Eliminated indexes persist in draft storage so navigation/reload keep them; submitted papers ignore hints (already answered).
- Telemetry keys land in the same commit as their `track()` emit sites.

## Task List
### Phase 1: Foundation
- [ ] Task 1: pure hint engine + unit tests
- [ ] Task 2: `/api/test/hint` endpoint + tests
### Checkpoint: Foundation
- [ ] `npm run test`, lint on touched files; endpoint fail-shapes verified
### Phase 2: Test-page UI
- [ ] Task 3: hint button (always visible/disabled → enabled), dwell + skip-streak tracking, elimination render + draft persistence, EN+HI strings, telemetry allowlist + emits
### Checkpoint: UI
- [ ] 360px layout intact, no new layout shift, data-saver stays disabled
### Phase 3: Submit plumbing
- [ ] Task 4: `hintedIndexes` through submit (client → route → `hinted_indexes` column), server validates (≤3, indexes valid + actually wrong)
### Checkpoint: Complete
- [ ] `npm run test`, `npm run lint`, `npm run check`; hinted attempt stored and queryable

## Risks and Mitigations
| Risk | Impact | Mitigation |
| Answer leak via endpoint | High | return indexes only; verify eliminated ≠ answer server-side at submit; 404 on submitted paper |
| Overuse inflates scores | Med | max 3/test, usage stored, full-marks was explicit user choice |
| Telemetry allowlist test | Med | keys + emit sites in same (UI) commit |
| Layout shift on enable | Low | button always rendered; enable only swaps disabled→enabled + microcopy |

## Open Questions
- Pulse animation on enable: keep minimal (opacity) to respect reduce-motion — default yes.
- Tasks tracked in `tasks/todo-hint.md`.
