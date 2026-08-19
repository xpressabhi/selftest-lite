# Test-Taking Flow & Results Redesign — Design

Date: 2026-08-07
Status: Approved (awaiting spec review)

## Goal

Modernize the exam-style test-taking experience: user answers questions one at a time and submits the whole test at the end. Today the flow relies on a native `confirm()` dialog, a cluttered header, a hidden question navigator, and a static submit summary. This redesign makes the test view full-screen and focused, adds flag-for-review and a review sheet before submission, an auto-advance option, and a scannable filterable results review.

Hard constraints (from AGENTS.md): mobile-first with low-end Android + data-saver as baseline, safe-area awareness, 44px+ tap targets, EN/HI localization for every user-facing string, `npm run lint` / `npm run check` / `npm run test` must pass.

## Decisions (from ideation)

| #   | Decision       | Choice                                                                      |
| --- | -------------- | --------------------------------------------------------------------------- |
| 1   | Scope          | Test-taking flow + results page (not home/config)                           |
| 2   | Answer flow    | Auto-advance on answer, toggleable (default on)                             |
| 3   | Submit moment  | Full review sheet before submit (replaces `confirm()`)                      |
| 4   | Results layout | Score card + filterable/collapsible review                                  |
| 5   | Exam extras    | Flag for review only (no live timer, no keyboard shortcuts)                 |
| 6   | Layout         | Full-screen focused mode — site nav hidden on `/test`                       |
| 7   | Answering      | One-at-a-time card, options as letter-badged selectable cards, tap-to-clear |

## Section 1 — Test page: immersive shell

`src/routes/+layout.svelte` hides `TopNav` and `BottomNav` when `$page.url.pathname === '/test'` (deterministic pathname check — no client-side flash, no store required). The test page owns the full viewport:

- **Top header** (sticky): Exit button (chevron-left + "Exit"), centered topic title (single line, truncated), "⋯" overflow menu containing **Share** and **Auto-advance** toggle. A thin progress segment bar under the header shows current position (`currentQuestionIndex / total`).
- **Exit safety**: if any answers exist, a styled modal appears: "Leave test? Your answers are saved as a draft." with [Leave] [Keep taking]. Leave → `goto('/')`. If no answers, exit directly.
- The `testId` badge is removed from the header (noise); share still uses the existing `shareTest()` logic via the overflow menu.

## Section 2 — Question card & answering

- Card top row: question number + **Flag** button (outline flag → filled amber when flagged; 44px target). Flagged state stored in a `flagged` set.
- Question text via existing `MarkdownContent` (unchanged).
- Options rendered as full-width selectable cards with letter badges (A/B/C/D), min-height 52px, `text-start`, wrapping long content. Selected: brand fill + check icon. Tapping the selected option clears the answer.
- Keep existing slide transition (`navigationDirection` forward/backward), `AnimatedHeight`, and question-card height estimation (`pretextLayout.estimateQuestionCardHeight`). All motion honors `isDataSaverActive` / `prefers-reduced-motion` as today.
- **Auto-advance**: when the preference is on and an answer is set (not cleared), advance to the next question after ~250ms so the user sees the selection state. No auto-advance past the last question.

## Section 3 — Sticky bottom action bar

Always visible during the test (safe-area inset aware, `padding-bottom: env(safe-area-inset-bottom)`):

- Left: answered pill **"5/20"** with a mini progress fill; tapping it opens the review sheet. A small amber flag-count badge appears next to it when flags > 0.
- Right: **Prev** (disabled on first question) / **Next**. On the last question, Next is replaced by a primary **Submit** button that opens the review sheet.

## Section 4 — Review sheet (new component)

New `src/lib/client/ReviewSheet.svelte`. Bottom sheet on mobile (slide-up), centered dialog on desktop. Props: total, answers, flagged set, current index, callbacks (`onJump(index)`, `onClose()`, `onSubmit()`, `onReviewUnanswered()`).

- Header: "Review answers" + answered count + close button.
- Question grid: numbered tiles; states — answered (brand fill), unanswered (outline), flagged (amber dot), current (ring). Tap tile → `onJump(index)` + close sheet.
- Legend row: answered / unanswered / flagged.
- Footer: inline amber warning "You have N unanswered questions" when unanswered > 0; secondary button "Continue answering" (close); chip "Review unanswered" (jumps to first unanswered, closes); primary **Submit Test** button (spinner + "Submitting…" while submitting). Unanswered questions are NOT blocked — the warning + explicit button tap is the confirmation.
- Sheet is `role="dialog"` with Escape-to-close and focus on the close button on open (basic a11y).

## Section 5 — State & persistence

- **Flagged set**: persisted per paper under key `selftest_draft_flags_<id>` (separate from the existing answers draft key so current drafts stay compatible). New helpers in `src/lib/client/storage.js`: `readDraftFlags(testId)`, `writeDraftFlags(testId, flagged)`, `clearDraftFlags(testId)` — mirroring the existing `readDraftAnswers`/`writeDraftAnswers`/`clearDraftAnswers`. Vitest coverage added next to the source.
- **Auto-advance preference**: new `autoAdvance` writable store in `src/lib/client/preferences.js`, persisted to localStorage key `selftest_autoAdvance`, default `true`. Toggled from the overflow menu.
- Draft answers flow unchanged: read on mount, write on change, cleared on submit.
- Submission pipeline unchanged: local grading or `/api/test/submit`, `saveAttemptResult`, `upsertHistory`, `pushAttempt`, `recordStreakActivity`, `unlockAchievements`, redirect to `/results?id=...`.

## Section 6 — Results page

- **Score card polish**: percentage shown as a progress-ring instead of the flat `score-circle`; keep score/total, time, share/print/new-quiz actions.
- **Filter bar**: chips All / Correct / Incorrect / Unanswered with live counts; filters the question list; filter state is page-local (not persisted).
- **Question cards**: collapsible with a chevron. Default: correct questions collapsed, incorrect/unanswered expanded. Expanded content unchanged (your answer, correct answer, options review with green/red highlighting, bookmark, on-demand explanation).
- Streak / stats / achievements / topic-mastery / review-queue panels unchanged.

## Section 7 — Localization

Every new/changed user-facing string added to `src/lib/locales/english.json` and `src/lib/locales/hindi.json` and looked up via `t()`/`translate()`. Expected new keys: exit, leaveTestTitle, leaveTestBody, keepTaking, leave, reviewAnswers, reviewUnanswered, continueAnswering, flagForReview, flaggedQuestions, autoAdvance, filterAll, filterCorrect, filterIncorrect, filterUnanswered (reuse existing `correct`/`incorrect` where possible). Existing keys reused wherever possible.

## Files touched

| File                                         | Change                                                             |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `src/routes/+layout.svelte`                  | Hide TopNav/BottomNav on `/test`                                   |
| `src/routes/test/+page.svelte`               | Full redesign (header, card, bottom bar, sheet wiring, exit modal) |
| `src/lib/client/ReviewSheet.svelte`          | New component                                                      |
| `src/lib/client/storage.js`                  | Flag read/write/clear helpers                                      |
| `src/lib/client/storage.test.js`             | Flag helper tests                                                  |
| `src/lib/client/preferences.js`              | `autoAdvance` store + persistence                                  |
| `src/routes/results/+page.svelte`            | Score ring, filter chips, collapsible cards                        |
| `src/lib/locales/english.json`, `hindi.json` | New keys                                                           |

## Error handling

- Submit failure keeps the existing behavior: localized error message shown in the sheet area, sheet stays open, user can retry.
- Exit modal and review sheet never block the app if telemetry or storage calls fail (best-effort, as today).

## Verification

1. `npm run lint`
2. `npm run check`
3. `npm run test` (including new flag helpers)
4. Manual pass on mobile viewport (320px+): full-screen mode, bottom bar safe-area, sheet, filters, flag flow, auto-advance on/off, exit modal, draft restore.
5. Manual data-saver / "Slow 3G" pass: transitions disabled, no jank.
6. EN + HI strings verified on the test page.
