# Statement-Based True/False Format — Design

Date: 2026-10-01
Status: Approved (brainstorm), ready for implementation

## Goal

Repurpose the `true-false` test type so it generates the Hindi-exam
"कथनों पर विचार कीजिए" style the user attached:

- 3 or 4 short numbered statements per question.
- A closing line asking which statements are correct.
- Exactly 4 single-select combination options: `केवल 1`, `1 तथा 2`,
  `2 तथा 3`, ... (English: `Only 1`, `1 and 2`, ...).

The current binary `सत्य / असत्य` two-option output is replaced for new
papers. Old stored papers keep rendering exactly as before (they carry no
`format` discriminator and stay on the generic option renderer).

## Decisions locked in during brainstorming

1. **Replace**, not add: `testType: 'true-false'` now means statement-based.
   No new test type, no new picker entry.
2. **3 or 4 statements, the model's choice** per question.
3. **Server owns options and answer** (same approach as matching and
   assertion-reasoning): the model supplies statements with truth values and a
   rationale; the server composes the question text and builds the four
   combination options, so an option can never contradict the key.
4. The question text is composed server-side (instruction + numbered
   statements + closing question) so every surface — test card, results
   review, print, explain, dedupe — renders it through the existing markdown
   path with no new component.

## Stored question shape

Keeps the `{ question, rationale, options, answer }` contract plus a
`format` discriminator:

```json
{
  "format": "statement-based",
  "question": "निम्नलिखित कथनों पर विचार कीजिए:\n\n1. भारत की संविधान सभा ने राष्ट्रीय ध्वज का प्रस्ताव 22 जुलाई, 1947 को अपनाया था।\n2. राष्ट्रीय ध्वज के बीच चक्र में 21 तीलियां हैं।\n3. राष्ट्रीय ध्वज की लंबाई-चौड़ाई का अनुपात 3:4 है।\n\nउपर्युक्त कथनों में से कौन-सा/से सही है/हैं?",
  "rationale": "कथन 1 सही है; चक्र में 24 तीलियां हैं और अनुपात 3:2 है।",
  "options": ["1 तथा 2", "केवल 1", "2 तथा 3", "केवल 2"],
  "answer": "केवल 1"
}
```

- The answer key stays server-side (`stripAnswerKey` already removes it);
  truth values are never stored, so nothing in the client payload leaks the
  key.
- Grading, the 50-50 hint, results review, print, share cards, and the
  explanation endpoint work unchanged (exact string match against `answer`).

## Generation pipeline

### Prompt (`src/lib/server/prompt.js`)

`true-false` moves to the "server-built options" family (with matching and
assertion-reasoning). Its output contract asks for content only:

```json
{
  "statements": [
    { "text": "First factual statement", "isTrue": true },
    { "text": "Second factual statement", "isTrue": false },
    { "text": "Third factual statement", "isTrue": true }
  ],
  "rationale": "Private reasoning: why each statement is true or false"
}
```

Rules: 3–4 statements; at least one true and at least one false; single crisp
facts; never output options or an answer. The "exactly 2 options" rule and the
generic option-balance/length rules stop applying to `true-false`.

### Schema (`src/lib/server/quizSchema.js`)

`paperSchemaFor('true-false')` returns:

- `statementBasedQuestionSchema`: `{ statements: [{ text, isTrue }] (3–4), rationale }`

The legacy full-question schema stays for every other test type.

### Builder (`src/lib/server/statementBuilder.js`, new)

`buildStatementQuestion(raw, { language, random = Math.random })`:

1. Validate 3–4 statements; non-empty after whitespace/newline collapsing; no
   duplicates; each ≤ 240 chars; at least one `isTrue` and one `false`.
2. Compose the question text in the paper language:
   - Hindi: `निम्नलिखित कथनों पर विचार कीजिए:` / `उपर्युक्त कथनों में से कौन-सा/से सही है/हैं?`
   - English: `Consider the following statements:` / `Which of the statements given above is/are correct?`
3. Build the key from the true set: `केवल 1`, `1, 2 तथा 3` (Hindi),
   `Only 1`, `1 and 2` (English; last separator `and`).
4. Choose 3 distractors from the other non-empty subsets, ranked by symmetric
   difference from the key (closest first, random among ties) — near-miss
   combinations, including the all-statements option when it is close.
5. Shuffle all four options; `answer` = key string.
6. Return `{ ok: true, question }` or `{ ok: false, issues }` with codes:
   - `statement-content-invalid` (count, blank, duplicate, all-true, all-false)
   - `statement-too-long` (> 240 chars)

Helpers `formatStatementOption` / `parseStatementOption` are exported so
validation and tests share the canonical option grammar. Unknown languages
fall back to English (structural issues never come from missing language).

### Validation & quality

- `quizValidation.inspectGeneratedPaper` gains a `statement-based` branch:
  4 options, each parseable into 1–4 distinct ascending statement numbers;
  exactly one option matches the answer; no duplicate options; referenced
  statement count is 3–4; existing math-syntax check. The old
  "true-false must have exactly 2 options" rule is removed.
- `questionQuality.isServerBuiltFormat` includes `statement-based`: no option
  re-shuffle (the builder already shuffled) and no longest-answer tell.
- Duplicate-question and language-drift checks run on the composed text
  (they already do; `questionTextFor` returns `question` for this format).

### Wiring

- `/api/generate`: `buildStructuredQuestions` also runs for `true-false`
  (builder failures become per-index structural issues → salvage regeneration);
  `sanitizeQuestion` preserves `format: 'statement-based'`.
- Intent: `intentParse` test-type description becomes statement-based and
  `intentLexicon` recognizes "कथनों पर विचार" / "statement based" phrasing.
- No locale keys and no UI component changes: the composed question is markdown.

## Error handling & edge cases

- Builder/inspection failures flow through existing salvage issue codes and
  regenerate in the same format; after exhaustion the existing trim/drop
  applies.
- All statements true or all false is rejected: the key must be a proper
  non-empty subset, so a fair key always exists.
- Old binary `सत्य / असत्य` papers (no `format`) still render and grade.
- Full-exam mode already excludes `true-false`; unchanged.
- No new telemetry events; `testType: 'true-false'` metadata is unchanged.

## Testing plan

Failure modes encoded first, then unit tests, then implementation:

- builder rejects: missing/short/long statement lists, blank and duplicate
  statements, > 240-char statements, all-true and all-false sets
- builder accepts: 3 and 4 statements, builds 4 unique shuffled options, the
  key appears exactly once, Hindi and English framing/option text, seeded
  determinism, parse/format round-trip, malformed option strings
- validation: accepts a built question, rejects malformed option strings and
  duplicate options, accepts legacy 2-option papers without a format
- quality: no reshuffle and no longest-answer tell for `statement-based`
- prompt: `true-false` asks for statements and never for options while legacy
  types keep the option contract
- E2E (`tests/e2e/question-formats.e2e.js`): a seeded Hindi statement paper
  renders the composed question (instruction, numbered statements, closing
  line) and four combination options, grades correctly, and the review card
  shows the same text; evidence attaches to the e2e artifact

Verification: `npm run lint`, `npm run test`, `npm run check`, `npm run test:e2e`.

## Out of scope

- Binary `सत्य / असत्य` as a separate selectable format
- 2-statement questions (they cannot produce four clean combination options
  without a "कोई नहीं" option)
- Mixed papers compositing statement questions with other formats
- Renaming the visible "सही/गलत" picker label
- New telemetry events, DB migrations, admin changes

## Files touched

- `src/lib/server/statementBuilder.js` (new) + `statementBuilder.test.js` (new)
- `src/lib/server/prompt.js`, `quizSchema.js`, `quizValidation.js`,
  `questionQuality.js`, `intentParse.js`
- `src/lib/shared/intentLexicon.js`
- `src/routes/api/generate/+server.js`
- updated unit tests: `quizSchema.test.js`, `quizValidation.test.js`,
  `prompt.test.js`, `questionQuality.test.js`
- `tests/e2e/question-formats.e2e.js`
