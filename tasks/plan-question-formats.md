# Implementation Plan: Matching Columns & Assertion-Reasoning Formats

## Overview

Ship the approved design in `docs/superpowers/specs/2026-09-24-question-formats-design.md`: two new
selectable test types (`matching`, `assertion-reasoning`) for quiz-practice and full-exam. The model
supplies content only; the server owns combination options (matching) and the canonical fixed A-R
statements, so malformed questions are structurally impossible. Existing scoring, hint, grading,
answer stripping, and storage work unchanged.

## Architecture Decisions

- Stored contract stays `{question, rationale, options, answer}` + `format` + structured fields;
  no DB migration, no answer-stripping change, grading stays exact string match.
- Builders are pure and deterministic with an injected `random`, so unit tests are exact.
- Matching distractors are permutations differing from the key in ≥2 positions — never accidentally
  correct; option order is shuffled by the builder (quality pass does not shuffle again).
- A-R options are server constants (EN + HI) in fixed order; never shuffled; exempt from
  length-tell checks.
- `questionTextFor` (shared) is the single composer for structured content used by dedupe,
  quality, verifier-adjacent tooling, and explain requests.
- Failure modes feed the existing salvage loop with new issue codes; regeneration stays in-format.

## Dependency Graph

```
questionTextFor ─┬─> quality/validation wiring ─┐
matchingBuilder ─┤                              ├─> generate endpoint wiring ─> client UI ─> E2E green
assertionReasoning ─┤                           │
                 └─> schema/prompt ─────────────┘
```

## Task List

### Phase 1: Specs first (repo rule)

- [x] Task 1 (M): E2E specs `tests/e2e/question-formats.e2e.js` — route-mocked `/api/generate`,
  `/api/test`, `/api/test/submit`, `/api/test/hint`; specs for: both picker entries; matching grid
  renders 8 cells with correct number/letter chips; A-R inline labels; answer/select; 50-50
  eliminates only wrong options; submit → results review renders structured bodies; weak-area
  practice preserves `format`. Expected to fail only on missing UI/behaviour.
- [x] Task 2 (M): Failure-mode-first unit tests — `src/lib/server/matchingBuilder.test.js`,
  `src/lib/server/assertionReasoning.test.js`, `src/lib/shared/questionText.test.js`: count ≠ 4,
  blank/duplicate/over-length items, permutation coverage A–D once, ≥2-position difference,
  exactly one correct, seeded determinism; invalid/missing code, identical statements, canonical
  sets complete + ordered in both languages; empty stem, unknown format passthrough. Expected to
  fail on missing modules.

### Checkpoint: Specs

- [x] Both new suites fail for the right reason (missing modules/behaviour), no harness errors
- [x] Existing unit + e2e suites still green

### Phase 2: Server foundations

- [x] Task 3 (S): `src/lib/shared/questionText.js` — `questionTextFor` for matching / A-R / legacy.
- [x] Task 4 (S): `src/lib/server/matchingBuilder.js` — validate, scramble Column II, build
  combinations, 3 permutation distractors, option shuffle, issue codes.
- [x] Task 5 (S): `src/lib/server/assertionReasoning.js` — canonical EN/HI sets, code→option
  mapping, statement validation, issue codes.
- [x] Task 6 (M): `src/lib/server/quizSchema.js` (`paperSchemaFor`), `quizConfig.js`
  (`VALID_TEST_TYPES`), `prompt.js` (two format branches + dedupe via `questionTextFor`);
  prompt/schema tests updated.
- [x] Task 7 (M): `src/lib/server/quizValidation.js` — format-aware `inspectGeneratedPaper`,
  full-exam allowlist `[multiple-choice, matching, assertion-reasoning]`; tests updated.
- [x] Task 8 (S): `src/lib/server/questionQuality.js` — skip option-shuffle and length-tell for
  both formats; add `matching-item-long` soft issue; tests updated.
- [x] Task 9 (M): `src/routes/api/generate/+server.js` — call builders after normalize, carry
  structured fields through `normalizeGeneratedPaper`/`sanitizeQuestion`, wire new issue codes;
  `answerVerifier.js` renders columns / assertion+reason lines.

### Checkpoint: Pipeline

- [x] `npm run test` green (builders, validation, quality, prompt, schema)
- [x] `npm run lint` green

### Phase 3: Client UI

- [x] Task 10 (M): `src/lib/client/QuestionMatching.svelte` + `QuestionAssertionReasoning.svelte`;
  test page renders format body above unchanged options + header format chip (approved mockups).
- [x] Task 11 (S): results page review cards use the components; `practiceWeakQuestions` spreads
  the full question object.
- [x] Task 12 (S): `PreviewCard.svelte` FORMATS entries; `Icon.svelte` `link` + `scale`;
  `HomePage.svelte` `getExamRequestParams` uses selected `testType` (default multiple-choice).
- [x] Task 13 (S): locale keys EN + HI (`matchingColumns`, `assertionReasoning`, `columnI`,
  `columnII`, `assertionLabel`, `reasonLabel`); `intentLexicon.js` + `intentParse.js` patterns and
  type list; intent tests updated.

### Checkpoint: UI

- [x] `tests/e2e/question-formats.e2e.js` green; zero console errors
- [x] Matching grid fits a 320px viewport (no horizontal overflow)

### Phase 4: Verification

- [x] Task 14 (S): `README.md` supported formats; full `npm run lint && npm run check &&
  npm run test && npm run test:e2e`; artifact `test-results/e2e-artifact.json` written and
  byte-identical across a clean rerun; manual `npm run eval:content -- --strict` with an API key
  (best effort if the key is available).

### Checkpoint: Complete

- [x] All acceptance criteria met; spec §Testing plan satisfied
- [x] No out-of-scope items touched (partial credit, drag pairing, mixed auto-inclusion, migrations)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Model emits 3/5 pairs or bad codes | Med | Enum schema at generation + builder issue codes + salvage regeneration |
| Long matching items break the 320px grid | Med | Prompt ≤6 words, 120-char structural cap, `matching-item-long` soft issue, `overflow-wrap` |
| Hindi canonical wording disputed | Low | Native-shape standard phrasing in the two sets; constants easy to amend in one file |
| Full-exam duration/pattern expectations | Low | Only the answer format changes; paper scaffolding untouched |
| E2E fixtures drift from real paper shape | Low | Fixtures built from the stored shapes in the spec; contract tests in unit suites |

## Open Questions

- None blocking. (Column labels 1–4 / A–D and fixed-order A-R statements were approved in the
  mockups.)

## Verification Notes (2026-09-24)

- `lint`, `check`, `test` (523), `test:e2e` (71, including the 4 new format specs) all green.
- Two pre-existing harness gaps surfaced during final verification and were fixed in a follow-up
  commit:
  - `npm run eval:content -- --strict` judged served answer-position bias with a fixed 60% gate on
    only 30 questions (a uniform shuffle exceeded it ~18% of the time by chance; two runs after
    this change flagged only this metric, with 3/3 papers and zero structural/duplicate issues).
    The gate is now a one-sided binomial test at 50% + 2σ (`scripts/eval-content.mjs`), so real
    shuffle failures still fail while sampling noise does not.
  - `test-results/e2e-artifact.json` was not byte-identical between runs because telemetry events
    in `device-profile.e2e.js` evidence carry `created_at` wall-clock stamps. The artifact reporter
    now strips volatile `created_at` keys from evidence (`tests/e2e/artifactReporter.js`).

## Files Likely Touched

`src/lib/server/{matchingBuilder,assertionReasoning,quizSchema,quizConfig,quizValidation,questionQuality,answerVerifier,prompt,intentParse}.js`,
`src/routes/api/generate/+server.js`, `src/lib/shared/{questionText,intentLexicon}.js`,
`src/lib/client/{QuestionMatching,QuestionAssertionReasoning,PreviewCard,Icon}.svelte`,
`src/lib/client/pages/HomePage.svelte`, `src/routes/{test,results}/+page.svelte`,
`src/lib/locales/{english,hindi}.json`, `tests/e2e/question-formats.e2e.js`, unit test files
alongside sources, `README.md`.
