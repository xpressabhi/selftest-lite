## scope.included

- New scripts/backfill-attempt-links.mjs: dry-run counts plus --apply to set user_id on candidate attempts.
- package.json script entry attempts:backfill-links.

## scope.excluded

- Attempts without a client_id, or with ambiguous/unknown device mappings.
- Runtime attribution changes; login-time backfill is unchanged.
- Backfilling ai_test creators, feature events, API events, ai_test_visits.
- Route, storage or schema changes.

## preserved

- No schema change, no deletes; --apply only sets user_id where it is NULL.
- The script is inert unless invoked; the app does not import it.

## decisions

- Evidence only from existing rows carrying both ids (attempts, feature events + archive, ai_test creator + requestParams.clientId).
- Same attribution rule backfillUserIdentity applies at login, applied once to rows that path could not reach.
- Dry run by default; --apply required to write, mirroring telemetry:backfill*.

