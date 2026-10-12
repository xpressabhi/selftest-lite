# Conformance record

> Complete at `conformance_review`. Keep it factual and short; scale detail to the change.

## Outcome

`resolveTestRecord` no longer serves a locally cached paper on its own when the caller opts in and
the graded attempt is not on the device: with `{ fillAttempt: true }` (the results page), it fetches
the server, seeds the local attempt record from `myAttempt.results`, and returns the local paper
merged with the attempt fields it lacks. `/test` and `/print` keep the local-first early return, and
any fetch or parse failure falls back to the local record exactly as before.

Change `CHG-0015` revision 1, proposal digest
`sha256:1d7029986d9f2b7c453c2e133803e231759150ff7b68964ef612f048dfc8bd0f`.

## Verification

| Command            | Result                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `npm run lint`     | pass, no output                                                                          |
| `npm run test`     | **992 passed / 79 files** — unchanged                                                    |
| `npm run check`    | **check-build-mode: OK — 195 chunks**, no DEV-only code                                  |
| `npm run test:e2e` | **196 passed (1.9 min)** — the 195 pre-existing plus the new regression spec, no flakes  |

Red → green on the live stack: the new spec (`a device that already holds the paper but not the
attempt still loads the review`) failed before the change with the page showing the reported guard
("This result is only available on the device where the test was submitted.") and passed after it —
per-question Correct/Incorrect states, the correct answer text, and the attempt result written to
`localStorage` for later visits.

Production evidence motivating the fix, gathered read-only before it: `GET /api/test?id=1875`
already returned `myAttempt.results` (10 entries) for the attempt owner; telemetry showed 11
`results:view` events for 1875 from one device signed into the owning account, whose first view
persisted the paper locally and every later view took the early return.

## Test changes

One addition under a protected path, declared:

- `tests/e2e/cross-device-results.e2e.js` (modified): the regression spec above.

No pre-existing test was modified, deleted or skipped.

## Deviations and decisions

- **The early return was gated by caller intent, not globally.** Fetching whenever a local paper has
  no attempt result would also add a network round trip to `/test` and `/print` (retakes render
  instantly from the local paper today); the option keeps those pages unchanged.
- **The local paper still wins on merge**, so retakes keep locally cached answer keys and cached
  explanations; only fields the local record lacks are filled from the server.
- **404/parse failures return the local record** instead of null, which keeps the synthetic-history
  specs (ids with no server counterpart) working unchanged.

## Approval constraints

Not required. `.intent/config.yaml` has `review.required: false`; the defect was reported by the
operator with the production URL, and the fix follows the approved design's local-first rule.
