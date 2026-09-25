# Design System

One page for the rules every UI change follows. If a page needs to break one, document why
next to it. The contract is enforced by `tests/e2e/design-consistency.e2e.js` and
`tests/e2e/taste-pass.e2e.js` — run `npm run test:e2e` before shipping UI work.

## Breakpoints

| Name | Width | Layout intent |
| ---- | ----- | ------------- |
| small phone | `< 480` | single column, compact padding |
| phone | `≥ 480` | single column |
| tablet | `≥ 640` | two-up grids, roomier padding |
| tablet landscape / small laptop | `≥ 768` | two-column page grids, no bottom nav |
| desktop | `≥ 1024` | full nav, side-by-side secondary panels |
| wide | `≥ 1280` | content stays capped (see widths) |

Do not add one-off breakpoints (no `576`, `992`, `359.98`). Max-width queries use `.98px`
to avoid overlap (`max-width: 767.98px`).

## Widths

- Reading/prose: `40rem` (~65–75ch). Headings balance with `text-wrap: balance`.
- App content: `720px` (test flow, exam-paper, stats) or `860px` (results).
- Marketing pages: `container` (`max-w-7xl`) for the page, narrower text columns inside.
- Admin: `1120px`.

## Spacing

Tailwind's 4px scale, and only that. Card/panel padding is `1rem` on phones and `1.5rem`
from 768px up (the `.panel` class does this). Section rhythm is 16 / 24 / 32px. The old
Bootstrap aliases (`mt-3`, `p-3`, `py-5`, `h-100`, `w-100`, …) were removed because
Tailwind's utilities always won and silently changed their values.

## Type scale

| Class | Phone | ≥768 | Use |
| ----- | ----- | ---- | --- |
| `.text-display` | 1.75rem | 2.25rem | results hero only |
| `.text-page` | 1.5rem | 1.875rem | one `<h1>` per page |
| `.text-section` | 1.125rem | 1.25rem | section `<h2>`s |
| `.text-meta` / `.small` | 0.8rem | — | helper text |
| `.text-micro` | 0.72rem | — | chips, captions |

The home kicker is a documented exception: it is a compact one-line H1 pinned by
`tests/e2e/home-layout.e2e.js`.

## Shape, elevation, colour

- Radius: `--radius-control` 10px (controls), `--radius-surface` 12px (cards/panels),
  `--radius-overlay` 16px (menus/sheets/modals), pill 999px. No other values.
- Elevation: `--shadow-1` (resting) and `--shadow-2` (overlays). Backdrops use
  `--backdrop`, which is visible in both themes.
- Colour comes from tokens (`--surface`, `--surface-muted`, `--text`, `--text-muted`,
  `--line`, `--brand-*`, `--ok/--warn/--danger`). Components must not hardcode hex or
  rgba values; `color-mix(...)` over a token is the way to build tints.
- One accent (indigo). Dark mode swaps `--brand-text`; anything that must keep contrast in
  both themes uses `var(--brand-text)` with a token mix, never a fixed `brand-100/700`.
- Shadows and borders follow the same hue in both themes; no pure black on light surfaces.

## Layers

`--z-banner` 1025 < `--z-bottom-nav` 1030 < `--z-header` 1040 < `--z-overlay` 1060 <
`--z-dropdown` 1080 < `--z-modal-backdrop` 1120 < `--z-modal` 1121 < `--z-toast` 1180 <
`--z-skip` 1200. Toasts sit above modals; sheets and wizards use the modal layer.

## Safe areas

`app.html` sets `viewport-fit=cover`. Sticky/fixed chrome uses `--sat` / `--sab`
(`.app-header`, connection banner, bottom nav, test header/bottom bar, toasts, install
hint). Pages must not add their own top safe-area padding.

## Components

- `.panel` — the only card recipe (surface, border, radius, responsive padding).
- `.chip` — interactive pill filter: 44px, token active state.
- `.btn` / `.btn-sm` — 44px minimum on coarse pointers; `.btn-sm` is density, not target
  size (never below 44px).
- `.form-control` / `.form-select` — 44px, token focus ring, dark-mode aware.
- Icons: `Icon.svelte` only, one stroke family.

## Content handling

Text containers use `min-width: 0` plus `overflow-wrap: anywhere` or ellipsis. Long option
strings, score names, toast messages, table cells and Hindi copy must never push a control
out of its card. Tables scroll inside a wrapper (`overflow-x-auto`), not the page.

## Verification

`tests/e2e/design-consistency.e2e.js` walks every public route at 390 / 768 / 1280 plus a
dark-mode pass and the seeded test/results flows, asserting: no page-level horizontal
overflow, nothing crossing the viewport edge, no clipped nowrap text, and every control
≥44px. Screenshots and the measured report land in the run artifacts.
