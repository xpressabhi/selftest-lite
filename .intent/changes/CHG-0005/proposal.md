# Change intent

## Request and outcome

Mobile shell navigation changes:

1. The bottom tab bar (the mobile footer) gains a Practice Exams tab that
   opens the practice hub, next to the existing Create button/link that opens
   the quick-test creation page (`/`).
2. The right-side hamburger menu (mobile navigation) display is optimized.

The requested result is visible on any phone-width viewport: five bottom tabs
including Practice, and a hamburger menu that stays readable and fully
reachable.

## Context

- The bottom tab bar lives in `src/routes/+layout.svelte` and currently has
  four items (Home, Bookmarks, Create, History) in a 4-column grid. Practice
  Exams is the only primary destination missing from it; it already exists in
  the header desktop nav, the site footer, and the hamburger menu.
- The hamburger menu opens under the sticky header as a single ragged list:
  seven Explore links without icons or active state, a long Quick Actions
  list, no height bound. On a short viewport the sticky header can clip the
  tail of the menu.
- Locale keys are mandatory in both languages (`src/lib/locales/*.json`).

## Scope

### Included

- Bottom tab bar: new Practice tab (icon + localized label) linking to the
  practice hub (`/practice`, Hindi twin `/hi/practice`), with an active state
  on the hub and on exam pages below it.
- Create tab keeps its destination (the quick-test creation page at `/`) and
  stays in the visual center.
- Hamburger menu: compact two-column icon grid for Explore links, active-page
  highlight, and a viewport-bounded scrollable height so every item stays
  reachable on short screens.
- New `practiceTab` locale key in English and Hindi.

### Excluded

- Desktop navigation, the site footer, and all routes are unchanged.
- No change to the create/quick-test flow, bookmarks, history, auth flows, or
  the telemetry event set.

## Preserved behavior

- Home, Bookmarks, History, and Create tabs keep their destinations; the
  Create tab still opens the home quick-test page.
- Desktop and tablet header navigation, all route content, and existing
  behavior outside the mobile shell are unchanged. The only pre-existing test
  change is declared below.

## Test changes

- `tests/e2e/taste-pass.e2e.js` — modified — the shell contract pins
  `.bottom-nav a` count at 4; the requested Practice tab makes it 5. Update the
  pinned count and assert the new tab points at `/practice`.

## Decisions and constraints

- Tab order Home, Practice, Create, Bookmarks, History keeps Create centered
  and groups discovery (Home, Practice) left of it and personal tabs
  (Bookmarks, History) right of it.
- The tab label uses the short `practiceTab` key ("Practice") while the menu
  keeps the full `practiceTitle`, so five labels fit at 320px; the grid uses
  `minmax(0, 1fr)` tracks and ellipsizing labels so no label can push the bar
  past the viewport.
- The menu's max height is the viewport minus the sticky header (minus the
  fixed bottom bar on phones) with `overflow-y: auto`; this removes the
  clipped-tail failure mode.
- Icons reuse the local `Icon` component: target (practice), info (about),
  book (blog), note (FAQ), mail (contact), shield (privacy), scale (terms).

## Verification

- `npm run lint`, `npm run test`, `npm run check`.
- `npm run test:e2e` (the updated `taste-pass` and the full suite).
- Visual spot-check of the shell at 390x844 and 320x700 (bottom bar fit,
  hamburger menu open/scroll), per the repository's local-UI rule.
