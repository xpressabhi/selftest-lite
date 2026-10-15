---
protocol_version: "2.0"
id: "CHG-0025"
title: "Visual explanations inline: review-card embed, question links, Jev fit gate"
status: "draft"
created_at: "2026-10-15T06:02:00Z"
request: "embed visual explanation in the review card, link it back to the question, judge worthiness with Jev before generating"
proposal:
  revision: 1
  digest: "sha256:444b24bf63114ac1accbd2a67d7f53bd6cd4116573d0a5ea4c963c8bb7a4032a"
scope:
  paths:
    - "src/routes/api/playground/**"
    - "src/routes/api/visual-fit/**"
    - "src/routes/results/**"
    - "src/lib/server/**"
    - "src/lib/client/**"
    - "src/lib/shared/**"
    - "src/lib/locales/**"
    - "tests/e2e/**"
    - "README.md"
    - "docs/architecture.md"
    - "docs/content-quality.md"
test_changes:
  - path: "tests/e2e/playground.e2e.js"
    reason: "Extended for the requested behaviour: the pre-generation refusal on a seeded verdict (no explainer row, no generation quota), the linked serve carrying source, and the provenance chip. Existing specs and helpers are unchanged."
  - path: "src/lib/shared/playgroundLink.test.js"
    reason: "Deleted together with its now-unused helper src/lib/shared/playgroundLink.js when the review card's old Explain visually link is replaced by the inline visual section; a planned removal, not a test weakened to pass."
  - path: "src/lib/server/schemaMigrations.test.js"
    reason: "Recorded DDL fingerprint update required by the intentional ensureStorageSchema change (two new tables and their indexes); SCHEMA_VERSION bumped 15 to 16. The guard's assertions are unchanged."
links:
  related:
    - "CHG-0020"
    - "CHG-0021"
    - "CHG-0022"
    - "CHG-0024"
  supersedes: []
  decisions: []
review_required: false
---

# Change intent

> Keep routine changes short. Add detail only when complexity, risk, ambiguity, or repository policy needs it. The digest covers everything below the front matter: after any body edit, run `sh .intent/scripts/verify-change.sh --change <dir> --print-digest`, increment `proposal.revision`, and paste the printed digest into `proposal.digest`.

## Outcome

Review cards generate and embed the animated visual explainer inside the card (no navigation), every served explainer is recorded against the question that produced it and restored on later visits and other signed-in devices, and one shared Jev "visual-fit" judge gates the affordance on review cards and refuses vague or text-first playground topics with guidance before any generation tokens are spent. The playground library shows "From your test" provenance for linked explainers, and the public explainer page points visitors at the playground.

## Scope

### Included

- Storage: `question_visual_fits` (content-addressed judge verdict cache) and `question_explainer_links` (identity-scoped question-to-explainer links with two partial unique indexes and two lookup indexes) in `ensureStorageSchema`; SCHEMA_VERSION 15 to 16.
- Server: pure judge engine (`visualFit.js`), verdict cache (`visualFitCache.js`), fail-open orchestrator (`visualFitJudge.js`), and the question-link module (`questionExplainerLinks.js`).
- API: `POST /api/visual-fit` (20/min) and `GET /api/playground/links` (30/min, owner-only, no-store); `POST /api/playground` gains the pre-generation judge gate, the optional `source` field, and best-effort link recording; `GET /api/playground/library` items gain `source`.
- Client: `VisualExplainerSection` on the review card (build inline, embed, show from cache, retry, share, open full page) replacing the old "Explain visually" link; per-question verdict gate that fails open; `#question-N` hash expand; playground Judging stage, refusal guidance panel, and provenance chip; "Create your own" on the public explainer page.
- Locales (en + hi), telemetry allowlist additions/removal, docs (README endpoints, architecture paragraph, content-quality note).

### Excluded

- No change to `/api/explain`, the markdown pipeline, or `ArtifactFrame`'s sandbox contract; the public explainer page stays identity-free and view-only.
- No "generate anyway" override, no auto-visualization for wrong answers, no visual regeneration beyond retry, no cross-user sharing of links, no pre-login cross-device links, and no new HTML read path (the embed reuses `GET /api/playground/library?id=`).
- No feature flag, no environment changes, and no migration beyond the `ensureStorageSchema` additions; the new tables are append/update only (archive-first, never deleted).

## Preserved behavior

The playground's cache-first ordering (a cache hit never calls the judge), the `/api/playground` response contract for served explainers (including `slug`), the `/playground?topic=&question=&answer=` prefill contract, generation rate limits, and the artifact sandbox/CSP are unchanged. A link write or links read failure never fails a response, and the review card degrades silently to the verdict-gated affordance. Existing behavior and pre-existing tests are unchanged except the recorded test changes below.

## Test changes

- `tests/e2e/playground.e2e.js` (modified): extended for the refusal path, the linked serve, and the provenance chip; existing specs stay green.
- `src/lib/server/schemaMigrations.test.js` (modified): recorded `DDL_FINGERPRINT` updated for the two new tables and their indexes, paired with the `SCHEMA_VERSION` 15 to 16 bump in `storage.js`; the guard's assertions are unchanged. This is the guard's designed workflow: its own failure message instructs the update.
- `src/lib/shared/playgroundLink.test.js` (deleted): removed together with its now-unused helper `src/lib/shared/playgroundLink.js` when the review card's old "Explain visually" link is replaced by the inline visual section. The playground URL prefill contract itself is covered by the existing deep-link spec.

New tests (additions, not listed as changes): `visualFit.test.js`, `visualFitCache.test.js`, `visualFitJudge.test.js`, `questionExplainerLinks.db.test.js`, and `tests/e2e/visual-explanation.e2e.js`.

## Decisions and constraints

- **D1: one shared judge, two enforcement points.** One server module judges visual worthiness for both the review card and the playground gate; verdicts are content-addressed and global, and degraded (failed) verdicts are never persisted, so the next request re-judges.
- **D2: links are identity-scoped and archived-first.** Reads mirror `user_explainers` (`user_id = X OR (user_id IS NULL AND client_id = Y)`); re-recording the same test+question replaces through the partial unique indexes instead of duplicating; no destructive operations touch the new tables.
- **D3: refusal is a guidance state, not an error.** On a cache miss the judge runs before the generation rate limiter; a refusal returns 200 `VISUAL_NOT_WORTHY` with a category, consumes no generation quota, and leaves the topic editable.
- **D4: fail-open on judge outage.** Any provider, timeout, or parse failure returns `suggested: true, degraded: true`; the client shows the affordance for degraded verdicts.
- **Constraints:** every user-facing string ships in English and Hindi in the same commit; telemetry allowlist entries change in the same commit as their emit sites; the DDL change carries the SCHEMA_VERSION bump and the fingerprint update together; E2E never calls model providers (judge failure modes are pinned by unit tests with a fake client and by cache-seeded rows); semicolons and single quotes.

Design: `docs/superpowers/specs/2026-10-15-visual-explanation-embed-design.md` (approved 2026-10-15).

## Verification

- Task 1 (record + schema): the fingerprint test passes at baseline; after the DDL change it fails and prints the new digest, which is pasted as `<digest>:16`; the re-run passes (3 tests). The schema commit runs the repo's pre-commit hook (lint + unit + E2E).
- Record check: `sh .intent/scripts/verify-change.sh --change .intent/changes/CHG-0025` verifies the digest, scope, and declared test changes, and runs `npm run test` (the repository verify command).
- Behavioral evidence: E2E additions in `playground.e2e.js` and `visual-explanation.e2e.js` are model-free (seeded verdicts, stubbed routes); judge failure modes are pinned by `visualFitJudge.test.js`; identity isolation and upsert-replace by `questionExplainerLinks.db.test.js`.
- Final gates (Task 14): `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e`, `npm run verify:vercel`.
