# Own Tests Only on Home — Design

Date: 2026-09-21
Status: approved
Scope: home planner recent block + planner search dropdown empty/short-query behavior. Discovery via explicit search is unchanged.

## 1. Problem (approved)

Home merges the 5 globally newest tests (`GET /api/test?q=`) into the idle
"recent tests" block, and the planner search dropdown shows the same global
list when the query is empty. New visitors mistake strangers' papers for their
own tests or official site content, which muddies the planner's purpose.

Decision: home and the empty search dropdown show only the visitor's own
tests. Other people's tests stay reachable through explicit search (4+ chars
or a test ID) and share links.

## 2. Home behavior (approved)

- The idle recent block renders from local history only
  (`getHistory()` minus `getHiddenHistoryIds()`, capped at 5). No `/api/test`
  fetch, no `SERVER_RECENT_TESTS` cache, no TTL helpers.
- After a best-effort `hydrateHistoryFromServer()` on mount, repaint once if
  server attempts changed the local list. The existing `recentListTouched`
  guard still prevents swapping rows after the user has interacted.
- Strangers with no history see the example-prompt chips only: no skeleton,
  no placeholder, no "nothing here yet" copy. The block appears after the
  first successful generation (`saveCurrentPaper` → `upsertHistory`).
- Cross-device note: submitted tests hydrate through attempts; tests
  generated but never submitted elsewhere are not shown (accepted).

## 3. Search dropdown (approved)

- Empty or 1–3 character query: render the visitor's own tests from local
  history, filtered case-insensitively by topic substring or id substring,
  newest first, capped at 10. No server call, so no global list leaks through
  the empty-query path. The existing `startTypingToGenerate` empty state
  covers visitors with no own matches.
- 4+ characters or an all-digit query: unchanged server search (debounced)
  with the same result, exact-id, `noTestsFound`, and rate-limit states.
- Removes the `recentCache`/`RECENT_TTL_MS` machinery; `search:keystroke`
  telemetry stays.

## 4. Cleanup

- Delete `STORAGE_KEYS.SERVER_RECENT_TESTS`, `readRecentCache`,
  `isCacheFresh`, `RECENT_CACHE_TTL_MS`, `normalizeServerEntry`, and the
  `server` option of `mergeRecentTests`.
- Add a pure helper `toOwnTestResults(history, query, { hidden, limit })`
  next to `mergeRecentTests` for the dropdown's local results.
- No locale changes: the block keeps `plannerRecentTests` and the dropdown
  keeps `recentTests` / `startTypingToGenerate`.

## 5. Telemetry and verification

- No new events. Home still emits `history:open-test { source: 'planner' }`;
  server results still emit `search:result-click`.
- Baseline before/after with `npm run telemetry:report -- --days=30`:
  home `generate:start`, `search:result-click`, `history:open-test`.
- E2E only (`tests/e2e/smoke.e2e.js`): own-tests-only home + dropdown, hidden
  ids, caps (5 home / 10 dropdown), short-query filter, no global list
  request, typed search still server-backed. The run emits
  `test-results/e2e-artifact.json` (per-test status + attached evidence,
  tied to the git revision) via `tests/e2e/artifactReporter.js`.
- Run lint, check, test.

## Out of scope

- Owner-filtered server listing (`created_by_user_id`) for cross-device
  unsubmitted tests.
- A public browse/discovery page for community tests.
- `/history` page behavior.
