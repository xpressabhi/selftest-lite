## Task 1: Local-only recent helpers + home paint
**Description:** `recentTests.js` drops `normalizeServerEntry`, `readRecentCache`, `isCacheFresh`, `RECENT_CACHE_TTL_MS`, and the `server` option; `mergeRecentTests({ local, hidden, limit })` remains. `HomePage.svelte` paints from `getHistory()` and repaints after a best-effort `hydrateHistoryFromServer()`. Remove `SERVER_RECENT_TESTS` from constants and the `/api/test?q=` fetch/cache from home.
**Acceptance criteria:**
- [x] Home renders no global tests and no longer calls `/api/test?q=`
- [x] Signed-in repaint happens once when hydration changed history, never after `recentListTouched`
- [x] Hidden ids stay filtered; cap stays 5
**Verification:**
- [x] E2E: `npm run test:e2e` (home block assertions + no-global-list evidence)
**Dependencies:** None
**Files likely touched:** `src/lib/client/recentTests.js`, `src/lib/client/pages/HomePage.svelte`, `src/lib/client/constants.js`
**Estimated scope:** Small: 2-4 files

## Task 2: E2E coverage for the home block
**Description:** Extend `tests/e2e/smoke.e2e.js` with a seeded history (12 own tests + 1 hidden), asserting cap 5, hidden filtering, and zero global list requests.
**Acceptance criteria:**
- [x] Home block shows the 5 newest own tests, hidden id excluded
- [x] No `/api/test` request with an empty query
**Verification:**
- [x] E2E: `npm run test:e2e`
**Dependencies:** Task 1
**Files likely touched:** `tests/e2e/smoke.e2e.js`
**Estimated scope:** XS

## Task 3: `toOwnTestResults` helper
**Description:** Pure helper in `recentTests.js`: `toOwnTestResults(history, query, { hidden, limit })` → `{ id, topic, test_mode }[]`, newest first, case-insensitive topic/id substring match, hidden filtered.
**Acceptance criteria:**
- [x] Empty query returns newest-first capped at 10
- [x] Topic and id matching, hidden filtering covered by E2E
**Verification:**
- [x] E2E: `npm run test:e2e` (dropdown assertions)
**Dependencies:** Task 1
**Files likely touched:** `src/lib/client/recentTests.js`
**Estimated scope:** XS

## Task 4: Dropdown local mode
**Description:** `TestSearchDropdown.svelte` drops `recentCache`/`RECENT_TTL_MS`/empty-query fetch; non-searchable queries set local results synchronously. Searchable path unchanged.
**Acceptance criteria:**
- [x] Empty/1–3 char query never hits `/api/test`
- [x] `startTypingToGenerate` shows when there are no own matches
- [x] 4+ chars/ID keeps debounced server search, exact match, `noTestsFound`, rate limit
**Verification:**
- [x] E2E: `npm run test:e2e`
**Dependencies:** Task 3
**Files likely touched:** `src/lib/client/TestSearchDropdown.svelte`
**Estimated scope:** Small: 1-2 files

## Task 5: E2E artifact
**Description:** `tests/e2e/artifactReporter.js` writes `test-results/e2e-artifact.json` after every run: per-test status plus `evidence` attachments from the own-tests tests, tied to the git SHA.
**Acceptance criteria:**
- [x] Artifact produced by `npm run test:e2e`
- [x] Byte-identical across two consecutive runs on the same revision
**Verification:**
- [x] `diff` of two runs is empty
**Dependencies:** Tasks 2, 4
**Files likely touched:** `tests/e2e/artifactReporter.js`, `playwright.config.js`, `tests/e2e/smoke.e2e.js`
**Estimated scope:** Small: 2-3 files

### Checkpoint: Complete
- [x] `npm run lint`, `npm run test`, `npm run check`
- [x] `test-results/e2e-artifact.json` produced and repeatable
- [ ] Manual mobile check: home idle, dropdown states, data-saver untouched
