---
protocol_version: "2.0"
id: "CHG-0021"
title: "Per-identity explainer library on the playground"
status: "complete"
created_at: "2026-10-14T13:05:00Z"
request: "store generated explainers per user and list them on the playground page so they can be reviewed and reused without spending tokens again"
proposal:
  revision: 1
  digest: "sha256:5438aa363965e02ee1526d65a779c0910564b712e598fc869088c939c01aa360"
scope:
  paths:
    - ".intent/changes/CHG-0021/**"
    - "docs/**"
    - "README.md"
    - "src/lib/server/explainerLibrary.js"
    - "src/lib/server/storage.js"
    - "src/routes/api/playground/**"
    - "src/lib/client/pages/PlaygroundPage.svelte"
    - "src/lib/locales/*.json"
    - "src/lib/shared/telemetryEvents.js"
    - "tests/e2e/playground.e2e.js"
test_changes:
  - path: "src/lib/server/schemaMigrations.test.js"
    reason: "Recorded DDL fingerprint update required by the intentional ensureStorageSchema change (new user_explainers table + partial unique indexes); SCHEMA_VERSION bumped 13 to 14. The guard's assertions are unchanged."
links:
  related:
    - "CHG-0020"
  supersedes: []
  decisions: []
review_required: false
---

# Change intent

> Keep routine changes short. Add detail only when complexity, risk, ambiguity, or repository policy needs it. The digest covers everything below the front matter: after any body edit, run `sh .intent/scripts/verify-change.sh --change <dir> --print-digest`, increment `proposal.revision`, and paste the printed digest into `proposal.digest`.

## Outcome

`POST /api/playground` records every served explainer for the caller's identity (signed-in account and/or anonymous device id), a new `GET /api/playground/library` lists those records for the playground page, and `GET /api/playground/library?id=` serves one from the existing global cache — never a model call, so reviewing a saved explainer costs nothing. The playground idle state gains a "Your explainers" list that opens an artifact into the same result card.

## Scope

### Included

- New `user_explainers` table (identity columns + cache_key reference + concept/title/summary/language + recency/open counters) created through `ensureStorageSchema` (SCHEMA_VERSION 13 → 14).
- `explainerLibrary.js`: record (upsert per identity per cache_key), list (recency order, deduped by cache_key), get-by-id joined against `concept_explainers`.
- Library API route with the usual rate-limit/logging posture; opening bumps `open_count`/`last_opened_at`.
- Playground page: library fetch on mount (using `getClientHeaders()`), list UI, open-by-id, refresh after a generation; en+hi keys; one new telemetry event.
- E2E: model-free recording proof (cache hit records a library row), open-by-id composition + counters, identity isolation.

### Excluded

- Deleting or renaming library items (retention stays archive-first; no destructive action in v1).
- Retro-merge of pre-login anonymous rows onto the account (same limitation as attempt history; a backfill can follow the CHG-0013 pattern later).
- Public sharing, cross-user library browsing, or surfacing the library outside `/playground`.
- Auto-opening the most recent artifact on page load.

## Preserved behavior

`concept_explainers` serving (cache-first before the rate limiter), the POST contract and error table, prompt/scaffold/device-bucket versions and the cache key formula are unchanged. Nothing is deleted. A library-write or library-read failure never fails an explainer response.

## Test changes

`src/lib/server/schemaMigrations.test.js`: recorded `DDL_FINGERPRINT` updated for the new `user_explainers` DDL, paired with `SCHEMA_VERSION` 13 → 14 — the guard's designed workflow, assertions unchanged. New tests only otherwise (E2E additions in `tests/e2e/playground.e2e.js`).

## Decisions and constraints

- **D1 — identity mirrors attempt history**: rows carry `user_id` and `client_id`; reads match either (`user_id = me OR (user_id IS NULL AND client_id = this device)`). Anonymous rows are device-scoped; signed-in rows are account-scoped across devices. No retro-merge in v1.
- **D2 — dedupe per identity per cache_key** via two partial unique indexes (signed / anonymous); regenerating the same concept bumps recency instead of duplicating, and the list dedupes by `cache_key` for the signed-in-on-anonymous-row overlap.
- **D3 — opening is a cache read, not generation**: the by-id handler joins `user_explainers` to `concept_explainers` and composes at serve time (theme param), so library opens consume no model tokens and no generation quota.
- **D4 — recording is best-effort and happens on both paths**: cache hits and fresh generations both land in the library, because either way the caller received that explainer.
- **D5 — no destructive actions in v1**; `open_count`/`last_opened_at` are the only mutations.

Design references: `docs/superpowers/specs/2026-10-14-playground-explainer-design.md` (§5.5 cache, §7 client) and CHG-0020's conformance.

## Verification

- Unit: existing suites stay green (no pure-logic unit added beyond what E2E covers through the test bridge).
- E2E: three new tests in the playground suite (recording via cache hit; by-id composition + `open_count`; identity isolation), all model-free.
- Gates: `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e`, `npm run verify:vercel`.
- Post-deploy: `telemetry:report --days=7` — `/api/playground/library` logs, no new error codes, library-open counts on `concept_explainers.use_count` unaffected (opens do not touch the model cache counters; `open_count` lives on the library row).
