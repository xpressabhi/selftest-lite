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
- **Near-duplicates** — character-trigram similarity ≥0.8 within the paper and
  ≥0.85 against the user's previous questions and the topic's recent questions
  from the last 90 days (the cross-paper bar is slightly higher to avoid false
  positives on well-covered topics).

## Salvage, top-up, and trim

A defective draft no longer discards its batch. `src/lib/server/generationSalvage.js`
splits every round into approved and rejected questions:

- **Round 0** generates the whole batch. Rejected drafts keep their issue codes
  (quality, structural, or verification disagreement).
- **Top-up rounds** ask only for the missing count plus a 40% buffer, with the
  rejected drafts and their reasons in the prompt, and verify only the new
  candidates. Bounded by `MAX_GENERATION_ROUNDS` and a 20s deadline reserve.
- **Trim** — if the good questions never reach the requested count, the paper
  is returned at its real size as long as it meets the floor
  (quizzes: `max(5, 60%)`; exams: `max(15, 75%)`). Trimmed papers carry
  `trimmed: true` / `requestedCount`, are stored and counted at their real
  size, and the test summary explains the reduction.

Clients request `Accept: text/event-stream` and receive `progress` events
(`approved/requested`) while the paper generates, then one `done` (or `error`)
event with the same payload as the JSON response. Reused exam papers and
pre-generation errors still come back as plain JSON, which the client handles.

## Independent verification

`src/lib/server/answerVerifier.js` asks the model to solve every question
without seeing the key. Any disagreement (including `AMBIGUOUS:` answers)
marks that question rejected so the salvage loop can replace it; the rest of
the batch is kept. Verification failures from API errors are logged and
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

`--strict` exits non-zero when a threshold fails, so it can run in CI. The
served answer-position gate is a one-sided binomial test (50% + 2σ), not a
fixed percentage: with only ~30 questions a fixed 60% gate false-alarms about
one run in five, while a real shuffle failure still trips the σ limit.

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
