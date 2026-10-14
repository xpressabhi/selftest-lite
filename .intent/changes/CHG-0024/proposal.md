---
protocol_version: "2.0"
id: "CHG-0024"
title: "Playground: creation-ordered library and explainer search"
status: "complete"
created_at: "2026-10-14T16:40:00Z"
request: "keep createdat timestamp for each explainer and show the recent one first in playground, and make the playground searchable"
proposal:
  revision: 1
  digest: "sha256:935eae766f48e122ca2cbf23d3b937e49498c0a836f53f62daa918f4b5690fa5"
scope:
  paths:
    - ".intent/changes/CHG-0024/**"
    - "src/lib/server/explainerLibrary.js"
    - "src/routes/api/playground/**"
    - "src/lib/client/pages/PlaygroundPage.svelte"
    - "src/lib/locales/*.json"
    - "tests/e2e/playground.e2e.js"
test_changes:
  - path: "tests/e2e/playground.e2e.js"
    reason: "Library expectations extended for the requested behaviour: items are asserted in created_at order, search results carry a mine/public distinction, and the created timestamp is asserted on list items. The marker contract and existing assertions are unchanged."
links:
  related:
    - "CHG-0021"
    - "CHG-0022"
  supersedes: []
  decisions: []
review_required: false
---

# Change intent

> Keep routine changes short. Add detail only when complexity, risk, ambiguity, or repository policy needs it. The digest covers everything below the front matter: after any body edit, run `sh .intent/scripts/verify-change.sh --change <dir> --print-digest`, increment `proposal.revision`, and paste the printed digest into `proposal.digest`.

## Outcome

The playground's "Your explainers" list is ordered by creation time, newest first, and shows each
item's created date. A search box filters/extends that list: typing matches the caller's own
explainers (open in place) and every already-generated public explainer (open at its `/explain`
page) — so finding an existing artifact is always cheaper than generating a new one.

## Scope

### Included

- `created_at DESC` ordering + created-date display in the library list (the timestamp was
  already stored and returned).
- `GET /api/playground/library?q=` — unified search: the caller's rows (`mine: true`, with the
  in-place open id) plus public `concept_explainers` rows not already in the caller's set
  (`mine: false`, with `slug`), deduped by cache key, capped, ILIKE-escaped.
- Playground search input (debounced), result list replacing the recent list while a query is
  present, created dates on items, public items linking to `/explain/<slug>`.
- E2E: created-order assertion via seeded rows; search finds own and public rows; empty state.

### Excluded

- No full-text ranking (substring match, newest first), no pagination, no search index (the
  catalog is small; a trigram index is a follow-up if it grows).
- No change to generation, caching, slugs, or the public page.

## Preserved behavior

Opening from the library is still a cache read (no model calls); the public-page contract,
cache keys, and rate limits are unchanged; search is read-only.

## Test changes

`tests/e2e/playground.e2e.js` only, extended (reason in `test_changes`).

## Decisions and constraints

- **D1 — order by creation, not last open.** The operator asked for the recent one first; opening
  an item still updates `last_opened_at`, but ordering ignores it.
- **D2 — search spans the public catalog by design.** Published explainers already have public
  URLs; searching them exposes no new information and directly serves the token-saving goal.
  Own rows are deduped out of the public results by cache key.
- **D3 — public matches open the `/explain` page** instead of a new in-place path: no new read
  surface, and the public page already composes from cache.

## Verification

- E2E additions (model-free): seeded rows in created order; `?q=` returns own + public with the
  right `mine`/`slug` fields; unknown query → empty list; existing library/open tests stay green.
- `npm run lint`, `npm run test`, full E2E via the commit hook.
