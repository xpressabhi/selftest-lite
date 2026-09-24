# Matching columns + assertion-reasoning — task list

Spec: `docs/superpowers/specs/2026-09-24-question-formats-design.md`
Plan: `tasks/plan-question-formats.md`

- [ ] 1. E2E specs first: `tests/e2e/question-formats.e2e.js` (picker, grid, inline A-R, hint, submit, weak practice)
- [ ] 2. Builder failure-mode tests: matchingBuilder / assertionReasoning / questionText
- [ ] 3. `src/lib/shared/questionText.js`
- [ ] 4. `src/lib/server/matchingBuilder.js`
- [ ] 5. `src/lib/server/assertionReasoning.js`
- [ ] 6. Schema + types + prompt branches (`paperSchemaFor`, `VALID_TEST_TYPES`, dedupe helper)
- [ ] 7. Format-aware validation + full-exam allowlist
- [ ] 8. Quality skips + `matching-item-long`
- [ ] 9. Generate endpoint wiring + verifier rendering + salvage codes
- [ ] 10. Test page: components + format body + header chip
- [ ] 11. Results review bodies + `practiceWeakQuestions` field preservation
- [ ] 12. Picker entries, icons, full-exam format plumbing
- [ ] 13. Locale keys EN/HI + intent patterns
- [ ] 14. README + full verification (lint, check, test, test:e2e, artifact)
