## Task 1: Pure hint engine + unit tests
**Description:** Create `src/lib/server/hint.js` with `pickElimination(question)` (exactly 2 wrong option indexes, never the answer, deterministic) and `shouldOfferHint({ dwellSec, consecutiveSkips, offersUsed, answered })`, plus `hint.test.js`.
**Acceptance criteria:**
- [ ] Elimination never includes the correct answer, even with duplicate option text
- [ ] Trigger predicates match spec (45s dwell or 2-3 skips, max 3/test, not when answered)
- [ ] Unit tests pass
**Verification:**
- [ ] Tests pass: `npx vitest run src/lib/server/hint.test.js`
- [ ] Manual check: none (pure logic)
**Dependencies:** None
**Files likely touched:**
- `src/lib/server/hint.js`
- `src/lib/server/hint.test.js`
**Estimated scope:** Small: 1-2 files

## Task 2: `/api/test/hint` endpoint
**Description:** Thin POST route: zod `{ id, index }`, fetch record, 404 when missing/submitted, 429 past per-client bucket, returns `{ eliminated: [i, j] }` via `pickElimination`. No client track events yet (land with UI).
**Acceptance criteria:**
- [ ] 400/404/429 shapes match submit-route conventions
- [ ] Response contains indexes only, never answer text
- [ ] Submitted paper → 404-gone shape (no hints after submit)
**Verification:**
- [ ] Tests pass: `npm run test`
- [ ] Manual check: curl shapes
**Dependencies:** Task 1
**Files likely touched:**
- `src/routes/api/test/hint/+server.js`
**Estimated scope:** Small: 1 file

## Checkpoint: After Tasks 1-2
- [ ] All tests pass
- [ ] Endpoint fail-shapes verified

## Task 3: Test-page hint UI
**Description:** Always-visible disabled 50-50 button in card head; per-question dwell timestamps + consecutive-skip counting; enable on Tier-0 + `test-moment` stuck confirm; tap → endpoint (or local elimination for review papers) → dim 2 options; persist eliminated in draft storage; EN+HI strings; `test:hint-offer/use/fail` allowlist + emits.
**Acceptance criteria:**
- [ ] Button never shifts layout; stays disabled on data-saver/offline
- [ ] Once per question; survives navigation + reload; cleared on submit
- [ ] No new strings without both EN+HI entries
**Verification:**
- [ ] Tests pass: `npm run test`
- [ ] Manual check: 360px mobile, slow-3G, keyboard + screen-reader labels
**Dependencies:** Tasks 1-2
**Files likely touched:**
- `src/routes/test/+page.svelte`
- `src/lib/client/storage.js` (draft eliminated helpers)
- `src/lib/shared/telemetryEvents.js`
- `src/lib/locales/english.json`, `src/lib/locales/hindi.json`
**Estimated scope:** Medium: 3-5 files

## Checkpoint: After Task 3
- [ ] UI flow works end-to-end on a review paper (no network path)

## Task 4: Submit plumbing for hintedIndexes
**Description:** Client sends `hintedIndexes` with answers; submit route validates (≤3 questions, indexes in range + actually wrong vs stored key) and stores in new `hinted_indexes` column; local-grade + `pushAttempt` paths carry it.
**Acceptance criteria:**
- [ ] Excess/invalid hints rejected without failing grading
- [ ] Attempt row queryable for hint usage (telemetry report can read it)
- [ ] Offline local-grade path stores hints and syncs later
**Verification:**
- [ ] Tests pass: `npm run test`
- [ ] Build succeeds: `npm run check`
- [ ] Manual check: submit with hints → attempt persisted
**Dependencies:** Tasks 1-3
**Files likely touched:**
- `src/routes/api/test/submit/+server.js`
- `src/lib/server/storage.js`
- `src/lib/client/storage.js`, `src/lib/client/sync.js`
- `src/routes/test/+page.svelte`
**Estimated scope:** Medium: 3-5 files

## Checkpoint: Complete
- [ ] `npm run lint`, `npm run check`, `npm run test` pass
- [ ] Ready for review (no commit until user approves — standing instruction)
