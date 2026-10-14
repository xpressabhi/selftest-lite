---
protocol_version: "2.0"
id: "CHG-0020"
title: "Concept playground: animated HTML explainers"
status: "draft"
created_at: "2026-10-14T11:30:00Z"
request: "Research HTML in question explanations or build a playground that explains a topic via a detailed HTML artifact with CSS/JS animation; the playground direction was chosen"
proposal:
  revision: 2
  digest: "sha256:744063d81b87431c34aabb24462fbf1eb66fef7635fde34ab544a25f69a0ac7f"
scope:
  paths:
    - ".intent/changes/CHG-0020/**"
    - "docs/**"
    - "src/routes/playground/**"
    - "src/routes/hi/playground/**"
    - "src/routes/api/playground/**"
    - "src/lib/server/artifact*.js"
    - "src/lib/server/explainer*.js"
    - "src/lib/server/quizConfig.js"
    - "src/lib/server/quizSchema.js"
    - "src/lib/server/prompt.js"
    - "src/lib/server/storage.js"
    - "src/lib/client/ArtifactFrame.svelte"
    - "src/lib/client/ResultReviewItem.svelte"
    - "src/lib/client/ResultReviewList.svelte"
    - "src/routes/results/+page.svelte"
    - "src/lib/shared/playgroundLink.js"
    - "src/lib/shared/telemetryEvents.js"
    - "src/lib/shared/sitemap.js"
    - "src/lib/locales/*.json"
    - "tests/e2e/playground.e2e.js"
    - "scripts/eval-artifact*"
    - "package.json"
    - "package-lock.json"
test_changes:
  - path: "src/lib/server/schemaMigrations.test.js"
    reason: "Recorded DDL fingerprint update required by the intentional ensureStorageSchema change (new concept_explainers table); SCHEMA_VERSION bumped 12 to 13. The guard's assertions are unchanged."
links:
  related: []
  supersedes: []
  decisions: []
review_required: false
---

# Change intent

> Keep routine changes short. Add detail only when complexity, risk, ambiguity, or repository policy needs it. The digest covers everything below the front matter: after any body edit, run `sh .intent/scripts/verify-change.sh --change <dir> --print-digest`, increment `proposal.revision`, and paste the printed digest into `proposal.digest`.

## Outcome

A new `/playground` page delivers an animated, self-contained HTML explainer for any concept, reachable from a results review card with topic/question/answer prefilled. `POST /api/playground` runs a two-step Gemini pipeline (concept brief, then artifact body against a server-owned scaffold), validates the payload statically with one repair retry, caches the fragment cross-user in a new `concept_explainers` table (cache-first before the rate limiter), and returns a composed document that the client renders only inside `sandbox="allow-scripts"` iframe with a `default-src 'none'` CSP. A dev-time `npm run eval:artifact` harness measures artifact validity, console errors, and animation activity, and its report selects `ARTIFACT_MODEL`.

Design: docs/superpowers/specs/2026-10-14-playground-explainer-design.md

## Scope

### Included

- Playground page (en + `/hi` twin), API route, two-step pipeline, scaffold composition, static validation + repair, `concept_explainers` cache, rate limiting (5/min), review-card deep link, telemetry events, sitemap entry, unit tests, E2E suite, eval harness.

### Excluded

- HTML in markdown explanations (pipeline untouched), public/share artifact URLs, concept suggestions from weak answers, regenerate/variants, navigation entries, in-generation headless rendering.

## Preserved behavior

The markdown explanation pipeline (`markdownRenderer.js`, `MarkdownContent.svelte`, `/api/explain`, `question_explanations`) is unchanged. Existing tables are untouched; the new table is additive. No pre-existing test is modified, skipped, or deleted.

## Test changes

`src/lib/server/schemaMigrations.test.js`: the recorded `DDL_FINGERPRINT` is updated and unchanged assertions now cover the new `concept_explainers` DDL, paired with the `SCHEMA_VERSION` 12 → 13 bump in `storage.js`. This is the guard's designed workflow, not a weakened test.

New tests only otherwise: `src/lib/shared/playgroundLink.test.js`, `src/lib/server/artifactValidation.test.js`, `src/lib/server/artifactScaffold.test.js`, `src/lib/server/explainerCache.test.js`, `src/lib/server/artifactSchema.test.js`, `src/lib/server/artifactPrompt.test.js`, `tests/e2e/playground.e2e.js`.

## Decisions and constraints

- Two-step pipeline (brief → artifact) in one request; fragment-only model output; server owns head/CSP/theme (spec D1–D3).
- Sandbox + CSP are the security boundary; validation is a quality gate (spec D4).
- Cache mirrors `question_explanations`; compose at serve time so `theme` stays out of the cache key (D5).
- Artifact model constant is evidence-picked by `eval:artifact` (D2); `parse5` is added as a dependency; `explainerPipeline.js` is split out node-safe for the eval script (deviation from spec's file inventory, noted for conformance).
- Rate limit 5/min for generation; cache hits free (D6).

## Verification

- Unit suites: `npx vitest run` on the four pure-logic test files (written from the failure list first).
- `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e` (new `playground.e2e.js`: seeded-cache proof, UI flow, sandbox boundary against a DB-seeded hostile document, request bounds), `npm run verify:vercel`.
- `npm run eval:artifact` report (validity ≥ 7/8, animation ≥ 6/8, zero external requests, documents ≤ 150 KB) selects `ARTIFACT_MODEL`.
- Post-deploy telemetry read: no new `/api/playground` error codes; cache `use_count` rising.
