## scope.included

- resolveTestRecord gains an opt-in fillAttempt mode: fetch when the graded attempt is not local, seed it, and merge attempt fields into the local paper.
- Results page passes fillAttempt: true.
- New regression spec in tests/e2e/cross-device-results.e2e.js.

## scope.excluded

- Behavior changes on /test and /print.
- Server, response cache, attribution or rendering changes.

## preserved

- Same-device flow returns early with no network call.
- Fetch failure or missing records fall back to the local record.
- Synthetic-history specs keep working through the 404 fallback.

## decisions

- Only the results page opts into the fetch; /test and /print keep the local-first early return.
- Local content wins when both exist; only fields the local record lacks are filled.
- The fetch is best-effort: any failure keeps today's behavior.

