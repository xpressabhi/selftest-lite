# Jev Hybrid Personalization — Design

Date: 2026-09-20
Status: approved sections 1-4, awaiting spec review
Scope: realtime personalization + clutter-free UI for selftest-lite. No Gemini prompt changes. No DB migration.

## 1. Architecture (approved)

Hybrid, code owns workflow, Jev supplies typed judgments (~100ms):

- Central router: 1 `systemOne` fan-out per page (`home`, `history`, `results`, `practice`). Decides show/hide/promote. Best for declutter.
- Micro: Jev only at `test` (stuck/fatigue) and onboarding (profile infer). Debounced, local Tier-0 first.
- Existing `parse-intent` unchanged. New `/api/personalize` owns central + micro inference. Keys server-side via `$env/dynamic/private`.
- Fail-open: any Jev error/timeout/low-confidence falls back to current static UI.
- Data-saver / offline: skip Jev, use Tier-0.

## 2. Central judgments (approved)

One request, speculative questions, code ignores unused branches.

Home — state: `{signals{weakTopics, overallAccuracy, testsTaken}, streak, unsubmitted?, reviewDueCount, profileExamTarget}`.
- `primary_action:Choice` — `resume_unfinished|review_due|daily_five|new_quiz|exam_mock|browse` → render 1 primary CTA, collapse rest.
- `exam_pressure:Score` — `none|some|cramming` → QuickStart vs ExamBrowser visibility.
- `wants_revision:Noul`, `wants_new:Noul` — speculative.

History — state: top-5 recent `{topic, score, ageDays, submitted?}`.
- `resume_likelihood:Score[0..3]` per item (composite in code, show top 1-2, hide rest behind search).
- `abandoned:Noul` → nudge unsubmitted only when likely.

Results — state: `{score_pct, wrongCount, total, mastery[0..4], reviewToday}`.
- `focus:Choice` — `fix_mistakes|celebrate|plan_review` → expand 1 panel.
- `show_achievements:Noul`, `show_review_queue:Noul`, `expand_wrong_only:Noul` → replace show-all-if-exists.

Practice hub — state: `{profileExamTarget, weakTopics, pastExams}` + exam list ids.
- `recommended_exam:Choice` (+ `none` fallback) + `time_pressure:Score` → promote 1-3 cards, rest in grid.

Confidence: `<0.5` minimal default; `0.5-0.8` CTA + confirm; `>0.8` auto-expand. Thresholds tuned on logs.

## 3. Micro judgments (approved)

In-test — local signals `{dwellSec, skips, flags, answeredRatio, elapsedMin}` sent debounced (min 8s gap, max 3/test).
- `stuck:Noul`, `hint_depth:Score` (`nudge|worked_hint|full_reteach`), `fatigue:Score` → show hint button / collapse timer+flag chrome.
- Never auto-advance or auto-submit on Jev output.

Onboarding — state: one free-text line + current draft.
- `class:Choice`, `exam:Choice`, `language:Choice`, `subject_span:Choice` with `none` options.
- `>0.8` autofill wizard, `0.5-0.8` confirm chip, `<0.5` ask as today. Reduces 12-field form in `profile/+page.svelte`.

## 4. Flow, safety, telemetry, tests (approved)

- Routes: `POST /api/personalize {page, state}` → `{answers, applied}`; extend `parse-intent` only for onboarding infer (no new route). Client triggers: page-load once (central), interaction-debounced (micro).
- Timeouts: 4000ms client, 5000ms server, 0 retries for preview-type, 1 retry for explicit turns. Follows `parse-intent/+server.js` pattern.
- Privacy: PII-free state (topic strings + counts + recency only). Reuse `buildStudentContext`, `aggregateLearnerSignals`.
- Telemetry: add `personalize:request`, `personalize:applied`, `personalize:fallback` to `src/lib/shared/telemetryEvents.js` in same commit; tests enforce allowlist.
- Tests: pure `derivePersonalize()` next to `intentParse.js` style; vitest for merge/threshold/fallback. No network in unit tests.
- Clutter rule: every Jev hide must have a `View all / details` path; never delete data (archive-first per AGENTS.md).

## Out of scope

No auto-grading, no prompt rewrite, no new PWA caching, no admin changes.
