# Taste pass — implementation guide for subagents

Read this fully before editing. You own a specific file list; do not edit files outside it.
The design spec is `docs/superpowers/specs/2026-09-24-frontend-taste-pass-design.md`.

## Non-negotiables

- Do NOT rename Svelte classes, ids, data attributes, component props, events, telemetry
  `track()` names, or locale keys. E2E suites pin many of them.
- Do NOT change logic, data flow, API calls, or i18n lookups. Visual pass only.
- Do NOT add dependencies, fonts, or locale keys. Icons come from `$lib/client/Icon.svelte`.
- Do NOT edit `src/lib/styles/globals.css`, `src/lib/client/Icon.svelte`, locale JSON files,
  `src/routes/+layout.svelte`, `src/lib/client/pages/HomePage.svelte`, or anything under
  `tests/`. If you need a token or icon that does not exist, note it in your final summary.
- Keep diffs minimal and in the file's existing style (tabs, single quotes, semicolons).

## Icon component (read-only for you)

```svelte
import Icon from '$lib/client/Icon.svelte';
<Icon name="clock" />            <!-- 20px default, aria-hidden -->
<Icon name="clock" size={18} />
<Icon name="clock" label="History" />
```

Available names: home, bookmark, plus, clock, menu, close, user, login, logout, sun, moon, globe,
gauge, search, trash, star, chart, check, x, chevron-down, chevron-up, chevron-right, chevron-left,
arrow-left, arrow-right, alert, info, refresh, print, share, download, edit, filter, external, book,
shield, zap, target, flag, note, thumb-up, thumb-down, sparkle, leaf, flame, gem, crown, mail,
sliders, list, lock, code.

If an exact glyph is missing, pick the closest semantic icon (never invent or hand-roll SVG paths).

## Rules (apply to every file you own)

1. **No emoji or text glyphs as icons.** Replace with `<Icon>`. This covers e.g. ⚡ 📝 🗑 🔖 👍 👎 ★ ☆
   ▸ ▾ ✓ ✗ ⚑ → ← × ⌂ ＋ and flag emoji. If a glyph is decorative-only and no icon fits, delete it.
   Keep emoji that are part of real copy only if removing them breaks meaning; otherwise delete.
2. **No decoration-only animation.** Remove: glow/pulse box-shadows, `ai-glow`, purple shimmer
   gradients, `status-pulse` style glows, floating sparkle elements. A subtle skeleton is allowed
   (`ai-shimmer` class is now neutral; use it or a plain `var(--surface-muted)` block).
3. **Radii: one scale.** control 10px, surface 12px, overlay 16px, pill 999px.
   In scoped CSS use `var(--radius-control)`, `var(--radius-surface)`, `var(--radius-overlay)`.
   In markup prefer existing `rounded-3` (12px surface) or `rounded-full`. Replace one-off values
   (8/11/13/14/15/17/18/20px) with the nearest token.
4. **Color: one accent (indigo) + semantic states.**
   - Replace hardcoded brand copies `rgba(79, 70, 229, …)` with
     `color-mix(in srgb, var(--color-brand-600) X%, transparent)` where X is the opacity.
   - Replace hardcoded success/warning/error hex with `var(--ok)`, `var(--warn)`, `var(--danger)`
     for text/icons, or Tailwind `emerald-*`, `amber-*`, `red-*` classes for fills.
   - Replace pure `#fff` / `#ffffff` on brand fills with `var(--on-brand)`; replace pure `#000`
     with `var(--text)` or a Tailwind zinc/slate value.
   - Never place white/near-white text on `var(--brand-text)` (it is light indigo in dark mode).
     Use `var(--color-brand-600)` as the fill for white text, in both themes.
5. **Contrast (WCAG AA):** check every text/background pair you touch in light AND dark.
   Muted text stays `var(--text-muted)`; small labels must stay readable (do not go below 0.75rem
   for interactive labels, 0.7rem absolute floor for non-essential metadata).
6. **Buttons/CTAs:** keep min 44px touch targets, visible `:hover` and `:focus-visible` states, and
   a press feedback (`transform: translateY(1px)` or scale 0.98). No new CTA labels. If a page has
   two CTAs with the same destination/intent, keep one visible primary and demote the other to a
   quiet link (do not delete functionality).
7. **States:** keep existing loading/empty/error logic. You may restyle them (skeleton blocks,
   composed empty states, inline error text) but do not remove them. `status === 'error'` branches
   must render something.
8. **A11y:** inputs without labels get `<label for>` or `aria-label`; icon-only buttons need an
   `aria-label`; decorative icons are `aria-hidden` automatically via `<Icon>`; interactive
   elements get focus-visible styling consistent with the app.
9. **No layout changes that break mobile.** Preserve responsive behavior; prefer CSS Grid over
   flex math.

## Verify

Run `npm run lint` after your edits (must be clean). Do not run the e2e suites; the parent agent
runs them. In your final message report: files changed, rules applied, anything you could not do,
and max 300 words.
