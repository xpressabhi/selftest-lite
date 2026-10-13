---
protocol_version: "2.0"
id: "CHG-0013"
title: "Re-grade the stored attempt on read so results render on every signed-in device"
status: "complete"
created_at: "2026-10-12T16:39:53Z"
request: "Fetch results on every device the user is logged in so they can see their result everywhere they log in."
proposal:
  revision: 1
  digest: "sha256:ae07d3ece4bceb7d8dc1534c276d9db073a147163273dd8966c74d138d1796fb"
scope:
  paths:
    - ".intent/changes/CHG-0013/**"
    - "src/lib/shared/grading.js"
    - "src/routes/api/test/+server.js"
    - "src/routes/api/test/submit/+server.js"
    - "src/lib/client/storage.js"
    - "docs/architecture.md"
    - "tests/e2e/cross-device-results.e2e.js"
test_changes: []
links:
  related: []
  supersedes: []
  decisions: []
review_required: false
---
# Change intent

## Request and outcome

"can you fetch results on every device user is logged in so they can see result everywhere they login"

A signed-in user opening `/results?id=…` on any device now sees the full review — score,
per-question correctness, correct answers, marks and working explanations — for every attempt linked
to their account. The stored attempt is re-graded on read and returned to its owner inside the
existing `GET /api/test?id=` response. The paper itself still leaves the server without its answer
key, and anonymous or share-link visitors receive exactly what they receive today.

Design: `docs/superpowers/specs/2026-10-12-cross-device-results-design.md` (committed `8321cc0`).

## Context

- Grading for AI papers happens server-side at submit; the graded payload (`results`: index,
  correct, yourAnswer, correctAnswer) is saved only to the submitting device's `localStorage`
  (`saveAttemptResult`). The results page builds the review from that local record.
- On another device the local record is absent. `GET /api/test?id=` already returns the user's
  attempt (`myAttempt`) — matched by account because login backfills `user_id`
  (`backfillUserIdentity`) — but it carries no answer key, so the page shows `resultNotAvailable`
  ("This result is only available on the device where the test was submitted."). This is the
  reported defect.
- Locally graded papers push their attempt (including `userAnswers`) to `/api/user/history`, so the
  server holds the answers for both grading paths.
- The response cache (CHG-0012) excludes identity-scoped data; the record it serves is raw and the
  own-attempt lookup runs per request, which is where the re-grade belongs.

## Scope

### Included

- New pure `gradeAttemptResults(questions, answers)` in `src/lib/shared/grading.js`, returning the
  same shape submit has always returned.
- `POST /api/test/submit` grades through the helper (behavior-preserving; its input validation
  stays at the route boundary).
- `GET /api/test?id=` attaches `results` and the stored `marks`/`totalMarks` to `myAttempt` when the
  requester owns an attempt.
- `resolveTestRecord` seeds the device-local attempt record from `myAttempt.results` when it is
  missing, so the results page merges through its existing path and later/offline visits need no
  refetch.
- New e2e spec `tests/e2e/cross-device-results.e2e.js`; one paragraph in `docs/architecture.md`.

### Excluded

- Never-linked anonymous attempts (a transfer/redeem mechanism would be needed; the test id is
  public in share links).
- History sync semantics, the newest-attempt-wins rule, schema changes and stored graded rows.
- Changing the guard messages (`testNotSubmitted`, `resultNotAvailable` stay).
- Identity-scoped data in the response cache (CHG-0012 exclusion preserved).

## Preserved behavior

- Anonymous and share-link reads of `/api/test?id=` are byte-for-byte today's payload: stripped
  paper, `myAttempt: null`, no answers, no score.
- Submit's response shape, status codes and grading semantics are unchanged.
- The security-hardening contract suite (anonymous probes) stays green as written; no pre-existing
  test is modified, deleted or skipped.
- The results page's local-first merge order is unchanged.

## Test changes

None to pre-existing tests. Additions under protected paths:

- `tests/e2e/cross-device-results.e2e.js` (new): a passkey account submits a seeded paper; a second
  fresh context holding only the session cookie opens the result and sees the full review
  (per-question states, correct answers, marks row, seeded explanation served from the DB cache); a
  third anonymous context gets the stripped paper and the guard state, with no answer key anywhere
  in the payload.

## Decisions and constraints

- Re-grade at read time through one shared helper rather than storing graded rows: no schema change,
  one implementation, no drift with submit.
- Reveal rule unchanged in kind: answers ship only to the owner of a stored attempt (account
  `user_id`, including login-backfilled rows, or the same anonymous `client_id`) — the same trust
  model as the submit response and `/api/user/*`.
- The client stays local-first; the server payload only seeds a missing local record, writing the
  same object shape the submit flow persists.
- Marks parity: `marks`/`total_marks` are already stored; the mapping exposes them, converting PG
  `NUMERIC` strings to numbers as the rest of the codebase does.
- No new telemetry events; the allowlist scan stays green by construction.

## Verification

- `npm run lint`, `npm run test`, `npm run check`, `npm run test:e2e` all pass; the e2e suite grows
  by the new spec and `test-results/e2e-artifact.json` records it with attached evidence.
- The reported symptom is gone on the second device; the negative control proves no answer-key leak
  for anonymous visitors.
- Manual spot check after deploy: sign in and submit on one browser, sign in and open the result on
  another.
