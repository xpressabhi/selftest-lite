## scope.included

- New src/lib/shared/grading.js: pure gradeAttemptResults(questions, answers) returning the submit-shaped results array.
- POST /api/test/submit grades through the shared helper (behavior-preserving).
- GET /api/test?id= attaches results and marks/totalMarks to myAttempt when the requester owns an attempt.
- resolveTestRecord seeds the device-local attempt record from myAttempt.results when missing.
- New e2e spec tests/e2e/cross-device-results.e2e.js; one paragraph in docs/architecture.md.

## scope.excluded

- Never-linked anonymous attempts (transfer/redeem mechanism out of scope).
- History sync semantics, newest-attempt-wins, schema changes, stored graded rows.
- Changing guard messages or the paper redaction path.
- Identity-scoped data in the response cache.

## preserved

- Anonymous and share-link GET /api/test?id= responses are unchanged: stripped paper, myAttempt null, no answers, no score.
- Submit response shape, status codes and grading semantics are unchanged.
- The security-hardening contract suite stays green as written; no pre-existing test is modified, deleted or skipped.

## decisions

- Re-grade at read time via one shared helper instead of storing graded rows: no schema change, no drift with submit.
- Answers ship only to the owner of a stored attempt (account user_id, including login-backfilled rows, or the same client_id) — the existing trust model.
- Client stays local-first; the server payload only seeds a missing local record.
- Marks NUMERIC columns are exposed with the codebase's usual numeric conversion.

