# Conformance

## Outcome

As requested, against proposal revision 1 (digest
`sha256:3dc2a85a4834882b8fd1c37e39526be93bb5536ddcbd685d1f17db0723059f1d`):

- The mobile footer (bottom tab bar) now has five tabs: Home, Practice, Create,
  Bookmarks, History. Practice opens the practice hub (`/practice` in English,
  `/hi/practice` in Hindi) and is highlighted on the hub and on every exam page
  below it. Create keeps its short quick-test path to the home creation page and
  stays in the visual center.
- The hamburger menu is compact and scannable: Explore links render as a
  two-column icon-tile grid, the current page is highlighted (`aria-current`),
  Quick Actions keep their icon rows, the panel is height-bounded and scrollable
  so no row can be clipped on short screens, and the trigger swaps to a close
  icon while open.
- `practiceTab` ("Practice" / "प्रैक्टिस") added to both locale files.

## Verification

| Check | Result |
| ----- | ------ |
| `npm run lint` | Pass |
| `npm run test` | Pass — 71 files, 831 tests |
| `npm run check` | Pass — check-build-mode OK |
| `npm run test:e2e` | Pass — 157/157, including the updated `taste-pass` shell contract |
| `npm run verify:vercel` | Pass — 236 sitemap URLs, 232 prerendered pages |
| Search bench, 390x844 | Five labelled tabs render, menu tile grid + active highlight, tapping the Practice Exams tile navigates to `/practice` and closes the menu |
| Search bench, 320x700 | Tabs and labels fit (`Bookmarks` 58/58 px, no ellipsis); Hindi labels (`प्रैक्टिस`, `बुकमार्क`, ...) fit; menu bounded at 383 px inside the 580 px allowance |

## Test changes

- `tests/e2e/taste-pass.e2e.js` — modified as declared: pinned bottom-nav count
  updated from 4 to 5 and the new tab's `href="/practice"` asserted. All other
  pre-existing tests passed unmodified.

## Deviations and decisions

- None material. Implementation note: the tab anchors' inline padding was set
  to 0 so the widest label (`Bookmarks`) fits exactly at 320 px without an
  ellipsis; the nav keeps its safe-area inline padding.
- The `Bookmarks` tab moved from position 2 to position 4 to keep the Create tab
  centered between discovery (Home, Practice) and personal (Bookmarks, History)
  tabs; destinations are unchanged.

## Approval constraints

Not required (`review.required: false`); no review evidence recorded.
