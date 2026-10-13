## scope.included

- true-false generation switches to server-built statement-combination questions in Hindi and English.
- Old 2-option papers keep rendering and grading unchanged.

## scope.excluded

- A separate binary format, 2-statement questions, picker-label changes, telemetry/DB/UI additions.

## preserved

- Old unformatted true/false papers still render, grade, and explain identically.
- Matching, assertion-reasoning, multiple-choice, coding, speed-challenge, mixed, and full-exam behavior stay unchanged.
- Grading, answer stripping, the 50-50 hint, review, print, and explain contracts stay unchanged.

## decisions

- Replace the true-false semantics; keep the testType id and picker label so storage, picker, and telemetry contracts do not change.
- The server owns the composed question text, the four combination options, and the key; the model supplies statements with truth values and a rationale.
- 3-4 statements per question, at least one true and one false.
- Distractors are the closest non-empty subsets by symmetric difference, random among ties.
- Composed markdown question text keeps every surface (test, review, print, explain, dedupe) unchanged at the renderer level.

