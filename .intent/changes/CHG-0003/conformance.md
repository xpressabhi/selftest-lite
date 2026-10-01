# Conformance

## Outcome

As requested. `testType: 'true-false'` now generates the statement format from
the reference image: 3–4 numbered statements, the
"निम्नलिखित कथनों पर विचार कीजिए:" / "उपर्युक्त कथनों में से कौन-सा/से सही है/हैं?"
framing (Hindi) or "Consider the following statements:" /
"Which of the statements given above is/are correct?" (English), and four
server-built combination options (`केवल 1`, `1 तथा 2`, … / `Only 1`,
`1 and 2`, …). The binary `सत्य / असत्य` output is replaced for new papers;
old stored papers keep rendering and grading unchanged.

Implementation:

- `statementBuilder.js` composes the question text, builds the key plus three
  near-miss distractor subsets, shuffles all four options, and rejects
  malformed/all-true/all-false content (`statement-content-invalid`,
  `statement-too-long`).
- Prompt contract, `paperSchemaFor('true-false')`, validation branch, quality
  handling (server-built: no reshuffle, no length tell), generate-route wiring,
  intent description/lexicon, and raw-draft composition in `questionTextFor`.
- No UI component, locale, telemetry, or database changes.

## Verification

| Check | Result |
| ----- | ------ |
| `npm run test` | Pass — 71 files, 831 tests |
| `npm run lint` | Pass |
| `npm run check` | Pass — build-mode check OK (193 chunks) |
| `npm run test:e2e` | Pass — 157/157, artifact in `test-results/e2e-artifact.json` |
| Live Hindi generation (dev server, in-memory PGlite) | 3/3 questions in the reference format; key stripped from the client payload |
| Live English generation (dev server, in-memory PGlite) | 3/3 questions in the English framing/option grammar; key stripped |
| `sh .intent/scripts/verify-change.sh --change .intent/changes/CHG-0003 --command "npm run test"` | Pass — digest, scope, declared test changes, verify command |

## Test changes

Each declared test change is present as declared:

- `src/lib/server/statementBuilder.test.js` — added (13 tests: failure modes,
  option grammar round-trip, builds, seeded determinism).
- `src/lib/shared/intentLexicon.test.js` — added (true/false phrasing in both
  languages).
- `src/lib/server/quizSchema.test.js` — modified (statement schema replaces
  the legacy `true-false` shape; boundary test now schema-vs-builder).
- `src/lib/server/quizValidation.test.js` — modified (binary expectations
  replaced with statement-based acceptance and rejection coverage).
- `src/lib/server/prompt.test.js` — modified (statements-only contract for
  `true-false`; legacy option contract untouched).
- `src/lib/server/questionQuality.test.js` — modified (server-built behavior
  for `statement-based`).
- `src/lib/shared/questionText.test.js` — modified (raw statement-draft
  composition for salvage quotes).
- `tests/e2e/question-formats.e2e.js` — modified (Hindi and English
  statement-paper render/score scenarios; both pass).

No other pre-existing test was modified, skipped, or deleted; all other tests
passed unmodified.

## Deviations and decisions

- None material. The pre-existing `true-false` shape tests were intentionally
  rewritten because the change replaces that behavior; the proposal declared
  each file before implementation.
- The English option grammar uses `Only 1` / `1 and 2` / `1, 2 and 3`; the
  Hindi grammar matches the reference image (`केवल 1`, `1 तथा 2`,
  `1, 2 तथा 3`).
- The visible picker label ("सही/गलत" / "True/False") and the `testType` id are
  unchanged by design, so storage, picker, and telemetry contracts do not
  change.

## Approval constraints

Not required (`review.required: false`); no review evidence recorded.
