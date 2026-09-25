# Queens-Style Streak Card — Design

Date: 2026-09-25
Status: approved (all decisions confirmed in brainstorm)
Scope: Home streak card only. Freezes are explicitly out of scope for now.

## 1. Decisions

- Replace the GitHub-style `StreakHeatmap` on Home with a Queens-style card:
  stats row, streak headline + flame, one-line week strip, badge carousel,
  "Stay tuned" reminder row.
- Week strip: rolling last 7 days, today is always the last ball, graded by
  tests taken that day.
- Badges: Queens-style carousel of 4 streak milestones (3 / 7 / 30 / 100 days).
- Reminder row: visible only after the first completed test.
- Stats: Tests · Accuracy · Best score (%) · Max streak.
- Streak freezes: not rendered anywhere; data and logic stay untouched.

## 2. Components & data flow

```
HomePage.svelte
├─ getStreak() ─────────────────┐
├─ getStats(historyEntries) ────┤
└─ historyEntries.length ───────┤
                                ▼
                        StreakCard.svelte
                        ├─ stats row (4 values)
                        ├─ headline + flame
                        ├─ week strip  ← buildStreakWeek()
                        ├─ StreakBadges.svelte ← longestStreak
                        └─ StreakReminderRow.svelte (only if historyCount ≥ 1)
```

- `src/lib/client/StreakCard.svelte` (new): stats row, headline, week strip,
  explainer. Props `{ streak, stats, historyCount, locale }`. Replaces
  `StreakHeatmap` in the same slot on Home (after the unsubmitted-test alert,
  before QuickStart). Card stays visible for brand-new visitors as the
  onboarding empty state.
- `src/lib/client/StreakBadges.svelte` (new): 4-milestone carousel. Props
  `{ streak, locale }`; earned when `longestStreak ≥ milestone`, locked shows
  grey star + progress (`min(currentStreak, days)/days`).
- `src/lib/client/StreakReminderRow.svelte` (new): owns reminder state through
  the existing `reminders.js` (`isReminderEnabled`, `enableReminders`,
  `disableReminders`), busy flag, revert-on-failure and toast — same pattern as
  `src/routes/results/+page.svelte`.
- `src/lib/client/learning.js`:
  - `buildStreakWeek(streakHistory, { today = new Date(), locale = 'en' })` —
    pure; returns 7 cells oldest → today:
    `{ date, quizCount, level, active, isToday, weekdayLabel, ariaLabel }`,
    where `level` is `0` (none), `1` (1 test), `2` (2 tests), `3` (3+ tests).
    Invalid entries, `quizCount ≤ 0` and out-of-window dates are ignored;
    input is never mutated.
  - `getStats` gains `bestScore`: max single-test accuracy in percent
    (`0` when there are no completed tests).
  - `STREAK_MILESTONES = [3, 7, 30, 100]` exported for the carousel and tests.
  - `ACHIEVEMENTS` gains `streak_30` and `streak_100`; unlock checks use
    `longestStreak`, matching the existing `streak_3` / `streak_7` checks.
- Delete `src/lib/client/StreakHeatmap.svelte`, `buildStreakGrid`, unused
  `getWeekActivity`, and the `buildStreakGrid` unit tests. The results-page
  reminder block stays unchanged (two entry points, one subscription).

## 3. Behavior & content

### Week strip

- Last 7 calendar days ending today, device-local dates (same `todayString`
  semantics as the rest of `learning.js`), oldest left, today right.
- Levels: `0` grey ball · `1` light amber with ✓ · `2` mid amber with "2" ·
  `3+` deep amber with "3+". Amber connector between consecutive active days;
  today gets an amber ring. Any submitted test counts (Daily Five included).
- With zero activity the strip renders 7 grey balls plus the empty-state line.

### Stats row

- Tests (`totalTests`) · Accuracy (`averageScore` %) · Best score
  (`bestScore` %) · Max streak (`longestStreak`).
- With zero completed tests, Accuracy and Best score show "—", not "0%".

### Headline

- `streakHeadline` with `{count}`: "{count}-day test streak" + flame icon
  (existing `Icon name="flame"`).
- Subtitle by state:
  - 0 → `streakEmpty` ("Practice today to start your streak.")
  - 1 → `streakSubtitleOne` ("You're on the board — come back tomorrow!")
  - 2–6 → `streakSubtitleRolling` ("You're on a roll — keep it going!")
  - 7+ → `streakSubtitleRecord` ("You're setting records with your streak!")

### Badges

- Milestones 3 / 7 / 30 / 100 days; names reuse `achievement_streak_3/7/30`
  and add `achievement_streak_100_*` ("Century" / "शतक").
- Carousel: 3 badges visible at 320px, arrows scroll one badge, 4 indicator
  dots, arrow buttons keyboard-focusable with aria-labels, reduce-motion and
  data-saver scroll instantly. Locked badges show `streakBadgeProgress`
  ("{current}/{target} days").
- Adding `streak_30` / `streak_100` to `ACHIEVEMENTS` keeps the results-page
  achievements list consistent with the card.

### Reminder row

- "Stay tuned" + "Daily practice reminders" (`streakReminderTitle` /
  `streakReminderBody`); shown only when `historyCount ≥ 1` and
  `remindersSupported()`.
- Toggle mirrors the results-page checkbox pattern: busy state, revert on
  failure, toasts reuse `reminderDenied` / `reminderUnconfigured` /
  `reminderFailed`. Default timing stays the smart morning/evening window.
- Existing `reminder:opt-in` telemetry fires through `reminders.js`; no new
  events.

### Freezes and explainer

- `freezesRemaining` is never rendered. No freeze grants or logic changes.
- `streakExplainer` loses the freeze sentence: "A streak counts days you take
  at least one test. Miss a day and it starts over." (EN + HI).
- Keys that become unused (`streakGridLabel`, `streakFreezes`, and any other
  orphaned streak key) are removed in the same change.

### Accessibility, i18n, performance

- Week strip is a list of 7 labelled days (not `role="img"`): each day has a
  localized `title` and visually hidden text like "{date}: {count} tests", so
  screen readers get per-day detail; the list carries `streakWeekLabel`.
- Weekday labels come from `Intl.DateTimeFormat(locale, { weekday: 'short' })`
  (`en-IN` / `hi-IN`), so Hindi gets शुक्र, शनि, … without a hand-written map.
- Every new string ships in `english.json` + `hindi.json`. Reminder toggle
  stays a checkbox input with a visible focus ring, as on results.
- Static markup, no new fetches or timers. Amber level tokens get dark-mode
  variants; only the carousel scroll animates, and not under
  `.data-saver` / `.reduce-motion`.

## 4. Tests

- Unit (vitest, next to `learning.js`):
  - `buildStreakWeek`: exactly 7 cells ending today, level mapping 0/1/2/3,
    invalid and future-dated entries ignored, en/hi weekday labels, input not
    mutated.
  - `getStats().bestScore`: max accuracy across completed tests, 0 with none.
  - `STREAK_MILESTONES` shape.
  - Remove the `buildStreakGrid` tests with the function.
- E2E (`tests/e2e/streak-home.e2e.js` rewrite, seeded via localStorage):
  - 7 balls with the expected level classes and today ring; amber connectors.
  - Stats row values; "—" for a visitor with no tests.
  - Headline count and state subtitle.
  - Earned vs locked badges and progress; arrow click moves the carousel.
  - Reminder row hidden for a fresh visitor, visible after a completed test
    (assert presence/state only; never click through a permission prompt).
  - Empty state, Hindi labels, no horizontal overflow at 320px.
  - Results page still renders no streak panel.
  - Evidence attached per test; `test-results/e2e-artifact.json` unchanged in
    shape.
- Verification before merge: `npm run lint`, `npm run check`, `npm run test`,
  `npm run test:e2e`.

## Out of scope / backlog

- Streak freezes UI and grants.
- Push notification copy changes (existing streak-aware reminders stay).
- Weekly/monthly summary views or a return of the 8-week grid.
- Badge tap → dedicated achievements view on Home.
