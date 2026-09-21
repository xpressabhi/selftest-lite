## Task 1: Local-only recent helpers + home paint
**Description:** `recentTests.js` drops `normalizeServerEntry`, `readRecentCache`, `isCacheFresh`, `RECENT_CACHE_TTL_MS`, and the `server` option; `mergeRecentTests({ local, hidden, limit })` remains. `HomePage.svelte` paints from `getHistory()` and repaints after a best-effort `hydrateHistoryFromServer()`. Remove `SERVER_RECENT_TESTS` from constants and the `/api/test?q=` fetch/cache from home.
**Acceptance criteria:**
- [x] Home renders no global tests and no longer calls `/api/test?q=`
- [x] Signed-in repaint happens once when hydration changed history, never after `recentListTouched`
- [x] Hidden ids stay filtered; cap stays 5
**Verification:**
- [x] Tests pass: `npm run test -- recentTests`
- [x] Manual check: fresh profile → no recent block; generate → own row appears
**Dependencies:** None
**Files likely touched:** `src/lib/client/recentTests.js`, `src/lib/client/pages/HomePage.svelte`, `src/lib/client/constants.js`, `src/lib/client/recentTests.test.js`
**Estimated scope:** Small: 2-4 files

## Task 2: Unit tests for local-only merge
**Description:** Update `recentTests.test.js`: remove server/cache suites, cover hidden filtering, cap, ordering, missing-id drop.
**Acceptance criteria:**
- [x] No references to removed helpers remain
- [x] Local-only merge cases covered
**Verification:**
- [x] Tests pass: `npm run test -- recentTests`
**Dependencies:** Task 1
**Files likely touched:** `src/lib/client/recentTests.test.js`
**Estimated scope:** XS

## Task 3: `toOwnTestResults` helper + tests
**Description:** Pure helper in `recentTests.js`: `toOwnTestResults(history, query, { hidden, limit })` → `{ id, topic, test_mode }[]`, newest first, case-insensitive topic/id substring match, hidden filtered.
**Acceptance criteria:**
- [x] Empty query returns newest-first capped at 10
- [x] Topic and id matching, hidden filtering covered by tests
**Verification:**
- [x] Tests pass: `npm run test -- recentTests`
**Dependencies:** Task 1
**Files likely touched:** `src/lib/client/recentTests.js`, `src/lib/client/recentTests.test.js`
**Estimated scope:** XS

## Task 4: Dropdown local mode
**Description:** `TestSearchDropdown.svelte` drops `recentCache`/`RECENT_TTL_MS`/empty-query fetch; non-searchable queries set local results synchronously. Searchable path unchanged.
**Acceptance criteria:**
- [x] Empty/1–3 char query never hits `/api/test`
- [x] `startTypingToGenerate` shows when there are no own matches
- [x] 4+ chars/ID keeps debounced server search, exact match, `noTestsFound`, rate limit
**Verification:**
- [x] Tests pass: `npm run smoke`
- [x] Manual check: dropdown with fresh profile, with own history, and with a search term
**Dependencies:** Task 3
**Files likely touched:** `src/lib/client/TestSearchDropdown.svelte`
**Estimated scope:** Small: 1-2 files

### Checkpoint: Complete
- [x] `npm run lint`, `npm run test`, `npm run check`
- [ ] Manual mobile check: home idle, dropdown states, data-saver untouched
