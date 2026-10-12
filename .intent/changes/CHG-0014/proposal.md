# Change intent

## Request and outcome

"Will it work on old tests as well if taken via same account, if not can you backfill where we know
who has taken the test and they are linked to account?"

Old account-linked attempts already render the full review on every signed-in device: CHG-0013
re-grades at read time from the stored `user_answers` and the stored paper, so no per-attempt data
needs to be added for them. What can still be missing is the *link*: attempts submitted anonymously
whose `user_id` is NULL never appear to the account on another device, even when the device is
provably owned by that account. This change adds a dry-run-first backfill that sets `user_id` on
exactly those attempts whose device (`client_id`) maps to a single account in existing data.

## Context

- `getMyAttemptForIdentity` matches on `user_id` OR `client_id`, so an unlinked attempt is invisible
  on any other device.
- `backfillUserIdentity` already performs this attribution at login time, but only for the
  logging-in device; rows on devices that never logged in again, or that predate the login-time
  backfill, stay unlinked.
- A device-to-account link is provable from rows that carry both ids: `ai_test_attempts`,
  `feature_events` (+ `feature_events_archive`), and `ai_test` (`created_by_user_id` plus
  `requestParams.clientId`). Devices that map to more than one account are ambiguous and must not be
  guessed.
- Precedent and convention: `scripts/backfill-test-metadata.mjs`, `scripts/backfill-test-visits.mjs`
  — dry run by default, `--apply` writes, updates/upserts only, never deletes.

## Scope

### Included

- New `scripts/backfill-attempt-links.mjs` with npm entry `attempts:backfill-links`: the dry run
  reports already-linked, candidates, ambiguous devices, unknown devices, and attempts without
  stored answers; with `--apply` it sets `user_id` on candidate rows only.
- `package.json` script entry.

### Excluded

- Attempts with no `client_id`, or whose `client_id` maps to no account or to multiple accounts.
- Any change to runtime attribution (login-time backfill is unchanged; this is a one-off historical
  pass).
- Backfilling `ai_test.created_by_user_id`, feature events, API events, or `ai_test_visits` —
  attempts are what results viewing needs.
- Changing `getMyAttemptForIdentity`, any route, or the schema.

## Preserved behavior

- No schema change; no deletes; `--apply` updates only `user_id` on rows where it is NULL.
- The script is inert unless invoked; nothing in the app imports it.
- No pre-existing test is modified, deleted or skipped.

## Test changes

None. Follows the existing backfill-script precedent (no automated coverage); the dry-run output is
the evidence, and the single-statement SQL is exercised against production in dry-run before
applying.

## Decisions and constraints

- Require exactly one distinct account per device across all evidence sources; ambiguous devices are
  skipped, never guessed.
- Evidence comes only from rows that already exist and carry both ids; no fuzzy matching.
- The attribution rule is the same one `backfillUserIdentity` applies at login — this pass only
  covers rows that path could not reach.
- Dry run by default; `--apply` required to write, mirroring `telemetry:backfill*`.

## Verification

- Dry run against production prints linked/candidate/ambiguous/unknown counts and a candidate
  sample; the numbers are reviewed before applying.
- `--apply` reports the updated row count; a follow-up dry run shows zero candidates.
- `npm run lint`, `npm run test`, `npm run check`, `npm run test:e2e` stay green (the script is not
  imported by the app).
