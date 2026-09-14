# Content quality pipeline

Every generated paper passes through deterministic checks and an independent
verification pass before it reaches a user.

## Generation

1. **Answer-first prompt** (`src/lib/server/prompt.js`): the model must work out
   the correct answer, write a private `rationale`, then build distractors.
   Distractor rules forbid «all/none of the above», jokes, and near-synonyms.
2. **Model + thinking**: `gemini-flash-lite-latest` with
   `thinkingLevel: 'minimal'` everywhere (generation, answer verification,
   explanations, intent parsing). One bounded retry covers transient 503/429
   overloads; there is no second model.
3. **Schema** (`src/lib/server/quizSchema.js`): each question carries
   `question`, `rationale`, `options`, `answer`; the rationale is stripped
   before storage/redaction.
4. **Batch validation** (`src/lib/server/quizValidation.js`): option counts,
   answer-in-options, duplicate options, KaTeX syntax, question count.

## Deterministic quality pass

`src/lib/server/questionQuality.js` runs after validation:

- **Option shuffle** — Fisher-Yates per question; fixes the answer-position
  bias (pre-fix production data: 76% of keys sat at A/B, only 4% at D).
- **Longest-answer tell** — a key that is >25% longer than the longest
  distractor fails the batch. Ties and equal-length options pass, and the
  prompt carries a matching option-length rule.
- **Structural checks** — empty/duplicate/lazy options, answer-in-options,
  unbalanced LaTeX, Hindi script ratio.
- **Near-duplicates** — character-trigram similarity ≥0.8 within the paper,
  against the user's previous questions, and against the topic's recent
  questions from the last 90 days.

Any failure regenerates the batch (bounded by `MAX_BATCH_VALIDATION_ATTEMPTS`).

## Independent verification

`src/lib/server/answerVerifier.js` asks the model to solve every question
without seeing the key. Any disagreement (including `AMBIGUOUS:` answers)
regenerates the batch. Verification failures from API errors are logged and
skipped so they can never break generation.

## Failure diagnostics

When generation fails, the API records a `generationFailure` block in
`api_request_events.metadata`: stage, error code, issue codes with question
indexes, model, validation attempt, and option-length stats. Question and
option text is never stored. `npm run telemetry:report` prints the breakdown;
see [telemetry.md](telemetry.md#generation-failure-diagnostics).

## Evaluation harness

```bash
npm run eval:content                                  # 3 topics x 10 questions
npm run eval:content -- --questions=5 --judge --strict
```

Generates papers with the production prompt/schema and reports:

- answer-position distribution before and after the shuffle
- longest-option tell rate
- near-duplicate and structural defect counts
- optional `--judge` model review (correctness / single answer / distractors)

`--strict` exits non-zero when a threshold fails, so it can run in CI.

## Item analytics and feedback

`npm run telemetry:report` derives per-question p-values from stored
`user_answers` (too hard ≤20%, too easy ≥95%, healthy 30–80%) plus position
skew, longest-tell share, and duplicate counts, with PASS/FAIL gates.

Users can report a bad question on the results page (`question:report` with
`wrong-key`, `ambiguous`, or `off-syllabus`) and rate the test
(`test:rating`), both stored as telemetry for triage in the weekly review.

## Never delete

Question reports, ratings, and item stats are analytical data: they are stored
append-only and pruned by archive-first moves only (see
[docs/telemetry.md](telemetry.md)).
