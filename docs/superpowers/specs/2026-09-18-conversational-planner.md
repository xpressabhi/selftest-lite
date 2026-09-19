# Spec: Conversational Test Planner

**Date**: 2026-09-18
**Status**: Approved for implementation
**Supersedes**: the one-shot `/api/parse-intent` Gemini flow

## Objective

Replace the single-shot intent input on the home page with a chat that negotiates
the test plan, asks targeted questions when the request is ambiguous, and keeps the
plan editable until the user generates the paper.

Success criteria:

- A clear request produces a ready plan in **one turn** with no question asked.
- An ambiguous request gets **at most one question per turn** and **at most two
  clarification rounds**; every question is skippable.
- Plan parameters stay editable at any time (chips as today, plus inline topic
  editing). User edits are never silently overwritten.
- The plan is part of the conversation: the chat thread renders one live plan card
  whose actions are **Edit plan** (toggles chips/pickers) and **Generate paper**.
- While the composer is idle the thread lists the latest tests in reverse order;
  while the user types, past-test matches appear, and the "Create a new test"
  suggestion appears only when nothing matches.
- The generated paper uses the same `/api/generate` payload and flow as today.
- The flow works at 320px, in data-saver mode, offline, with screen readers, and
  with full English + Hindi strings.
- `/api/parse-intent` remains backwards compatible: a request body of `{ intent }`
  alone still works.

## Tech stack

- SvelteKit 2 / Svelte 5 (runes), Tailwind 4 + scoped component CSS
- TypeSafe Jev (`@typesafe-ai/sdk`, model `jev-latest`) for intent understanding
- Zod for request validation
- Neon PostgreSQL only for existing telemetry/rate-limit paths — no schema change
- Vitest for pure-logic unit tests

## Commands

```
npm run dev
npm run lint
npm run test
npm run check
```

## Project structure

```
src/lib/server/intentParse.js        pure intent engine (questions, merge, policy)
src/lib/server/intentParse.test.js   unit tests for the engine
src/routes/api/parse-intent/+server.js  HTTP turn (rate limit, profile, telemetry)
src/lib/client/plannerState.js       pure client state machine + persistence shim
src/lib/client/plannerState.test.js  unit tests for the state machine
src/lib/client/ChatThread.svelte     conversation log + quick replies
src/lib/client/PlannerComposer.svelte  composer + test search
src/lib/client/TestSearchDropdown.svelte  extracted search dropdown
src/lib/client/PreviewCard.svelte    live plan card in the thread (topic edit, Edit/Generate)
src/routes/+page.svelte              composition
```

## Turn protocol

`POST /api/parse-intent`

Request (all fields except `intent` optional; `{ intent }` alone is valid):

```jsonc
{
	"intent": "latest user message (2–500)",
	"plan": {
		"topic": "…",
		"testType": "multiple-choice",
		"difficulty": "intermediate",
		"numQuestions": 15,
		"examId": null,
		"isFullExam": false,
		"language": "english",
	},
	"explicit": { "numQuestions": true },
	"answers": { "examId": "jee-advanced" },
	"askedFields": ["exam"],
	"skippedFields": [],
	"round": 0,
	"recentMessages": [{ "role": "user", "text": "…" }], // max 8, 300 chars each
}
```

Response:

```jsonc
{
  "plan": { … },
  "confidence": "high|medium|low",
  "fieldConfidence": { "topic": 0.72, "exam": 0.41 },
  "clarify": null | {
    "id": "topic|examId|difficulty",
    "promptKey": "plannerClarifyTopic",
    "params": { "topic": "physics" },
    "options": [{ "value": "…", "label": "…" }],
    "allowSkip": true
  },
  "messageKey": "plannerPlanReady|plannerPlanUpdated|plannerNeedOneThing",
  "messageParams": { … }
}
```

One Jev request per turn over accumulated state (`recentMessages`, `answers`,
`current plan`, `student_context`). Questions asked: `is_exam` (Noul),
`exam_id` (Choice over all objective exams + `none`), `test_type`, `difficulty`,
`language` (Choices), `topic_span` (Choice over code-extracted candidate spans +
`none`; omitted when no candidates exist).

## Merge rules

1. Fields the user edited via chips (`explicit`) keep their value unless the latest
   message mentions that field (lexicon detection: question counts, difficulty
   words, language names, test-type words, exam names/aliases).
2. A clarification answer is authoritative for its field. Answers are keyed by
   plan field name (`topic`, `examId`, `difficulty`, ...), so they merge directly.
3. Missing answers fall back to: previous plan value → defaults
   (`intermediate`, `multiple-choice`, `english`, 10 questions / 20 for exams).
4. `numQuestions` comes from code (`extractQuestionCount`), clamp 5–50; defaults
   10 quiz / 20 exam.
5. Topic: exam + span → `"<span> (<exam name>)"`; exam only → `"<exam name>
objective exam paper"`; span only → verbatim span; nothing → raw intent.
6. Exam accepted only when `choice ≠ none`, `confidence ≥ 0.6`, and
   `p(choice) ≥ 0.5`.

## Clarification policy

| Priority | Trigger                                                          | Question                                              |
| -------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| 1        | Topic unidentifiable, no exam chosen, topic not explicit/skipped | subject question (candidate spans, free text allowed) |
| 2        | Exam top probability in `[0.3, 0.6)` and not explicit/skipped    | which exam (top 3 + general quiz)                     |
| 3        | Contradictory difficulty words in the message                    | pick difficulty                                       |
| —        | round ≥ 2, field already asked, or field skipped                 | never asked                                           |

One question per turn. Options come from Jev's probability distribution. Skip uses
a small lexicon (en + hi) and records the field as skipped forever.

## Client surface

One ChatGPT/Gemini-style panel replaces the separate chat column + preview card:

- `ChatThread.svelte` renders, in order: idle state (latest tests in reverse order,
  or example prompts when there is no history), messages and quick replies, the
  typing indicator, and the live plan card as the last item. The card is passed as
  a snippet and only exists once a plan does.
- `PreviewCard.svelte` is the plan card: editable topic, a four-tile parameter
  sheet (questions, format, difficulty, language; full exams add an exam tile),
  where each tile opens its picker in place, and a Generate paper CTA. Tile
  edits set `explicit` and add a compact "plan updated" line, no API call.
- `PlannerComposer.svelte` owns input plus two search affordances. While the
  user types, `TestSearchDropdown.svelte` renders as a compact "Past tests"
  strip above the composer (horizontally scrollable chips, tap to open) — it
  never covers the live plan card. The full overlay opens only from the search
  button (recents by default, matches while typing, and a "Create a new test"
  row when nothing matches); Escape or a click outside closes it. Pressing
  Enter sends to the planner and numeric IDs open the test directly.
- `preview:edit-toggle` records opening/closing a plan tile's picker;
  `search:submit` records the overlay's create action with `source: 'no-matches'`.

## Live preview

Typing updates the plan card without waiting for Enter, in two tiers:

- **Tier 0 (local, instant, free):** `livePreview.js` uses the shared lexicon
  (`src/lib/shared/intentLexicon.js`) for the topic candidate, question count,
  exam name/alias, difficulty/language/test-type words. No network call. Locked
  (`explicit`) fields are skipped.
- **Tier 1 (slim Jev, only when needed):** `/api/parse-intent` with
  `mode: "preview"` fires when the local tier is incomplete — an unmapped
  mention, a difficulty contradiction, an exam hint without an exact exam, or a
  longer topic candidate the local ranker skipped. The payload carries only the
  mentioned field questions (plus a 24-candidate topic span), drops
  `recent_messages`/`student_context`, uses no retries and a 5s timeout.
- Previews never add chat messages or clarification questions, are not
  persisted, and are cancelled by Enter (the turn stays authoritative).
- `/api/parse-intent` allows 100 requests/minute per client; preview successes
  are not written to `api_request_events` (failures are, as
  `parse_intent_preview`). The client throttles previews (900ms debounce, min
  700ms apart, one in flight) and pauses them for 5s after a 429.

## Telemetry

- Per turn: `intent:parse`, `intent:parsed` (with `round`), `intent:parse-failed`.
- New (allowlist + emit-site test updated): `intent:clarification-asked`
  (`field`, `round`), `intent:clarification-answered` (`field`, `outcome`
  `answered|skipped`, `round`), `preview:edit-toggle` (`open`).
- Server `logApiEvent` metadata adds: `round`, `clarifyField`, `provider`,
  `fieldConfidence`.

## Code style

Plain server modules, no Svelte imports in `intentParse.js` / `plannerState.js`.
Semicolons, single quotes, tabs. Pure functions with named constants for all
thresholds. JSDoc on exported functions.

## Testing strategy

- `intentParse.test.js`: question building (exam catalog coverage, `none`, topic
  candidates), number extraction, merge rules, thresholds, clarify priority,
  confidence mapping, malformed answers never throw.
- `plannerState.test.js`: send/answer/skip/edit reducers, explicit protection,
  draft serialize/restore, reset.
- No network or DB in unit tests; Jev is never called from tests.

## Boundaries

- Always: run lint + tests + check before finishing; en + hi strings; allowlist
  telemetry events in the same change as their emit site; guard browser APIs.
- Ask first: new runtime dependencies, any DB/schema change, moving search off home.
- Never: bypass the rate limiter, render unsanitized model output, delete
  telemetry rows, break PWA/Adsense requirements.

## Open questions

- Jev's Hindi accuracy is the biggest unknown; measured via `intent:parse-failed`
  and confidence distribution after launch.
- Clarify thresholds (`0.3 / 0.6 / 0.15`) are initial values to tune from
  telemetry; all live in `intentParse.js`.
