# Conformance record

> Complete at `conformance_review`. Keep it factual and short; scale detail to the change.

## Outcome

The results hero's share control sits directly below the score cluster as a labeled secondary
button ("Share result" / "रिज़ल्ट शेयर करें") with the share icon; the icon-only circle in the
top-right corner is gone. The share sheet keeps its actions, focus handling, Escape/outside-tap
dismissal and ids, and now opens upward from the button so it stays inside the hero card.

Change `CHG-0016` revision 1, proposal digest
`sha256:93664b526525d8dc125c25226f8a5bc3120c96f9c69e13bd8155e39a184bdf82`.

## Verification

| Command                                      | Result                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `npm run lint`                               | pass, no output                                                           |
| `npm run test`                               | **992 passed / 79 files** — unchanged                                     |
| `npm run check`                              | **check-build-mode: OK — 195 chunks**, no DEV-only code                   |
| `npm run test:e2e`                           | **196 passed (2.1 min)** — no test edits, no flakes                       |
| `results-hero` + `share-cards` focused run   | **14 passed** — sheet open/close, focus return, Escape, outside tap, download fallback |

Visual evidence at 390×844 and 1280×900: the labeled pill renders centered under the score with the
practice CTA still the single primary action; with the sheet open, both menu items are fully visible
and the panel is centered over the ring. Screenshots: `share-390.png`, `share-390-sheet.png`,
`share-1280.png`.

## Test changes

None. The existing specs target `.hero-share` / `.hero-share-sheet` and the menuitem names, which
the move preserved; no pre-existing test was modified, deleted or skipped.

## Deviations and decisions

- **The sheet was flipped to open upward after a visual check.** With the button moved below the
  score, a downward sheet was clipped by the hero card's `overflow: hidden` (the second menu item
  was cut off at the card edge). Anchoring the sheet above the button keeps it fully inside the card
  without touching the card's overflow — which dates back to the original spotlight-hero design and
  was left alone.
- **The class and ARIA contract was preserved deliberately** so the move is provably
  behavior-preserving for the existing share specs.
- **One new locale key** (`resultsShareCta`) in English and Hindi; no other strings changed.

## Approval constraints

Not required. `.intent/config.yaml` has `review.required: false`; the layout was approved by the
operator (move below the score, remove the top-right icon) before implementation.
