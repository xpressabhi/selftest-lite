---
protocol_version: "2.0"
id: "CHG-0023"
title: "Replace the phone Bookmarks tab with Playground and add Playground everywhere"
status: "draft"
created_at: "2026-10-14T15:30:00Z"
request: "provide a direct link to playground from footer in mobile (remove bookmarks from footer) and find a suitable place for playground on all other device sizes"
proposal:
  revision: 1
  digest: "sha256:d329cf6dc5a289f0563a9e0358f4b2faa4499ea1ad980eb8c5c3a0d58eb14305"
scope:
  paths:
    - ".intent/changes/CHG-0023/**"
    - "src/routes/+layout.svelte"
    - "src/lib/locales/*.json"
    - "tests/e2e/nav-active-state.e2e.js"
test_changes:
  - path: "tests/e2e/nav-active-state.e2e.js"
    reason: "Nav destinations changed at operator request: the phone bottom bar swaps Bookmarks for Playground, Playground gains desktop-bar and hamburger entries, and Bookmarks moves to the hamburger grid and user menu. Route/marker expectations updated; the marker contract itself is unchanged."
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

On phones, the bottom bar reads Home · Practice · Create · Playground · History with the
`sparkle` icon; Bookmarks leaves the bar. Playground also appears in the desktop top bar (after
Practice), the hamburger Explore grid, and the site footer. Bookmarks stays reachable on every
size through the hamburger grid and the account menu, so no destination is orphaned.

## Scope

### Included

- `playgroundHref` derived from `localizedPath` (Hindi twin follows for free), one new locale key
  (`playgroundTab`), and the five nav placements above.
- Nav E2E expectations updated for the new destinations; the active-marker contract
  (`.active` + `aria-current="page"`, nothing else) is untouched.

### Excluded

- No route, page, or feature changes; `/bookmarks` stays exactly as it is.
- No change to desktop width/layout constraints beyond one more link in the bar.

## Preserved behavior

Every destination keeps a working entry point on every surface; markers stay route-driven;
Create keeps its persistent bold emphasis; the footer keeps its existing links plus Playground.

## Test changes

`tests/e2e/nav-active-state.e2e.js` only (reasons in `test_changes`). No other pre-existing test is
modified.

## Decisions and constraints

- Playground uses the established patterns: `practiceTitle`-style page-title keys for bar/menu/
  footer labels, a dedicated `playgroundTab` for the bottom tab, and the existing `sparkle` icon.
- Bookmarks is relocated, not removed: hamburger grid + account menu (the menu already carries
  History, so it is the natural home for the other personal list).

## Verification

- `npx playwright test tests/e2e/nav-active-state.e2e.js tests/e2e/taste-pass.e2e.js` — markers,
  one-line desktop bar, 44px targets.
- `npm run lint`, `npm run test`; full E2E via the commit hook; `npm run verify:vercel` for the
  prerendered shell.
