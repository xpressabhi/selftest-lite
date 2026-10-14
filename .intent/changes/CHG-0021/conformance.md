# Conformance — CHG-0021 Per-identity explainer library

Outcome: every explainer served by `POST /api/playground` (cache hit or fresh generation) is
recorded for the caller's identity in the new `user_explainers` table (SCHEMA_VERSION 13 → 14);
`GET /api/playground/library` lists those rows and `?id=` serves one by joining the shared
`concept_explainers` cache and composing at serve time. The playground idle state shows a
"Your explainers" list; opening an item renders it in the same result card and bumps its open
counter. Reviewing a saved explainer performs no model call and consumes no generation quota.

## Deviations from the proposal

1. `normalizeAttemptIdentity` was exported from `storage.js` (was module-private) so
   `explainerLibrary.js` reuses the exact identity normalization rather than duplicating it.
2. The library route got a small `rateLimitedResponse` helper instead of inlining the 429 shape
   twice (list and by-id share one bucket).

## Decisions

- Identity follows attempt history: rows carry `user_id` + `client_id`, reads match either;
  anonymous rows are device-scoped, signed-in rows account-scoped. No retro-merge in v1.
- Dedupe per identity per cache_key via two partial unique indexes (signed / anonymous);
  regenerating a concept bumps `last_opened_at` instead of duplicating, and the list dedupes by
  cache_key for the signed-in-on-anonymous-row overlap.
- Recording is best-effort on both paths and silently skips callers with no identity
  (no client id and not signed in); a library failure never fails a response.
- Opening is a cache read: no `concept_explainers.use_count` movement, no model tokens; only
  `user_explainers.open_count`/`last_opened_at` move. No destructive actions in v1.

## Verification

- `npm run lint`, `npm run check`, `npm run test` — green (1091 unit tests; schema fingerprint
  guard updated through its designed workflow, declared in `test_changes`).
- `npm run test:e2e -- tests/e2e/playground.e2e.js` — 7/7, including the two new model-free
  tests: cache-hit recording + identity isolation, and open-by-id (dark theme composed from the
  cache) with `open_count` increment and a stranger's 404.
- `npm run verify:vercel` — unaffected (API-only addition) and run once for completeness.

## Follow-ups

- After deploy: `telemetry:report --days=7` for `/api/playground/library` volume and errors.
- Optional later: backfill of pre-login anonymous library rows onto accounts (the CHG-0013
  pattern), and per-item removal once a retention story beyond archive-first is designed.
