# Change intent

## Request and outcome

"i still this message on https://www.selftest.in/results?id=1875"

The CHG-0013 fix is deployed — production `GET /api/test?id=1875` returns `myAttempt.results` for
the attempt owner — yet the results page still shows `resultNotAvailable` on a device that has
opened this result before. Root cause: `resolveTestRecord` returns the locally cached paper early
and never asks the server, so the graded attempt (which lives on the server) is never fetched on
devices whose local history already holds the paper. Telemetry shows 11 `results:view` events for
1875 from one device signed into the owning account; the first visit (old code) persisted the paper
to local history, and every later visit took the early return. This change fetches when the graded
attempt is not local, fills the missing attempt fields, and keeps the local paper winning otherwise.

## Context

- `resolveTestRecord` (`src/lib/client/storage.js`) has two paths: a local-history early return and
  a server fetch. The CHG-0013 seeding only runs on the fetch path, and `upsertHistory` keeps the
  paper locally forever after the first view — so the early return persists across visits.
- `getAttemptResult` (per test id) is the only local source of grading; history records never carry
  it.
- `resolveTestRecord` also serves `/test` and `/print`, which do not need the graded attempt and
  must keep rendering instantly from the local paper (retakes rely on locally cached answer keys).
- Fetch failure or a missing record must fall back to the local record instead of returning null.

## Scope

### Included

- `resolveTestRecord(testId, { fillAttempt = false })`: the results page opts in; with the option and
  no local attempt result, the server is consulted, the attempt result is seeded from
  `myAttempt.results`, and the returned record is the local paper merged with the attempt fields it
  lacks (`userAnswers`, `score`, `totalQuestions`, `timeTaken`, `timestamp`). Any fetch/parse failure
  returns the local record.
- Results page call site passes `{ fillAttempt: true }`.
- New e2e spec in `tests/e2e/cross-device-results.e2e.js`: a device holding the paper (with the
  user's answers) but no attempt result loads the full review and writes the attempt result locally.

### Excluded

- Any behavior change on `/test` and `/print` (they keep the local-first early return).
- Any change to the server, the response cache, login-time attribution, or results-page rendering.
- Changing when the local paper wins (it still does, including cached explanations).

## Preserved behavior

- Same-device flow is untouched: local paper + local attempt result still returns early, no network.
- Offline behavior is unchanged: a failed fetch falls back to the local record.
- Specs that seed synthetic history (no server counterpart) keep working: the 404 path returns the
  local record.
- No pre-existing test is modified, deleted or skipped.

## Test changes

Addition under a protected path (declared; no pre-existing test touched):

- `tests/e2e/cross-device-results.e2e.js` (modified): one new regression spec.

## Decisions and constraints

- Gate the early return on the presence of the graded attempt — but only for the results page, so
  `/test` and `/print` gain no fetch. The paper alone cannot render the review.
- Keep local content authoritative when both exist; only fill fields the local record lacks.
- The fetch stays best-effort: any failure keeps today's behavior.

## Verification

- The new spec fails before the change (the page shows the guard) and passes after it.
- `npm run lint`, `npm run test`, `npm run check`, `npm run test:e2e` green.
- Production re-check after deploy: the reporting device renders the review after a reload.
