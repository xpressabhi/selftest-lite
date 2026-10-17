# Design Spec: "Study Room" refresh (Selftest-lite)

**Date:** 2026-10-17
**Status:** Approved
**Approach:** Approach 1 — "Study Room" (calm, focused, editorial-typographic)
**Scope:** Full visual refresh across all pages; free to change tokens, type, layout, components.

## 1. Brand & color

**Concept:** "A quiet desk with one lamp." The app is a study companion, not a SaaS dashboard — paper, ink, and a single teal lamp-light that marks the one thing to do next.

- **Accent: deep teal** (replaces indigo). Light `teal-700 #0f766e`; dark `teal-400 #2dd4bf`. Used on the primary action and **one** other thing (active nav item, or the current question). Nothing else.
- **Ground (page):** warm paper. Light `#f6f3ec` (not pure white — less glare for reading); dark `#0e1116` (not pure black).
- **Ink (body text):** light `#1a1a1a`; dark `#e8e4da`. Full contrast. **No grey body text** — muted is only for captions/secondary.
- **Muted (captions only):** light `#5a5a55`; dark `#9a9a92`.
- **Surfaces (tone steps):** light surface `#ffffff` (cards lift slightly off paper), surface-muted `#ece7dc`; dark surface `#161b22`, surface-muted `#1f252e`.
- **Line (borders):** light `#e3ddd0`; dark `#2a3038`. Used sparingly — prefer spacing/tone steps.
- **Semantic:** ok emerald / warn amber / danger red, kept as flat fills (no tinted pills beyond the existing 8% rule).
- **No gradients, no shadows at rest** (elevation via tone steps). Overlays keep `--shadow-2`.
- **Tokens:** expressed as value changes to existing tokens (`--color-brand-*`, `--surface*`, `--text*`, `--line`), plus **teal sRGB overrides** added to `globals.css` `@theme` (mirroring the slate/red/amber/emerald pattern) so `palette.test.js` stays green.

## 2. Typography

- **Single family: the system UI stack** (no web fonts added). Reasons: performance on low-end Android/slow internet, and Devanagari coverage via OS fallbacks. Hierarchy comes from size + weight, not a second face. (A display serif can be added later via fontsource if desired — noted as optional.)
- **Scale** reuses existing classes: `.text-display` (results hero), `.text-page` (h1), `.text-section` (h2), `.text-meta`/`.small`, `.text-micro`.
- **Adjustments:** tighter tracking on display (`-0.02em`), body line-height `1.55`, prose measure `68ch`. Devanagari line-height ≥ `1.6`.
- **Weights:** 400 body, 500 UI labels, 600 section heads, 700 page titles/display.

## 3. Spacing & layout

- Keep the 4px scale and `.app-container` shell (1280 max, gutters 16/24/32).
- **Section rhythm: 120–160px on desktop** (more generous than today's 16/24/32) — rest via space, not decoration.
- Text blocks share 2–3 left edges per page.
- Neighbouring sections must differ in composition (no repeated card grids).
- Page-level inner caps stay removed (per existing design system).

## 4. Component language

- **`.panel`** stays the one card recipe, but used less — prefer tone-step sections over card grids.
- **Buttons:** flat, one fill (teal primary → white ink), square-cornered (`--radius-control` 10px) for controls. Secondary = surface + border. Ghost = text only. No soft 9–16px radii.
- **Chips, focus ring, Icon.svelte, nav (wordmark + 3–5 links + one action), footer-as-close:** unchanged primitives.
- **No glass, no blur panels, no floating pill nav.**

## 5. Page-level direction

- **Home:** the planner composer is the single hero. Streaks, popular-exams, pitch move below the fold in a calmer rhythm. Resume alert stays above Daily 5 (already fixed).
- **Test (immersive):** keep focused 860px column; cleaner question card; teal for selected answer.
- **Results:** hero score → review list; calmer.
- **Practice / exam pages:** editorial headers (large title + one-line subtitle), then content.
- **Exams hub:** cleaner filters.
- **All pages:** consistent page header (title + one subtitle), then content. One accent, one CTA per screen.

## 6. Imagery

- No brand photos today. Strategy: **cropped product UI fragments** (in product colors), **drawn illustrations** (simple, teal/paper palette), and **archival Indian imagery where honest** (exam papers, maps, engravings — credited, never presented as the client's own).
- Minimum 4 real pictures per page where applicable; UI fragments count for app pages.
- One moving picture where honest (e.g., subtle motion on the generation trace).

## 7. Motion

- Reduced-motion respected (already). Subtle: section entrance fade/slide, press feedback on buttons. Transform/opacity only.
- The planner composer's sanctioned multicolour ring stays as the single always-on accent.
- No heavy animation, no colour-by-chapter, no pinned stories (keeps low-end perf).

## 8. Dark mode

- Full parity. Teal flips (teal-700 light / teal-400 dark). Paper↔ink flip. All tokens flip. `taste-pass.e2e.js` contrast checks must still pass.

## 9. i18n

- All strings in both locales (no hardcoded text). Devanagari line-height handled in §2.

## 10. Performance

- No web fonts, no new heavy deps. Flat color + tone steps are cheap. Lazy images. PWA offline unchanged.

## 11. Migration strategy (phased, each verified)

1. **Token values** (accent, ground, surface, line) + teal sRGB palette overrides in `globals.css`.
2. **Typography adjustments** (tracking, line-height, weights) — CSS only.
3. **Component-level** (buttons, cards) — token-driven, mostly already aligned.
4. **Page-level layout** (home, results, practice, exams) — larger, per-route.

Each phase: `npm run lint` + `npm run test` + `npm run test:e2e` (design-consistency + taste-pass) green.

## 12. Success metrics

- `design-consistency.e2e.js` passes all routes × 5 breakpoints × dark mode.
- `taste-pass.e2e.js` passes.
- No Lighthouse/perf regression (no new fonts/deps).
- i18n parity tests pass.

## Decisions & assumptions

- Accent changed from indigo to teal (user approved Approach 1).
- Dark mode retained in both themes.
- No brand photos exist; imagery strategy uses UI fragments + drawn + archival.
- System font stack retained (no web fonts) for performance and Devanagari coverage.
- Existing design-system token model retained; only values change (keeps tests green).