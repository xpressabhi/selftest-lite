# Matching columns + assertion-reasoning — task list

Spec: `docs/superpowers/specs/2026-09-24-question-formats-design.md`
Plan: `tasks/plan-question-formats.md`

- [x] 1. E2E specs first: `tests/e2e/question-formats.e2e.js` (picker, grid, inline A-R, hint, submit, weak practice)
- [x] 2. Builder failure-mode tests: matchingBuilder / assertionReasoning / questionText
- [x] 3. `src/lib/shared/questionText.js`
- [x] 4. `src/lib/server/matchingBuilder.js`
- [x] 5. `src/lib/server/assertionReasoning.js`
- [x] 6. Schema + types + prompt branches (`paperSchemaFor`, `VALID_TEST_TYPES`, dedupe helper)
- [x] 7. Format-aware validation + full-exam allowlist
- [x] 8. Quality skips + `matching-item-long`
- [x] 9. Generate endpoint wiring + verifier rendering + salvage codes
- [x] 10. Test page: components + format body + header chip
- [x] 11. Results review bodies + `practiceWeakQuestions` field preservation (+ bookmark keys via composed text)
- [x] 12. Picker entries, icons, full-exam format plumbing
- [x] 13. Locale keys EN/HI + intent patterns
- [x] 14. README + full verification (lint, check, test, test:e2e, artifact)
