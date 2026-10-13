## scope.included

- Bottom tab bar: Practice tab linking to /practice (and /hi/practice), active on practice pages.
- Hamburger menu: two-column icon grid for Explore links, active-page highlight, viewport-bounded scrollable height.
- practiceTab locale key in English and Hindi.

## scope.excluded

- Desktop navigation, site footer, routes, create flow, telemetry events.

## preserved

- Home, Bookmarks, History and Create tabs keep their destinations.
- Create tab still opens the home quick-test creation page.
- Desktop and tablet header navigation and all route content are unchanged.

## decisions

- Order Home, Practice, Create, Bookmarks, History keeps Create centered and groups discovery vs personal tabs.
- Short practiceTab label in the tab bar, full practiceTitle in the menu, so five labels fit at 320px.
- Menu max-height = viewport minus sticky header (minus the phone bottom bar) with overflow-y auto, so long menus stay reachable.
- Reuse the local Icon component for every menu link instead of adding glyphs.

