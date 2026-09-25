# Todo: Queens-Style Streak Card

## Task 1: Pure streak-week engine, best score, milestones (tests first)
**Description:** In `learning.js`, add `buildStreakWeek(streakHistory, { today, locale })` (7 cells oldest→today: `{ date, quizCount, level, active, isToday, weekdayLabel, ariaLabel }`, levels 0/1/2/3, ignores invalid/`≤0`/future-dated entries, never mutates input), add `bestScore` (max single-test accuracy %, 0 with no completed tests) to `getStats`, export `STREAK_MILESTONES = [3, 7, 30, 100]`, and add `streak_30` / `streak_100` to `ACHIEVEMENTS` + unlock checks (`longestStreak`). Write the unit tests first (failing), then implement. Keep `buildStreakGrid` / `getWeekActivity` untouched until Task 6.
**Acceptance criteria:**
- [ ] `buildStreakWeek` returns exactly 7 cells ending on injected `today`, oldest first
- [ ] Levels map 0/1/2/3 tests correctly; invalid, zero/negative and future-dated entries are ignored
- [ ] en-IN and hi-IN weekday labels come from `Intl.DateTimeFormat`; input array not mutated
- [ ] `getStats().bestScore` = max accuracy across completed tests, 0 with none
- [ ] `STREAK_MILESTONES` is `[3, 7, 30, 100]`; `streak_30` / `streak_100` unlock on `longestStreak`
**Verification:**
- [ ] Tests pass: `npx vitest run src/lib/client/learning.test.js`
- [ ] Tests pass: `npm run test`
**Dependencies:** None
**Files likely touched:**
- `src/lib/client/learning.js`
- `src/lib/client/learning.test.js`
**Estimated scope:** Small: 2 files

## Task 2: EN + HI strings for the card
**Description:** Add to both `english.json` and `hindi.json`: `streakStatTests`, `streakStatAccuracy`, `streakStatBest`, `streakStatMax`, `streakHeadline` (`{count}`), `streakSubtitleOne`, `streakSubtitleRolling`, `streakSubtitleRecord`, `streakWeekLabel`, `streakDayNone`, `streakDayOne`, `streakDayCount` (`{count}`), `streakBadgeProgress` (`{current}`/`{target}`), `streakBadgesLabel`, `streakBadgePrev`, `streakBadgeNext`, `streakReminderTitle`, `streakReminderBody`, `achievement_streak_100_title`, `achievement_streak_100_description`. Update `streakExplainer` in both languages to drop the freeze sentence.
**Acceptance criteria:**
- [ ] Every key exists in both files with the same name
- [ ] No empty strings; `{count}` / `{current}` / `{target}` placeholders match existing i18n interpolation
- [ ] Hindi copy reads naturally (no machine-literal phrasing)
**Verification:**
- [ ] Tests pass: `npm run test` (locale parity + non-empty checks)
**Dependencies:** None
**Files likely touched:**
- `src/lib/locales/english.json`
- `src/lib/locales/hindi.json`
**Estimated scope:** Small: 2 files

## Checkpoint: After Tasks 1-2
- [ ] Unit tests + locale parity green
- [ ] `buildStreakGrid` still works (nothing removed yet)

## Task 3: `StreakReminderRow.svelte`
**Description:** New component owning reminder state via `reminders.js` (`isReminderEnabled`, `enableReminders`, `disableReminders`), with busy flag, revert-on-failure and toasts (`reminderDenied` / `reminderUnconfigured` / `reminderFailed`). Props `{ historyCount }`; renders nothing unless `historyCount ≥ 1` and push is supported (support resolved in `onMount`). Checkbox input with focus ring, "Stay tuned" + "Daily practice reminders" copy.
**Acceptance criteria:**
- [ ] Hidden for fresh visitors and unsupported browsers; no hydration mismatch
- [ ] Toggle reflects live subscription state; failure reverts the checkbox and toasts
- [ ] Busy state prevents double toggles; `reminder:opt-in` telemetry fires via `reminders.js`
**Verification:**
- [ ] Build succeeds: `npm run check`
- [ ] Manual check: dev server with seeded history shows the row; toggle without a real subscription path stays inert
**Dependencies:** Task 2
**Files likely touched:**
- `src/lib/client/StreakReminderRow.svelte`
**Estimated scope:** Small: 1 file

## Task 4: `StreakCard.svelte` + `StreakBadges.svelte`
**Description:** Card renders stats row (Tests · Accuracy · Best score · Max streak; "—" for Accuracy/Best when there are no tests), headline `{count}-day test streak` + flame with state subtitle, rolling week strip from `buildStreakWeek` (labelled list, amber levels 1/2/3, connectors, today ring), explainer, and the reminder row. `StreakBadges` renders the 4-milestone carousel: earned when `longestStreak ≥ milestone`, locked with progress, arrows (keyboard, aria-labelled), indicator dots, instant scroll under reduce-motion/data-saver. Scoped styles with dark-mode amber variants.
**Acceptance criteria:**
- [ ] Stats and headline match seeded values; empty stats show "—" not "0%"
- [ ] 7 cells with level classes, today ring, amber connectors only between active days
- [ ] Badge states + progress correct; arrows move the carousel; all new copy from locales
- [ ] 320px: no horizontal overflow; no animation under reduce-motion/data-saver
**Verification:**
- [ ] Build succeeds: `npm run check`
- [ ] Manual check: dev server, seeded localStorage, light + dark
**Dependencies:** Tasks 1-3
**Files likely touched:**
- `src/lib/client/StreakCard.svelte`
- `src/lib/client/StreakBadges.svelte`
**Estimated scope:** Medium: 2 files

## Checkpoint: After Tasks 3-4
- [ ] `npm run check` clean
- [ ] Components render correctly with seeded data before Home is touched

## Task 5: Home wiring + heatmap removal + e2e rewrite
**Description:** In `HomePage.svelte`, import `StreakCard` and `getStats`, compute `stats` once from `historyEntries`, replace the `StreakHeatmap` usage with `<StreakCard {streak} {stats} historyCount={historyEntries.length} locale={...} />`, keep `showStreakCard` and the `streak:view` emit. Delete `StreakHeatmap.svelte`. Rewrite `tests/e2e/streak-home.e2e.js`: level classes + today ring, stats values and "—" empty case, headline/subtitle, earned/locked badges + arrow movement, reminder row hidden for fresh visitors / visible after a completed test (no toggle clicks), empty state, Hindi labels, 320px overflow, results page still has no streak panel. Attach evidence per test.
**Acceptance criteria:**
- [ ] Home renders the new card in the old heatmap slot; no freeze UI anywhere
- [ ] e2e covers every spec assertion and passes on Chromium
- [ ] `test-results/e2e-artifact.json` regenerated with the new evidence
**Verification:**
- [ ] Tests pass: `npx playwright test tests/e2e/streak-home.e2e.js`
- [ ] Tests pass: `npm run test:e2e`
- [ ] Build succeeds: `npm run check`
**Dependencies:** Tasks 1-4
**Files likely touched:**
- `src/lib/client/pages/HomePage.svelte`
- `src/lib/client/StreakHeatmap.svelte` (delete)
- `tests/e2e/streak-home.e2e.js`
**Estimated scope:** Medium: 3 files

## Task 6: Remove dead pure code and orphaned locale keys
**Description:** Delete `buildStreakGrid` and `getWeekActivity` from `learning.js` plus their unit tests. Remove locale keys that are provably unused after the swap (`streakGridLabel`, `streakFreezes`, and any of `dayStreak`, `best`, `streakDaysUnit`, `streakTotalDays`, `streakLabel` with no remaining reference) from both languages. Grep each key before removing.
**Acceptance criteria:**
- [ ] No references remain to removed functions or keys (`grep` clean)
- [ ] No locale key removed that is still used by a component, script or test
**Verification:**
- [ ] Tests pass: `npm run test`
- [ ] Build succeeds: `npm run check`
**Dependencies:** Task 5
**Files likely touched:**
- `src/lib/client/learning.js`
- `src/lib/client/learning.test.js`
- `src/lib/locales/english.json`
- `src/lib/locales/hindi.json`
**Estimated scope:** Small: 4 files

## Checkpoint: Complete
- [ ] `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e` all green
- [ ] Artifact inspected: new streak evidence, git SHA stamped
- [ ] Manual: 320px, Hindi, dark mode, no freeze UI, reminders row gating
- [ ] No commit until user approves
