# Conformance record

> Complete at `conformance_review`. Keep it factual and short; scale detail to the change.

## Outcome

A signed-in user opening `/results?id=…` on any device now sees the full review for every attempt
linked to their account. `GET /api/test?id=` re-grades the stored attempt with the same shared
helper `POST /api/test/submit` uses (`gradeAttemptResults`) and returns `myAttempt.results` plus the
stored `marks`/`totalMarks`; `resolveTestRecord` seeds the device-local attempt record from it when
missing, so the results page merges through its existing path. The paper payload stays stripped for
everyone without a matching attempt — the anonymous read is unchanged, `myAttempt: null`.

Change `CHG-0013` revision 1, proposal digest
`sha256:ae07d3ece4bceb7d8dc1534c276d9db073a147163273dd8966c74d138d1796fb`.

## Verification

| Command                          | Result                                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                   | pass, no output                                                                                                                           |
| `npm run test`                   | **992 passed / 79 files** — no unit tests added (the helper is exercised through both e2e paths); every pre-existing test unchanged       |
| `npm run check`                  | **check-build-mode: OK — 195 chunks**, no DEV-only code, service worker registration present                                              |
| `npm run test:e2e`               | **195 passed (1.8 min)** — the 193 pre-existing plus 2 new cross-device specs, no flakes                                                  |
| `test-results/e2e-artifact.json` | 195 passed / 0 failed, stamped `8321cc0` (dirty), both new specs attached with evidence                                                   |

What the new specs prove on the live stack: a passkey account submits a seeded paper through
`/api/test/submit` (attempt row carries `user_id` and the answers); a second fresh browser context
holding only the session cookie renders the full review — per-question Correct/Incorrect/Not
Answered states, the correct answer text, the `1.5/6 marks` row, and an Explanation served from the
seeded database cache with `answer` in the request payload; a third anonymous context gets
`myAttempt: null`, no answer key anywhere in the payload, and the guard state instead of a review.

Independent probe before the suite was green: seeded paper + `x-client-id` submit, then
`GET /api/test?id=` returned `myAttempt.results` identical to the submit response (index 1
`correctAnswer: "Beta"`, `marks: 1.5 / 6`).

## Test changes

Additions only, matching the proposal:

- `tests/e2e/cross-device-results.e2e.js` (new): 2 specs.

No pre-existing test was modified, deleted or skipped; the security-hardening contract suite
(anonymous probes) is green as written.

## Deviations and decisions

- **The first e2e draft clicked the wrong-answer card before asserting its "Correct Answer" text.**
  The page intentionally auto-expands every non-correct question on first render
  (`src/routes/results/+page.svelte` ~line 268), so the click collapsed it. The spec now asserts the
  default expansion and only expands the correct card. Test-authoring correction; no product change.
- **`/api/personalize` is route-stubbed in the new spec** (the nudges-suite convention): a live
  decision can switch the review filter mid-test, which let a live locator re-resolve to a different
  card. The assertions now describe the review itself, not the personalization layer.
- **`POST /api/test/submit` builds its normalized answers map before grading** so the shared helper
  receives it; grading semantics, the response shape and all status codes are unchanged.
- **`toNumberOrNull` handles `null` explicitly** instead of relying on `Number(null) === 0`, so an
  attempt stored without marks stays `null` rather than reading as zero.
- **Marks parity is asserted through the row the submitting device already renders** (`1.5/6 marks`),
  produced by the existing `computeAttemptMarks` from the seeded paper's sections.

## Approval constraints

Not required. `.intent/config.yaml` has `review.required: false`; the requested outcome was
unambiguous, and the operator approved the design
(`docs/superpowers/specs/2026-10-12-cross-device-results-design.md`) before implementation.
