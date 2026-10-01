# Change intent

## Request and outcome

The `true-false` test type generated a single statement with two options
(`सत्य` / `असत्य`). It must instead generate the Hindi-exam statement style in
the attached reference: 3–4 numbered statements, a "which statements are
correct" closing line, and four combination options (`केवल 1`, `1 तथा 2`, …)
— in the paper's language, for new papers.

## Context

- Prompt currently asks for "exactly 2 options using localized equivalents of
  true/false"; `inspectGeneratedPaper` enforces exactly 2 options for
  `testType: 'true-false'`; verified live: a Hindi paper returned one statement
  with `सत्य` / `असत्य`.
- Matching and assertion-reasoning already follow the "model supplies content,
  server owns options and answer" pattern (`matchingBuilder.js`,
  `assertionReasoning.js`); the new format follows it too.
- Design: `docs/superpowers/specs/2026-10-01-statement-based-truefalse-design.md`
  (brainstorm decisions: replace the type, 3–4 statements, server-built
  combination options, composed markdown question text, no new UI component).

## Scope

### Included

- `testType: 'true-false'` generates statement-based questions: prompt output
  contract/rules, Zod schema, server builder, validation, quality handling,
  generate-route wiring, intent description/lexicon, and raw-draft composition
  in `questionTextFor` so salvage quotes keep context.
- Hindi and English framing/option wording; the Hindi text matches the
  reference image.
- Unit tests for the builder and changed rules; one new E2E scenario for
  rendering and scoring; design doc; this change record.

### Excluded

- A separate binary सत्य/असत्य format, 2-statement questions, renaming the
  visible "सही/गलत" picker label, telemetry/DB/UI changes.

## Preserved behavior

- Old stored papers with unformatted 2-option true/false questions still
  render, grade, and explain exactly as before.
- Matching, assertion-reasoning, multiple-choice, speed-challenge, coding, and
  mixed generation are untouched; full-exam behavior is untouched.
- Grading, answer stripping, 50-50 hint, results review, print, and the
  explain endpoint keep their contracts.

## Test changes

- `src/lib/server/statementBuilder.test.js` — added — new builder tests
  (failure modes first).
- `src/lib/shared/intentLexicon.test.js` — added — true/false intent wording
  in both languages ("statement based", "कथनों पर विचार", "कथन आधारित").
- `src/lib/server/quizSchema.test.js` — modified — `true-false` now has its
  own statements schema; update the legacy-schema list and layer-boundary
  expectations.
- `src/lib/server/quizValidation.test.js` — modified — replace binary
  true/false expectations with statement-based validation coverage.
- `src/lib/server/prompt.test.js` — modified — assert the statement contract
  for `true-false`; legacy formats keep the option contract.
- `src/lib/server/questionQuality.test.js` — modified — `statement-based`
  questions are server-built: no reshuffle, no longest-answer tell.
- `src/lib/shared/questionText.test.js` — modified — cover raw statement-draft
  composition so salvage rounds quote rejected drafts with context.
- `tests/e2e/question-formats.e2e.js` — modified — add Hindi and English
  statement-paper render/score scenarios.

## Decisions and constraints

- Replace, not add: `testType: 'true-false'` keeps its id, so no picker,
  storage, or telemetry contract changes.
- The model supplies only statements (with truth values) and a rationale; the
  server composes the question text and builds the four combination options so
  options can never contradict the key.
- 3–4 statements, at least one true and one false per question.
- Composed question text + `format: 'statement-based'` marker; no new Svelte
  component or locale keys.
- Distractors are the closest non-empty subsets by symmetric difference
  (random among ties) so options stay plausible near-misses.

## Verification

- `npm run test` (vitest) — new builder and intent tests and updated format
  tests pass.
- `npm run lint`, `npm run check` — static/type/build checks pass.
- `npm run test:e2e` — the Hindi and English statement scenarios and existing
  suites pass; artifact written to `test-results/e2e-artifact.json`.
- Live generation spot-check through the dev server with the in-memory test
  database: a Hindi paper and an English paper each return the reference-style
  statements, framing, and combination options with the key stripped.
