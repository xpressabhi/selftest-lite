# Matching Columns & Assertion-Reasoning Question Formats — Design

Date: 2026-09-24
Status: Approved (brainstorm), ready for implementation plan

## Goal

Add two India-exam-style paper formats to Selftest-lite as new selectable test types:

- **Matching Columns** (`testType: 'matching'`) — classic "Match List I with List II": Column I with 4 items, Column II with 4 items, and four answer-combination options (`1-B, 2-D, 3-A, 4-C`). Single-select; the learner picks one option.
- **Assertion-Reasoning** (`testType: 'assertion-reasoning'`) — the standard fixed four statements ("Both A and R are true, and R is the correct explanation of A", …), single-select.

Both formats must work in quiz-practice **and** full-exam mode.

## Decisions locked in during brainstorming

1. Matching is answered as classic exam MCQ (single-select combination) — no interactive pairing, no partial credit. Reuses scoring, hint, verification, and results unchanged.
2. Both formats are **new selectable test types**; they are not auto-mixed into `mixed` papers.
3. Assertion-Reasoning uses the **standard fixed option statements in conventional order**, never shuffled, exempt from length-tell checks.
4. Approved UI: matching = **side-by-side grid** (Column I 1–4 left, Column II A–D right, aligned rows); A-R = **plain inline labels** (`Assertion (A):` / `Reason (R):` bold prefixes on paragraphs).
5. Approach 1: **the model supplies content only; the server owns options and answer** (combination strings, canonical A-R statements). The model can never emit a malformed matching question.

## Stored question shapes

Both formats keep the existing `{ question, rationale, options, answer }` contract, adding a `format` discriminator plus structured fields. Everything downstream (answer stripping, JSONB storage, server-side grading by exact string match, 50-50 hint, results review) works without contract changes.

### Matching

```json
{
  "format": "matching",
  "question": "Match the vitamin in Column I with the deficiency disease in Column II.",
  "rationale": "Private one-sentence reasoning.",
  "columnA": ["Vitamin A", "Vitamin B1", "Vitamin C", "Vitamin D"],
  "columnB": ["Scurvy", "Night blindness", "Rickets", "Beriberi"],
  "options": ["1-B, 2-D, 3-A, 4-C", "1-A, 2-B, 3-C, 4-D", "1-B, 2-C, 3-A, 4-D", "1-D, 2-B, 3-C, 4-A"],
  "answer": "1-B, 2-D, 3-A, 4-C"
}
```

- `columnB` is stored **in display order** (already scrambled); letters A–D are assigned by display position, top to bottom — the standard exam convention.
- Combination strings use the exact format `"1-B, 2-D, 3-A, 4-C"` (single space after each comma, ASCII hyphen).
- The model emits only `question`, `rationale`, `columnA`, `columnB` where `columnB[i]` is the correct match for `columnA[i]`. The server builds `options` and `answer` (see Builder).

### Assertion-Reasoning

```json
{
  "format": "assertion-reasoning",
  "question": "",
  "assertion": "An iron nail dipped in copper sulphate solution turns brown.",
  "reason": "Iron is more reactive than copper and displaces it from the solution.",
  "rationale": "Private one-sentence reasoning.",
  "options": [
    "Both A and R are true, and R is the correct explanation of A",
    "Both A and R are true, but R is NOT the correct explanation of A",
    "A is true, but R is false",
    "A is false, but R is true"
  ],
  "answer": "Both A and R are true, and R is the correct explanation of A"
}
```

- `question` is intentionally empty for A-R; the card renders `assertion` / `reason` blocks directly (approved mockup B).
- The four options are **canonical server constants** in the paper language, always in the fixed order above, never shuffled.
- The model emits `assertion`, `reason`, `rationale`, and an answer code `'a' | 'b' | 'c' | 'd'`; the server maps the code to the exact option string.

Hindi canonical set (same order):

1. `A और R दोनों सत्य हैं, तथा R, A की सही व्याख्या है।`
2. `A और R दोनों सत्य हैं, परंतु R, A की सही व्याख्या नहीं है।`
3. `A सत्य है, परन्तु R असत्य है।`
4. `A असत्य है, परन्तु R सत्य है।`

## Generation pipeline

### Prompt (`src/lib/server/prompt.js`)

New `testType` branches with format-specific OUTPUT FORMAT and rules:

- **Matching:** return exactly 4 pairs; items ≤ ~6 words (must fit the phone grid); pairs 1:1, same category, unambiguous; no duplicate items within a column; the four items per column are distinct in meaning.
- **Assertion-Reasoning:** return one assertion and one reason, each a single factual statement; the keyed code must match the actual relationship; distribute correct codes across a–d (not always `a`); never make the reason restate the assertion.
- The canonical A-R option texts are described to the model (so it can pick a code) but not emitted.
- `previousQuestions` uses the `questionTextFor` helper (below) so structured questions display full context in the avoid-list.

### Schema (`src/lib/server/quizSchema.js`)

`paperSchemaFor(testType)` selects the Zod shape used for Gemini structured output:

- `matchingQuestionSchema`: `{ question, rationale, columnA: [4], columnB: [4] }`
- `assertionReasoningQuestionSchema`: `{ assertion, reason, rationale, answer: enum(['a','b','c','d']) }`
- default `questionSchema` unchanged for existing types.

### Builders (new pure modules)

**`src/lib/server/matchingBuilder.js`**

`buildMatchingQuestion(raw, { random = Math.random } = {})`:

1. Validate: exactly 4 `columnA` and 4 `columnB` items; all strings non-empty after trim; no duplicates within a column; each item ≤ 120 chars.
2. Scramble `columnB` display order (Fisher–Yates with the injected `random`), producing `displayB` and, for each original pair, its display letter.
3. Build the correct combination string from the scrambled display order.
4. Generate 3 distractor combinations: distinct permutations of `A–D` that differ from the correct assignment in **≥ 2 positions** (so no distractor is accidentally correct or a single swap).
5. Shuffle the 4 option strings; `answer` = the correct combination string.
6. Return `{ ok: true, question }` or `{ ok: false, issues: [...] }` with codes:
   - `matching-pairs-invalid` (count ≠ 4, blank item, duplicate item)
   - `matching-item-too-long` (item > 120 chars)

Deterministic given `random`; production uses `Math.random`.

**`src/lib/server/assertionReasoning.js`**

- `AR_OPTIONS = { english: [...4 strings], hindi: [...4 strings] }`, `AR_CODE_TO_INDEX = { a: 0, b: 1, c: 2, d: 3 }`.
- `buildAssertionReasoningQuestion(raw, { language })` → validates non-empty assertion/reason, `assertion !== reason`, valid code, length caps; returns final question with canonical options, or issues:
  - `ar-answer-invalid` (bad/missing code)
  - `ar-statements-invalid` (blank, identical, or over-length statements)

Fallback: unknown language falls back to `english` options (structural issues never come from missing language).

### Validation & quality

- `src/lib/server/quizConfig.js`: `VALID_TEST_TYPES` gains `matching` and `assertion-reasoning`.
- `src/lib/server/quizValidation.js`:
  - Full-exam allowlist becomes `['multiple-choice', 'matching', 'assertion-reasoning']` (coding/true-false/speed-challenge/mixed stay excluded). Error copy updated.
  - `inspectGeneratedPaper` becomes format-aware:
    - matching: 4 options; every option strictly matches `^1-[A-D], 2-[A-D], 3-[A-D], 4-[A-D]$` and covers each of A–D exactly once; exactly one option equals `answer`; `answer` is itself a valid permutation.
    - A-R: options deep-equal the canonical ordered set for the paper language; `answer` ∈ options.
    - legacy types: current checks unchanged.
- `src/lib/server/questionQuality.js`: skip option shuffling and longest-answer-tell for the two new formats (options are server-made and their order is already deliberate); keep language/script ratio, duplicate-question, and length checks. Add soft quality issue `matching-item-long` (> 60 chars) so the salvage loop can nudge one regeneration toward grid-friendly items.

### Verification, salvage, explain

- `src/lib/server/answerVerifier.js`: render structured content into the verifier prompt — matching adds `Column I: 1. … / Column II: A. …` lines before the options; A-R adds `Assertion (A): … / Reason (R): …` lines. Verification logic (independent solve → compare chosen option text) is unchanged.
- Salvage (`generationSalvage.js` + `/api/generate`): the new issue codes flow through the existing reject/regenerate loop; rejected questions are regenerated in the same format (the batch prompt already carries `testType`).
- `normalizeGeneratedPaper` / `sanitizeQuestion` (`/api/generate/+server.js`): carry `format`, `columnA/columnB`, `assertion/reason` through math-text normalization (normalize items and statements too).
- Explain (`/api/explain`): unchanged server contract; callers send the composed stem from `questionTextFor` so explanations see the full structured context.

### Shared helper

`src/lib/shared/questionText.js` — `questionTextFor(question)`:

- matching → `"<stem>\nColumn I: 1. … 4. …\nColumn II: A. … D. …"`
- assertion-reasoning → `"Assertion (A): …\nReason (R): …"`
- everything else → `question.question`

Used server-side (previousQuestions, quality language checks, verifier is separate) and client-side (explain requests).

## API / UI surface

- **Storage:** no DB migration (questions are JSONB). `stripAnswerKey` still removes only `answer`; structured fields remain client-visible, as intended.
- **Grading:** `/api/test/submit` unchanged — exact string match against the stored `answer` (combination string / canonical statement).
- **Picker** (`src/lib/client/PreviewCard.svelte`): add `{ value: 'matching', label: $t('matchingColumns'), icon: 'link' }` and `{ value: 'assertion-reasoning', label: $t('assertionReasoning'), icon: 'scale' }`. Add `link` and `scale` paths to `src/lib/client/Icon.svelte`.
- **Full-exam reachability** (`src/lib/client/pages/HomePage.svelte`): `getExamRequestParams` uses the selected `testType` (default `multiple-choice`) instead of hard-coding it, so exam papers can be launched in the new formats.
- **Test card** (`src/routes/test/+page.svelte`): render the format body above the unchanged option list; add a small format chip in the card header.
  - matching: CSS grid, two columns, 8 cells (number/letter chip + item text), `overflow-wrap: anywhere`, ~13px text at 320px.
  - A-R: two paragraphs with bold `Assertion (A):` / `Reason (R):` labels.
- **New components:** `src/lib/client/QuestionMatching.svelte`, `src/lib/client/QuestionAssertionReasoning.svelte` (presentational, props in / no side effects), reused by `src/routes/results/+page.svelte` review cards.
- **Results page:** review cards render structured bodies via the components; `practiceWeakQuestions` spreads the full question object so `format`/structured fields survive into weak-area practice papers.
- **Intent parsing:** `src/lib/shared/intentLexicon.js` patterns — matching: `match(ing)? the (following|columns|lists)|column match|सुमेलित|मिलान`; A-R: `assertion\s*[-&/]?\s*reason(ing)?|assertion|अभिकथन` (bare "reasoning" is deliberately excluded — too generic). `src/lib/server/intentParse.js`: add both values to `VALID_TEST_TYPES` and the model prompt descriptions.
- **Telemetry:** no new events; `testType` already appears in existing generation metadata. `npm run test` allowlist scan stays green.

## Localization

UI keys (both `src/lib/locales/english.json` and `hindi.json`):

| Key | English | Hindi |
| --- | --- | --- |
| `matchingColumns` | Match the Columns | सुमेलित कीजिए |
| `assertionReasoning` | Assertion & Reasoning | अभिकथन एवं कारण |
| `columnI` | Column I | स्तंभ I |
| `columnII` | Column II | स्तंभ II |
| `assertionLabel` | Assertion (A) | अभिकथन (A) |
| `reasonLabel` | Reason (R) | कारण (R) |

Canonical A-R option statements live in `src/lib/server/assertionReasoning.js` (both languages), not in UI locales — they are paper content, not chrome.

## Error handling & edge cases

- Builder/inspection failures → salvage issue codes → regeneration in the same format; after salvage exhaustion the existing trim/drop behavior applies.
- Duplicate/blank column items and wrong counts are structurally rejected before options exist.
- Distractor generation guarantees ≥ 2 positional differences from the key, so no distractor can be silently correct.
- A-R `assertion === reason` rejected; bad codes rejected.
- Old papers without `format` render exactly as today (components only activate on known formats).
- 50-50 hint on A-R may eliminate any two wrong standard statements — acceptable and stays within the existing key-verified elimination rules.
- Hindi papers: Hindi statements + Hindi canonical options; fallback to English only if a language set were missing (asserted complete by tests).
- Data saver / low-end: components are static markup (no new JS at runtime beyond Svelte rendering); no new network calls.

## Testing plan

Per `AGENTS.md`: E2E first as the primary mechanism; for the isolated deterministic builders, failure modes are written down first, then tests, then code.

Failure modes to encode for builders (before implementation):

- count < 4, count > 4, missing columns, non-string items, blank items
- duplicate within a column
- item over the 120-char structural cap
- permutation options: not covering A–D once, duplicate options, ≥ 2 positions differ from key, exactly one correct option
- seeded determinism: same seed → identical output; option order contains the key at variable positions across seeds
- A-R: invalid/missing code, blank/identical statements, canonical sets present and ordered in both languages, code→index mapping

E2E (`tests/e2e/question-formats.e2e.js`, Playwright, route-mocked — no API keys):

- picker shows both formats and selecting one sends the right `testType`
- mocked matching paper: grid renders (8 cells, numbers/letters correct), answering selects exactly one option, submit → results shows score and review renders the grid
- mocked A-R paper: inline labels render, submission grades correct/incorrect
- 50-50 hint on a matching question eliminates only wrong combination options
- weak-area practice from a results page preserves `format` and structured fields
- zero console errors; evidence attached to `test-results/e2e-artifact.json` via the existing reporter

Unit tests: builders (new), plus updates to `quizValidation`, `prompt`, `intentLexicon`/`intentParse`, `quizSchema`, `questionQuality` tests for the changed rules.

Verification checklist before merge: `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e`; manual `npm run eval:content -- --strict` with an API key to sanity-check generated matching/A-R content.

## Out of scope

- Interactive/drag pairing and partial credit
- Five-pair matching, more than four columns
- Automatic mixing of the new formats into `mixed` papers
- New telemetry events, admin dashboard changes, DB migrations
- Changes to coding/true-false/speed-challenge behavior

## Files touched

- `src/lib/server/prompt.js` (format branches)
- `src/lib/server/quizSchema.js` (`paperSchemaFor`, new schemas)
- `src/lib/server/matchingBuilder.js` (new)
- `src/lib/server/assertionReasoning.js` (new)
- `src/lib/server/quizConfig.js`, `quizValidation.js`, `questionQuality.js`, `answerVerifier.js`
- `src/routes/api/generate/+server.js` (normalize/sanitize fields, builder wiring)
- `src/lib/shared/questionText.js` (new, shared helper)
- `src/lib/shared/intentLexicon.js`, `src/lib/server/intentParse.js`
- `src/lib/client/PreviewCard.svelte`, `Icon.svelte`, `pages/HomePage.svelte`
- `src/lib/client/QuestionMatching.svelte`, `QuestionAssertionReasoning.svelte` (new)
- `src/routes/test/+page.svelte`, `src/routes/results/+page.svelte`
- `src/lib/locales/english.json`, `src/lib/locales/hindi.json`
- `tests/e2e/question-formats.e2e.js` (new) + updated unit tests
- `README.md` (supported formats list)
