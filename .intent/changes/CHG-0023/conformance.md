# Conformance — CHG-0023 Playground in the nav

Outcome: the phone bottom bar is Home · Practice · Create · Playground (sparkle) · History —
Bookmarks left the bar. Playground additionally sits in the desktop top bar (after Practice),
the hamburger Explore grid, and the site footer. Bookmarks stays reachable via the hamburger
Actions row and a new desktop header icon, so no destination lost its entry point.

## Deviations

- The now-orphaned `bookmarksTab` locale key was deleted from both dictionaries rather than left
  unemitted (the locale scan reports dead keys; the tab label is gone with the tab).
- The mobile-menu Bookmarks entry reuses the page-title key `bookmarks` (matching how `history`
  is used in the same section) instead of a nav-specific string.

## Verification

- `npx playwright test tests/e2e/nav-active-state.e2e.js tests/e2e/taste-pass.e2e.js` — 18/18:
  desktop bar routes + click-through (Playground included), hamburger grid (+Playground,
  +Bookmarks), bottom bar (Playground marked, Bookmarks unmarked), Create emphasis, one-line
  desktop bar with the extra link.
- Bottom-nav render check at 390px: labels ["Home","Practice","Create","Playground","History"],
  scrollWidth overflow 0 (screenshot reviewed).
- `npm run lint` clean; commit hook runs the full unit + E2E suites.
