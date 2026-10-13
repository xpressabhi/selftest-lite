---
protocol_version: "2.0"
id: "CHG-0016"
title: "Move the results share control below the score as a labeled button"
status: "complete"
created_at: "2026-10-12T17:32:09Z"
request: "Make the share button on the test result page more prominent; move it from the top-right corner to below the score."
proposal:
  revision: 1
  digest: "sha256:93664b526525d8dc125c25226f8a5bc3120c96f9c69e13bd8155e39a184bdf82"
scope:
  paths:
    - ".intent/changes/CHG-0016/**"
    - "src/routes/results/+page.svelte"
    - "src/lib/locales/english.json"
    - "src/lib/locales/hindi.json"
test_changes: []
links:
  related: []
  supersedes: []
  decisions: []
review_required: false
---
# Change intent

## Request and outcome

"Make share button on test result page more prominent, some users are not able to find it, as it is at the top right corner of the card make it just below the score."

The results hero card's share control moves from the top-right corner (an icon-only circle users
miss) to directly below the score cluster, as a labeled secondary button ("Share result") that keeps
the existing share sheet. The top-right icon is removed.

## Context

- The control is a 44px icon-only circle in `.hero-top`; the share sheet it opens is well tested —
  `results-hero.e2e.js` targets `.hero-share` / `.hero-share-sheet` and the two menuitem names.
- The hero already has a primary CTA ("Practice weak questions"); the share action must stay
  secondary so it does not compete.
- Design system: interactive controls stay ≥44px, buttons follow the `.btn` conventions, and no
  glyph/emoji text is introduced.
- i18n is mandatory: the new visible label needs English + Hindi keys.

## Scope

### Included

- Results page hero: remove the share control from `.hero-top`; add the same `.hero-share-wrap` /
  `.hero-share` / `.hero-share-sheet` structure (same id, aria wiring, focus handling, dismissal)
  below the score cluster, centered, with a visible label next to the share icon.
- Styles: icon circle → bordered pill (min-height 44px); the sheet anchors centered under the
  button instead of right-aligned; drop the old hit-area pseudo-element.
- Locales: new `resultsShareCta` key in `english.json` and `hindi.json`.

### Excluded

- Any behavior change: sheet actions, focus return, Escape/outside-tap dismissal, print hiding and
  the challenge share URL logic are untouched.
- The test page share button, streak card share, and every other surface.
- Test changes: no existing spec is modified.

## Preserved behavior

- `.hero-share`, `.hero-share-wrap`, `.hero-share-sheet` classes and the `result-share-sheet` id
  stay on the same roles, so `results-hero.e2e.js` (and the download fallback spec) pass unchanged.
- Both sheet items keep their labels and actions.
- No pre-existing test is modified, deleted or skipped.

## Test changes

None. Existing specs cover the moved control; the visual placement is verified with screenshots at
390px and 1280px.

## Decisions and constraints

- Keep the class names and ARIA contract rather than restyling in place, so the move is provably
  behavior-preserving.
- Label the button instead of enlarging the icon: discoverability was the problem, not size.
- Secondary styling (bordered pill, brand text) so the practice CTA stays the single primary action.

## Verification

- `npm run lint`, `npm run test`, `npm run check`, `npm run test:e2e` green with no test edits.
- Screenshots at 390px and 1280px show the labeled button below the score and the sheet opening
  centered.
