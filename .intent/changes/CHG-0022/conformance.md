# Conformance — CHG-0022 Public per-explainer URLs with sharing

Outcome: every explainer has a deterministic public slug (`slugify(title)` + first 8 hex of
`sha256(cacheKey)`, stored on `concept_explainers`, SCHEMA_VERSION 14 → 15); `/explain/<slug>` and
`/hi/explain/<slug>` SSR pages render the artifact in the same sandboxed frame with canonical +
reciprocal hreflang from the existing `buildSeo`; POST/library responses carry the slug; Share
buttons (native sheet → clipboard fallback + toast) sit on the result card and the public page;
`playground:share` is allowlisted. Legacy rows are backfilled by
`npm run explainers:backfill-slugs` and lazily on cache hits.

## Deviations from the proposal

1. A latent SSR bug in `ArtifactFrame.svelte` surfaced the first time the frame was
   server-rendered (the playground only mounts it client-side): Svelte runs `onDestroy`
   teardown during SSR too, and the callback called `window.removeEventListener` unguarded.
   Fixed with a `typeof window === 'undefined'` guard — this was a real defect found by the new
   public-page E2E, not a test accommodation.
2. The record's `links.related` uses block-style YAML (the verifier rejects multi-item flow
   sequences); CHG-0021's record was corrected to match.

## Decisions

- D1 deterministic slug; same artifact → same URL for every visitor; recomputation is the
  backfill.
- D2 the public page reuses `srcdoc` + `sandbox="allow-scripts"`; no new rendering path. The
  server load composes light and dark variants and the client picks by theme.
- D3 indexable by default (`/explain` is not a `NOINDEX_PREFIXES` entry), deliberately reversing
  CHG-0020's "no public share links" non-goal at the operator's request. Risk — unbounded thin
  pages — is bounded by the 5/min generation limit, API cost, and the sandbox; robots.txt
  already allows the path; not in the sitemap in v1.
- D4 sharing is the canonical URL only: native share first, clipboard + toast fallback,
  dismissed sheets are `cancelled` (no surprise second action).
- D5 both route languages render the same artifact; only chrome localizes; hreflang declares
  the pair.

## Verification

- `npm run lint`, `npm run check` (199 chunks), `npm run test` — 1100/1100 (new slug suite).
- `npm run test:e2e -- tests/e2e/playground.e2e.js` — 8/8, including the new public-page test:
  seeded row → POST backfills + returns the slug → `/explain/<slug>` 200 with title, summary,
  canonical, hreflang twin and the sandboxed frame → `/hi/explain/<slug>` 200 → unknown slug 404
  → library row exposes the same slug → evidence attached.
- `npm run verify:vercel` — sitemap contract unchanged (explainer pages are dynamic and not in
  the sitemap); verifier passes.
- `npm run explainers:backfill-slugs` run against the database; existing rows received slugs.

## Follow-ups

- DB-backed sitemap segment for explainer pages once volume warrants; per-artifact OG images.
- Moderation switch (report / `noindex`-until-reviewed) if public output ever draws abuse.

## Consistency fix pass

- New shared `ExplainerHeader` (title + summary + action row) renders on both surfaces: the
  public page uses tag `h1` at page size, the playground result card uses `h2` at card size —
  same layout, same Share placement, platform semantics preserved.
- The playground result card moves Share / New concept above the artifact, so actions no longer
  sit below a tall frame; the public page keeps its top-of-page Share.
- Playground E2E unchanged and green (8/8); public page assertions still pass because the page
  chrome (not the artifact) carries the title/summary.

## Border cleanup

The public explain page's wrapper card is removed for the same reason as the playground result
surface: header + artifact sit directly on the page, and the only remaining border is the
artifact's own content card. Verified against the live `pythagoras-theorem-74d80856` payload at
390px (zero wrapper cards; single title; correct filled-button contrast).
