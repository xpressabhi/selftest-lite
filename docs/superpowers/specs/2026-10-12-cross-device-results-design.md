# Results review on every signed-in device (Design)

Date: 2026-10-12
Status: approved (approach A — re-grade the stored attempt inside `GET /api/test?id=`)
Scope: a signed-in user opening `/results?id=…` on any device sees the full review — score,
per-question correctness, correct answers, marks and working explanations — for every attempt linked
to their account. Reuses `ai_test_attempts`, `getMyAttemptForIdentity`, the response cache from
CHG-0012, and the results page's existing local-record merge. Adds one pure grading helper, extends
one response payload, and seeds the device-local attempt cache on first cross-device view. No schema
change, no new route, no new locale keys.

## 1. Objective

A result is currently reconstructable only on the device that submitted it:

- `/api/generate` stores the paper with its answer key; the client receives it stripped
  (`stripAnswerKey` in `src/lib/server/paperRedaction.js`), so grading is server-side for AI papers.
- `POST /api/test/submit` grades and returns `results` (`[{ index, correct, yourAnswer,
  correctAnswer }]`); `src/routes/test/+page.svelte` persists that object to `localStorage` via
  `saveAttemptResult` (`src/lib/client/storage.js`). Papers the client can grade locally (it already
  holds a key) do the same through `gradeLocally`, then push the attempt — including
  `userAnswers` — to `/api/user/history` best-effort.
- `/results?id=…` builds the review from `getAttemptResult(testId)` (`src/routes/results/+page.svelte`
  ~line 313). On another device that record is absent. `GET /api/test?id=…` does return the user's
  attempt (`myAttempt`: score and answers, matched by account because login backfills `user_id` via
  `backfillUserIdentity`), but it carries no answer key — so the page cannot say what was right and
  shows `resultNotAvailable`: "This result is only available on the device where the test was
  submitted."

The defect is reported by the operator and follows directly from that data flow: the guard fires on
any device that cannot reconstruct the review locally, which is every device but the submitting one.

Success criteria:

- On a second device signed into the same account with empty local storage, `/results?id=…` renders
  the same review as the submitting device: per-question correct/incorrect, correct answers, score,
  the marks row when stored, and Explanation buttons that work (the `/api/explain` payload includes
  `answer`, `src/routes/results/+page.svelte` ~line 772).
- `resultNotAvailable` no longer appears for the owner of an attempt, on any device.
- An anonymous visitor or share-link recipient receives exactly today's payload: stripped paper, no
  attempt, no answers, no score.
- No new HTTP or DB round trips on the results path; the page already fetches `/api/test?id=…`.

## 2. Non-goals

- **Never-linked anonymous attempts.** An attempt submitted anonymously that never signed in on the
  submitting device stays device-bound. Claiming it elsewhere would need a transfer/redeem
  mechanism — the test id is public in share links, so ownership cannot be inferred from it.
- **History sync semantics.** `listAttemptsForIdentity`, `upsertUserTestAttempts` and the
  newest-attempt-wins rule (`ORDER BY created_at DESC LIMIT 1`) are unchanged.
- **Schema changes or stored graded rows.** No migration, no backfill.
- **Changing the guard messages.** `testNotSubmitted` and `resultNotAvailable` stay as-is; both
  remain accurate where they can still appear.
- **Identity-scoped data in the response cache.** CHG-0012 explicitly excluded `myAttempt` from
  `testResponseCache`; this design keeps that property.

## 3. Decisions

**D1 — Re-grade at read time through one shared pure helper.** New
`gradeAttemptResults(questions, answers)` in `src/lib/shared/grading.js` returns exactly submit's
`results` shape. `POST /api/test/submit` switches to it (behavior-preserving; its input validation
and `MAX_ANSWER_TEXT_LENGTH` bounding stay at the route boundary), and the GET uses it to grade the
stored `user_answers`. One implementation, no drift. Rejected: persisting graded results at submit
(schema + backfill + two sources of truth); returning the paper un-stripped to the owner (mutates the
shared redaction semantics — one later widening of that condition and share links leak answer keys).

**D2 — Reveal rule is unchanged in kind: answers ship only to the owner of a stored attempt.** The
requester owns the attempt when it matches their account `user_id` (including rows backfilled at
login) or the same anonymous `client_id` the device carries — precisely the identities
`getMyAttemptForIdentity` already resolves. This is the same trust model as today's submit response
and `/api/user/*`. Share-link recipients and anonymous visitors get the stripped paper, as today.

**D3 — Client stays local-first.** The device-local attempt record always wins when present; the
server payload only seeds it when missing, writing the same object shape the submit flow persists.
Later and offline visits then need no refetch, and same-device behavior is untouched.

**D4 — The response cache keeps serving only the raw record.** `myAttempt` and the re-grade attach
per request after the cached record load; nothing identity-scoped enters the cache (consistent with
CHG-0012's exclusion and its "own-attempt lookup and stripAnswerKey still run per request" note).

**D5 — Marks parity.** Expose the already-stored `marks`/`total_marks` on `myAttempt` so the results
page's marks row (`src/routes/results/+page.svelte` ~line 1098) matches the submitting device.
Attempts stored before marks existed render without the row, exactly as they already do on the
original device.

## 4. API contract

`GET /api/test?id=<id>` — only the `myAttempt` object changes:

```json
{
  "id": 123,
  "test": { "…": "unchanged, stripAnswerKey still applied" },
  "myAttempt": {
    "score": 7,
    "totalQuestions": 10,
    "timeTaken": 321,
    "submittedAt": "2026-10-12T…",
    "userAnswers": { "0": "…", "3": "…" },
    "results": [
      { "index": 0, "correct": true, "yourAnswer": "…", "correctAnswer": "…" }
    ],
    "marks": 7,
    "totalMarks": 10
  }
}
```

- `results` is computed at read time by `gradeAttemptResults(testRecord.test.questions,
  myAttempt.user_answers)`; shape and semantics are identical to `POST /api/test/submit`'s
  `results`, so the client merges it through one code path. A non-string stored value grades as
  unanswered (`yourAnswer: null`, `correct: false`), matching submit's semantics for unparseable
  answers.
- No attempt match → `myAttempt: null` and the response is byte-for-byte today's payload.
- Rate limiting, `logApiEvent`, status codes and `X-Cache` (still describing the record cache) are
  unchanged.

## 5. Client

`resolveTestRecord` (`src/lib/client/storage.js`): after the existing `myAttempt` mapping, when
`record.myAttempt?.results?.length` and `getAttemptResult(testId)` is empty, persist
`saveAttemptResult(testId, { score, totalQuestions, timeTaken, timestamp, results, marks, totalMarks })`
— the same shape `saveAttemptResult` already receives from the submit flow. The results page then
merges through its existing block with no change, and `question.answer` is present again, so
`/api/explain` works on every device. `upsertHistory(resolved)` already runs in the same function;
nothing else changes.

## 6. Security

- The ownership gate is D2; the answer key is never added to the paper payload, only to the
  attempt-owner's `myAttempt.results`.
- `stripAnswerKey` and its call-site ordering are untouched; the paper a non-owner receives is
  unchanged, and the security-hardening contract suite (anonymous probes) stays green as written.
- Pre-existing edge, unchanged: a client can submit an empty attempt and then read the answers —
  the submit response already returns full grading. Out of scope.
- `clientId` continues to act as the device credential exactly as `/api/user/*` and
  `getMyAttemptForIdentity` already treat it.
- No identity-scoped data enters the response cache (D4).

## 7. Telemetry

No new events. The change is a payload extension on an existing route; `results:view` and
`api_request_events` for `/api/test:get` continue to cover it, and the allowlist scan in
`src/lib/shared/telemetryEvents.test.js` stays green by construction.

## 8. Testing and acceptance

New `tests/e2e/cross-device-results.e2e.js` (artifact via `artifactReporter.js`), three contexts:

- **A — submitting device.** Real account via `signUpWithPasskey` (`tests/e2e/passkeySignIn.js`),
  seed a paper through the dev bridge (existing seeded-paper helpers), submit a mixed answer set
  through `/api/test/submit`, assert the review renders on A (baseline) and the attempt row carries
  `user_id` (via `sqlClient`).
- **B — second signed-in device.** Fresh `browser.newContext()` holding only A's session cookie
  (real "second device": signed in, zero local storage); open `/results?id=…`; assert no
  `resultNotAvailable`/`testNotSubmitted`, per-question states match the submitted mix, correct
  answers are visible, the marks row renders when stored, and an Explanation request carries
  `answer` (assert the request payload or the rendered explanation).
- **C — negative control.** Fresh anonymous context, same URL: assert no `answer`/`correctAnswer`
  anywhere in the payload or DOM, and the guard state renders instead — the security property that
  keeps share links safe.

The helper is exercised end-to-end through both paths (submit in A, read in B); per AGENTS.md no
isolated unit test is added unless the plan finds a branch E2E cannot reach through bridge-seeded
papers.

Acceptance criteria:

- `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e` all pass (the pre-commit hook
  runs the last three); the e2e artifact is stamped with the SHA.
- The reported symptom is gone on B; the existing security-hardening and results specs are green
  without modification.
- `test_changes` in the intent record declares only the new spec file.

## 9. Rollout and verification

1. `.intent/changes/CHG-0013` — `proposal.md` + `change.yaml` before implementation;
   `conformance.md` after verification (`review.required: false` in `.intent/config.yaml`).
2. No feature flag, no env changes, no migration. Deploy with the normal release.
3. `docs/architecture.md`: extend the Submit paragraph to note that the review is re-graded on read
   for the attempt owner. README's `/api/test?id=` row stays accurate; no edit needed.
4. After deploy, verify on production with two real browsers: sign in and submit on one, sign in and
   open the result on the other; confirm the review renders and `api_request_events` shows no new
   error codes for `/api/test:get`.

## 10. Known limitations

- Newest attempt wins per identity on the server; a device holding its own local record keeps
  showing that record (pre-existing semantics, unchanged).
- Anonymous never-linked attempts remain device-bound (decided scope).
- A locally graded attempt becomes visible on other devices only after its best-effort push to
  `/api/user/history` succeeds; offline pushes flush later, as today.
- The marks row appears only for attempts stored with marks.

## 11. File inventory

New:

- `src/lib/shared/grading.js` — pure `gradeAttemptResults(questions, answers)`.
- `tests/e2e/cross-device-results.e2e.js`
- `.intent/changes/CHG-0013/**`

Modified:

- `src/routes/api/test/+server.js` — GET attaches `results` and `marks`/`totalMarks` to `myAttempt`.
- `src/routes/api/test/submit/+server.js` — uses the shared helper (behavior-preserving).
- `src/lib/client/storage.js` — seeds the local attempt record from `myAttempt.results` when missing.
- `docs/architecture.md` — one paragraph.

Untouched: schema (`ensureStorageSchema`), locales, telemetry allowlist, `paperRedaction.js`,
`testResponseCache.js`, all existing specs.
