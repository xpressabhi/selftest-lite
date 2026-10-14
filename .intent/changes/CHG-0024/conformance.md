# Conformance — CHG-0024 Playground ordering and search

Outcome: "Your explainers" is ordered by `created_at DESC` (newest created first) and displays
each item's created date; a search input on the playground queries the caller's own explainers
(`mine: true`, openable in place) plus every already-generated public explainer (`mine: false`,
with `slug`, opening `/explain/<slug>`), deduped by cache key, ILIKE-escaped, capped at 12.

## Deviations

- The search endpoint extends `GET /api/playground/library?q=` instead of a new route: identical
  identity, rate-limit and no-store posture, one fewer surface.
- `/api/explain/label` telemetry reuses `playground:library-item-open` with `{ id, mine }` rather
  than adding an event.
- The MCP brief-order item (Pythagoras theorem) unaffected.

## Verification

- E2E (`tests/e2e/playground.e2e.js`, model-free): seeded rows asserted newest-created first with
  `createdAt` present and `mine: true`; search finds the served artifact as a public row for a
  different identity (`mine:false`, `id:null`, slug) and once-only as the owner's; unknown query
  returns an empty list. 10/10 playground tests green.
- Live check against the shared catalog at 390px (screenshots reviewed): "pythagoras" returns two
  Public matches; empty-state renders for no matches.
- `npm run lint` clean; commit hook runs the full unit + E2E suites.
