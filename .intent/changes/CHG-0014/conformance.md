# Conformance record

> Complete at `conformance_review`. Keep it factual and short; scale detail to the change.

## Outcome

Old account-linked attempts needed no data work: CHG-0013 re-grades at read time from the stored
`user_answers` and the stored paper, so the 171 attempts already carrying a `user_id` render the
full review on every signed-in device as-is. What this change adds is the missing *link*:
`npm run attempts:backfill-links` (new `scripts/backfill-attempt-links.mjs`) sets `user_id` on
historical anonymous attempts whose device (`client_id`) maps to exactly one account in existing
data. Evidence is limited to rows that already carry both ids (attempts, feature events + archive,
API events + archive, user state + archive, `ai_test.created_by_user_id` +
`requestParams.clientId`); devices with no account or more than one account are skipped, never
guessed. Dry run by default, `--apply` writes, updates only, never deletes.

Change `CHG-0014` revision 1, proposal digest
`sha256:582e4634ee316b09aa545b3cea390191af11d74fbdaf8b46ce03a09787a140df`.

## Verification

Production dry run, before applying:

| Signal                        | Count |
| ----------------------------- | ----- |
| attempts total                | 740   |
| already linked (`user_id` set)| 171   |
| unlinked                      | 569   |
| unlinkable: no `client_id`    | 29    |
| unlinkable: unknown device    | 528   |
| unlinkable: ambiguous device  | 0     |
| attempts without stored answers | 44  |
| candidates                    | 12    |

The 12 candidates are all one device (`c-e0d8ffe9-…`) mapping to user 1. `--apply` reported
`linked rows: 12`. A follow-up dry run reported `already_linked: 183`, `unlinked: 557`,
`candidates: 0` — idempotent.

Repository checks:

| Command         | Result                                                                       |
| --------------- | ---------------------------------------------------------------------------- |
| `npm run lint`  | pass, no output                                                              |
| `npm run test`  | **992 passed / 79 files** — unchanged                                        |
| `npm run check` | **check-build-mode: OK — 195 chunks**, no DEV-only code                      |
| `npm run test:e2e` | **195 passed** — unchanged (the script is not imported by the app); the pre-commit `smoke` hook re-runs lint + unit + e2e on the commit |

The remaining 557 unlinked attempts stay unlinked by design: 29 have no device identity at all, and
528 sit on devices with no account evidence anywhere — there is nothing to know from. The 44
attempts without stored answers (across linked and unlinked alike) render with per-question
"Not Answered" where their answers were never persisted; no data can restore them.

## Test changes

None — follows the `backfill-test-metadata.mjs` / `backfill-test-visits.mjs` precedent (no automated
coverage; the dry-run output is the evidence). No pre-existing test was modified, deleted or
skipped.

## Deviations and decisions

- **Evidence sources were widened during the dry run.** The first version used attempts + feature
  events + `ai_test`; API events (+archive) and user state (+archive) were added because they also
  carry both ids and are cheap to scan (43k/205 rows). The candidate set was unchanged (12), which
  strengthens the "unknown device" conclusion for the 528.
- **`push_subscription` and `ai_test_visits` were deliberately left out**: the former has 0 rows
  with both ids, the latter is derived from feature events and adds nothing.
- **The attribution rule is the login-time one.** `backfillUserIdentity` already links a device's
  anonymous rows when it logs in; this pass only covers rows that path could not reach.
- **No archive/undo record for the update.** Only `user_id` moves from NULL to a value on rows whose
  device proves the account; no prior data is destroyed.

## Approval constraints

Not required. `.intent/config.yaml` has `review.required: false`, and the operator explicitly asked
for the backfill ("if not can you backfill where we know who has taken the test and they are linked
to account") before it was written.
