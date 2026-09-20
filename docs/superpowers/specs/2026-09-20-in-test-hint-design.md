# In-Test 50-50 Hint — Design

Date: 2026-09-20
Status: approved (trigger adjusted: button always visible, disabled until unlocked)
Scope: 50-50 lifeline only. Backlog ideas listed at the bottom as future work.

## 1. Trigger (approved, adjusted)

- Button always rendered in the question-card head beside Flag; disabled by
  default with microcopy (`hintUnlockSoon`, EN+HI): it enables when the
  learner looks stuck. No layout shift, discoverable from Q1.
- Tier-0 local signals: dwell >45s on an unanswered question OR 2-3
  consecutive unanswered nexts (skip streak). Max 3 offers per test.
- Jev confirms via the existing `test-moment` fan-out (`stuck:Noul` +
  `hint_worthy:Noul`); the extra question rides the call the router already
  makes, so no new Jev call. Code ignores the answer unless Tier-0 already
  suspects stuck.
- Data-saver/offline: button stays disabled (elimination needs the server).

## 2. Server endpoint (approved)

- `POST /api/test/hint { id, index }` → verifies the paper exists and is
  unsubmitted, returns `{ eliminated: [i, j] }`: two wrong-option indexes
  only, never the answer. Fresh papers carry no answer key client-side
  (`stripAnswerKey`), so elimination cannot happen locally.
- Rate cap: 3 per test (checked against stored hint usage). 4th call → 429.
- Review papers (answer key already local) eliminate client-side, no call.
- Submit payload gains `hintedIndexes[]`; the server stores them with the
  attempt. Scoring unchanged (full marks, usage tracked only).

## 3. UI + telemetry (approved)

- Tap → loading state → 2 options dimmed with `aria-disabled`, unselectable;
  button becomes used-state. Once per question; eliminated indexes persist
  alongside draft answers/flags so navigation and reload keep them.
- Per-question dwell is tracked client-side (timestamp set on each
  `selectQuestion`); the existing global timer is not per-question.
- Motion: subtle enable pulse, disabled under `.data-saver`/`.reduce-motion`.
- Locales mandatory: `hintFiftyFifty`, `hintUnlockSoon`, `hintUsed` in
  `english.json` + `hindi.json`.
- Telemetry (same commit as emit sites): `test:hint-offer`,
  `test:hint-use`, `test:hint-fail`.

## 4. Tests

- Pure: elimination picker (never includes answer, exactly 2, deterministic
  given key) + trigger helpers (dwell/skip-streak predicates) as vitest unit
  tests next to source.
- Route: 400/404-gone/429-cap shapes; fail-closed on submitted paper.

## Out of scope / backlog (future specs)

- Explain-one-wrong-option via existing `/api/explain`.
- Skip-streak rescue ("easier 3 on this topic").
- ReviewSheet risk summary (flagged + hinted counts).
- "Retry hinted only" practice set on results.
- "Struggled topics" Daily 5 on home.
- Strict-vs-practice mode toggle.
