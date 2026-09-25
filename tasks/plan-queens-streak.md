# Implementation Plan: Queens-Style Streak Card

## Overview

Replace the GitHub-style streak heatmap on Home with a Queens-style card: stats row (Tests · Accuracy · Best score · Max streak), streak headline + flame, a rolling 7-day strip graded by tests taken (1 / 2 / 3+), a 4-milestone badge carousel (3 / 7 / 30 / 100 days), and a "Stay tuned" reminder row shown after the first completed test. Streak freezes are not rendered. Spec: `docs/superpowers/specs/2026-09-25-queens-streak-card-design.md`.

## Architecture Decisions

- **Pure data in `learning.js`**: `buildStreakWeek(streakHistory, { today, locale })` returns 7 cells oldest→today with levels 0/1/2/3; `getStats()` gains `bestScore` (max single-test accuracy %); `STREAK_MILESTONES = [3, 7, 30, 100]`; `ACHIEVEMENTS` gains `streak_30` / `streak_100` (unlock checks use `longestStreak`, like `streak_3` / `streak_7`).
- **Three focused components**: `StreakCard.svelte` (stats, headline, strip, explainer), `StreakBadges.svelte` (carousel), `StreakReminderRow.svelte` (owns `reminders.js` state + toast). HomePage only passes `streak`, `stats`, `historyCount`, `locale`.
- **Week strip is a labelled list, not an image**: per-day `title` + visually hidden text; weekday labels from `Intl.DateTimeFormat` so Hindi works without a hand-written map.
- **Reminder gate**: row renders only when `historyCount ≥ 1` and `remindersSupported()`; support check happens in `onMount` so SSR and first client render agree (no hydration mismatch). Toggle mirrors the results-page checkbox pattern (busy, revert on failure, existing toast keys).
- **Freezes stay in the data**: `freezesRemaining` and its logic are untouched; only UI and orphaned copy are removed.
- **No new telemetry**: `streak:view` (Home) and `reminder:opt-in` (reminders.js) already exist and are allowlisted.
- **Amber levels with dark-mode variants**; carousel scroll is the only animation and respects `.reduce-motion` / `.data-saver`.

## Task List

### Phase 1: Foundation (pure logic + copy)

- [ ] Task 1: `buildStreakWeek`, `bestScore`, milestones (tests first)
- [ ] Task 2: EN + HI strings for the whole card

### Checkpoint: Foundation

- [ ] `npx vitest run src/lib/client/learning.test.js` green
- [ ] `npm run test` green (locales parity + no empty translations)

### Phase 2: Components (built, not yet wired)

- [ ] Task 3: `StreakReminderRow.svelte`
- [ ] Task 4: `StreakCard.svelte` + `StreakBadges.svelte`

### Checkpoint: Components

- [ ] `npm run check` clean
- [ ] Manual dev-server render with seeded `selftest_streak` in localStorage

### Phase 3: Wire, replace, prove

- [ ] Task 5: Home wiring + delete heatmap + rewrite `streak-home` e2e
- [ ] Task 6: remove dead pure code and orphaned locale keys

### Checkpoint: Complete

- [ ] `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e` all green
- [ ] `test-results/e2e-artifact.json` contains the new streak evidence
- [ ] Manual: 320px no overflow, Hindi labels, dark mode, no freeze UI anywhere

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Hydration mismatch from `remindersSupported()` | Med | Check support in `onMount`; initial state false on server and first client render |
| Locale parity test fails | Low | Every key lands in `english.json` + `hindi.json` in the same commit (Task 2) |
| New `streak_30` / `streak_100` achievements change the results page list | Med | Full `npm run test:e2e` at Task 5; adjust only tests that assert the exact list |
| 7 balls + carousel overflow at 320px | Med | Flexible `min-width: 0` columns; e2e asserts zero horizontal overflow |
| e2e accidentally triggers a notification permission prompt | High | Reminder test asserts presence/state only; never clicks the toggle |
| Old e2e asserts 56 heatmap cells | High | e2e rewrite lands in the same task as the Home swap (Task 5), so the pre-commit suite never goes red |
| `buildStreakWeek` "today" depends on device clock | Low | `today` injectable; unit tests pin a fixed date |

## Open Questions

- None blocking. Carousel dots are indicators; arrows are the only controls (keyboard-focusable). If badge tap-through to a dedicated achievements view is wanted later, it is listed as backlog in the spec.
- Tasks tracked in `tasks/todo-queens-streak.md`.
