---
protocol_version: "2.0"
id: "CHG-0022"
title: "Public per-explainer URLs with sharing"
status: "draft"
created_at: "2026-10-14T14:10:00Z"
request: "make each explainer have unique, seo friendly url, and a share button as well"
proposal:
  revision: 1
  digest: "sha256:29ac2ad0c98e9c458c80ae82cafa4c32fbf1f1b476e5a98a2410d8f887196e77"
scope:
  paths:
    - ".intent/changes/CHG-0022/**"
    - "docs/**"
    - "README.md"
    - "scripts/backfill-explainer-slugs.mjs"
    - "src/lib/server/explainerSlug.js"
    - "src/lib/server/explainerCache.js"
    - "src/lib/server/storage.js"
    - "src/routes/api/playground/**"
    - "src/routes/explain/**"
    - "src/routes/hi/explain/**"
    - "src/lib/client/shareLink.js"
    - "src/lib/client/pages/PublicExplainerPage.svelte"
    - "src/lib/client/pages/PlaygroundPage.svelte"
    - "src/lib/locales/*.json"
    - "src/lib/shared/telemetryEvents.js"
    - "tests/e2e/playground.e2e.js"
test_changes:
  - path: "src/lib/server/schemaMigrations.test.js"
    reason: "Recorded DDL fingerprint update required by the intentional ensureStorageSchema change (slug column + partial unique index on concept_explainers); SCHEMA_VERSION bumped 14 to 15. The guard's assertions are unchanged."
links:
  related:
    - "CHG-0020"
    - "CHG-0021"
  supersedes: []
  decisions: []
review_required: false
---

# Change intent

> Keep routine changes short. Add detail only when complexity, risk, ambiguity, or repository policy needs it. The digest covers everything below the front matter: after any body edit, run `sh .intent/scripts/verify-change.sh --change <dir> --print-digest`, increment `proposal.revision`, and paste the printed digest into `proposal.digest`.

## Outcome

Every generated explainer gets a deterministic, human-readable slug stored on `concept_explainers`, a public SSR page at `/explain/<slug>` (and its `/hi/explain/<slug>` twin) that renders the artifact in the same sandboxed frame with canonical + hreflang metadata, and a Share button on the result card and the public page that uses the native share sheet with a copy-link fallback. The API responses (POST `/api/playground`, library list, library open) carry the slug so the client can build the URL.

## Scope

### Included

- `slug` column + partial unique index on `concept_explainers` (SCHEMA_VERSION 14 → 15), deterministic `buildExplainerSlug({ title, cacheKey })`.
- Backfill: lazy on cache-hit serving plus `scripts/backfill-explainer-slugs.mjs` for pre-existing rows.
- Public routes `/explain/[slug]` + `/hi/explain/[slug]` (SSR, chrome language by route), rendering title/summary and the artifact via the existing `ArtifactFrame`; server load composes light and dark documents and the page picks by the visitor's theme.
- `shareLink` client helper (native share → clipboard fallback → toasts) and Share buttons on the playground result card and the public page; `playground:share` telemetry.
- Slug surfaced in POST/library responses.
- E2E: public page renders a seeded explainer (model-free), unknown slug 404s, the Hindi twin renders, and the result card exposes the Share control.

### Excluded

- Dynamic sitemap entries for explainer pages (the sitemap stays build-time; a DB-backed segment is a follow-up once volume warrants).
- Per-artifact Open Graph images (the site default OG image is used).
- Moderation workflow beyond existing controls: generation stays rate-limited and cost-bounded, the artifact renders only inside the sandbox with a `default-src 'none'` CSP, and the existing question-report affordances are unchanged. A report/`noindex`-until-reviewed switch is a follow-up if abuse appears.
- Editing or deleting published explainers; slugs are immutable once assigned.

## Preserved behavior

The playground flow, cache-first generation, device buckets, the library, and every existing public page are unchanged. `buildSeo` classifies `/explain/*` as indexable automatically (it is not in `NOINDEX_PREFIXES`), so canonical + reciprocal hreflang come from the existing implementation; `robots.txt` already allows the path.

## Test changes

`src/lib/server/schemaMigrations.test.js`: recorded `DDL_FINGERPRINT` updated for the slug column + index DDL, paired with `SCHEMA_VERSION` 14 → 15 — the guard's designed workflow, assertions unchanged. New tests: a slug unit test in `src/lib/server/explainerSlug.test.js` and E2E additions in `tests/e2e/playground.e2e.js`.

## Decisions and constraints

- **D1 — deterministic slugs**: `slugify(title)` capped at 60 chars + `-` + the first 8 hex chars of `sha256(cacheKey)`. Same artifact → same URL for everyone; recomputation doubles as the backfill.
- **D2 — the public page reuses the sandbox**: artifacts keep executing only inside `srcdoc` + `sandbox="allow-scripts"`; the public page adds no new rendering path.
- **D3 — indexable by default, deliberately reversing CHG-0020's "no public share links" non-goal** at the operator's request. Rationale recorded here; the risk is unbounded thin/programmatic pages, bounded by the 5/min generation limit and API cost. Sitemap inclusion waits for a DB-backed segment.
- **D4 — sharing never fabricates content**: the share URL is the canonical public URL of the served artifact; native share first, clipboard + toast fallback, no auto-download.
- **D5 — Hindi twins share one artifact**: both route languages render the same artifact document; only the page chrome localizes, and hreflang declares the pair (matching the site's public-page pattern).

## Verification

- Unit: `explainerSlug.test.js` (slug shape, collision resistance, Devanagari fallback, length cap).
- E2E additions: seeded explainer → POST returns a slug → `GET /explain/<slug>` 200 with title text, canonical link and the sandboxed frame; unknown slug 404; `/hi/explain/<slug>` 200; result-card Share control present.
- Gates: `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e`, `npm run verify:vercel` (dynamic routes are not in the sitemap; the verifier's sitemap contract is unchanged).
- Backfill script run against the database; one live explainer URL verified after deploy.
