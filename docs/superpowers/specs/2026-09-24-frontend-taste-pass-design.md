# Frontend Taste Pass — Shell and Pages (Design)

Date: 2026-09-24
Status: approved (scope: whole app shell + pages)
Scope: design-quality pass over the app shell and all user-facing pages. No route, API, schema,
dependency, telemetry-event, or copy-key changes.

## 1. Design read

Reading this as: education product for Indian exam aspirants (mobile-first, low-end Android and
data-saver baseline), with a trust-first restrained language, leaning toward targeted evolution of
the existing Tailwind v4 + CSS-token system. Indigo stays the single brand accent (skill Section
4.2 override: an existing brand keeps its color); Inter stays (existing brand type).

Dials: `DESIGN_VARIANCE: 5`, `MOTION_INTENSITY: 3`, `VISUAL_DENSITY: 5` (trust-first band). Motion
must stay minimal and reduced-motion safe; data-saver must not pay for decoration.

## 2. Audit summary (what the pass fixes)

1. **Icons**: the shell and pages use text glyphs and emoji as icons (`⌁ ◎ ☾ ◷ ▣ ☰ ⌂ ☆ ＋ ⚡ 🎯 📝 🗑
   🔖 👍 👎 ★ ▸ ▾ ✓` etc.). Replace with one local stroke-icon family (`Icon.svelte`): 24px grid,
   1.75 stroke, round caps. (AGENTS.md: local SVG components for icons; one family.)
2. **AI-tell decoration**: `glow-pulse` / `.ai-glow`, purple `ai-shimmer`, decorative radial/linear
   gradients (results hero, blog featured card, CtaBanner), `#fff` on `--brand-text` (fails contrast
   in dark), pure `#fff`/`#000` literals, hardcoded brand `rgba(79, 70, 229, …)` copies.
3. **Materiality**: radius zoo (8/10/11/12/13/14/15/16/17/18/20/999) replaced by a documented scale:
   control 10px, surface 12px (`.rounded-3` already is), overlay 16px, pill 999px; plus a documented
   z-index scale (never renumbered page values unless locally broken).
4. **States**: generic spinner arcs and empty/error gaps; `status === 'error'` unhandled in planner
   surfaces; loading placeholders replaced with skeleton shapes where the layout is known.
5. **Accessibility**: missing labels on profile subject inputs, ≤ 0.6rem text in dropdowns, weak
   `x` clear buttons without accessible names, tabs without `aria-controls`, duplicate accessible
   names on bookmark remove buttons, `confirm()` vs in-app confirm inconsistency.
6. **Copy**: em dashes in chrome/prose that the pass touches (locale UI strings, footer, hero
   compare, exam placeholders), duplicate CTA intents (`Practice more` twice on results), the
   awkward bookmarks empty-state sentence.
7. **Layout**: three equal card grids stacked (about, practice hub), long plain rows (contact
   socials, practice exams), duplicated CSS blocks in BlogPostPage.

## 3. Changes

### 3.1 Foundation

- `src/lib/styles/globals.css`
  - Radius tokens in `@theme`: `--radius-control: 10px`, `--radius-surface: 12px`,
    `--radius-overlay: 16px`. `.btn`, `.form-control`, `.form-select`, chip controls use
    `rounded-control`; `.alert`, `.list-group`, `.rounded-3` use `rounded-surface`.
  - State tokens (`--ok`, `--warn`, `--danger`, `--on-brand`) with dark-mode values, so components
    stop hardcoding emerald/amber/red hex and `#fff`.
  - Remove `--animate-glow-pulse`, `@keyframes glow-pulse`, `.ai-glow`.
  - `.ai-shimmer` becomes a neutral token skeleton (no purple), still disabled under reduced motion.
  - `.icon` sizing helper so inline SVGs align with text.
- `src/lib/client/Icon.svelte` (new): one family, `name`/`size`/`strokeWidth`/`label` props.

### 3.2 Shell (`src/routes/+layout.svelte`)

- All glyph icons → `Icon` (data saver, language, theme, history, sign-in, menu, home, bookmarks,
  create, close, user, sign-out).
- Replace the `scroll` listener that hides the install hint with an IntersectionObserver sentinel
  (skill 5.D bans `window.addEventListener('scroll')`).
- Footer em dash → middle dot-free separator; offline banner, menus, modal, user menu use the
  radius/z tokens.
- Keep: 58px header, single-line desktop nav, 44px targets, skip link, focus trap, safe areas,
  immersive `/test` mode, all telemetry events and route labels.

### 3.3 Home + planner surfaces

- `HomePage.svelte`: SVG bolt for Daily 5, target icon for the tailored chip, slightly stronger
  kicker within the pinned home-layout contract (one line, panel top ≤ 160).
- `PreviewCard.svelte`: emoji/flag chips → `Icon`/text labels; remove `ai-shimmer` decoration and
  `status-pulse` glow; unify radii; hardcoded hex → tokens; keep pinned classes (`.preview-card`,
  `.preview-topic-label`, `.spec-tile`, `.generate-btn`, `.tier-*`).
- `ChatThread`, `PlannerComposer`, `GenerationTrace`, `QuickStart`, `TopicBrowser`, `ExamBrowser`:
  same rules; keep pinned classes (`.welcome-*`, `.search-strip`, `.strip-chip`, `.search-dropdown`,
  `.dropdown-*`, `.composer-search`).

### 3.4 Content pages

- About: break the three stacked 3-up grids into varied families; radius/hex cleanup; heading level
  fix; dark-mode contrast on the brand badge.
- FAQ: hero compressed to a single statement; duplicated nav label fixed; CtaBanner copy key fixed.
- Blog index/post: remove decorative gradient card, fix dark-mode badge contrast, remove duplicated
  CSS block, next-step copy points at writing not the FAQ.
- Privacy/Terms: one shared pro-page rhythm, consistent title scale and widths, no orphan CtaBanner.
- Contact: two consecutive list sections → grouped blocks; hardcoded brand rgba → tokens.
- Practice hub / exam page: exam rows get hover/focus affordance and a non-card-grouped family,
  localized stream names, em dash placeholder → plain value.

### 3.5 Product pages

- Results: remove decorative hero gradients/sparks and glow, emoji → icons, single "Practice more"
  intent, em dash in generated paper title → colon, radius/token cleanup. Pinned `.result-hero-card`,
  `.score-ring*`, `.hero-*`, `.auto-explain-row`, `.result-footer` selectors stay.
- Test: emoji/glyph icons → `Icon`, radius and z-index cleanup, keep pinned test selectors.
- History / bookmarks / profile: emoji → icons, in-app confirm consistency, inline `×` clear gets a
  name, profile subject inputs get labels, empty-state copy fix.
- Error page: title reflects the status, one primary action.

### 3.5a History & Bookmarks follow-up (deeper redesign, same day)

- History: four stacked stat boxes → one hairline-separated stat strip (2×2 mobile, 4-up desktop);
  flat rows → date groups (Today / Yesterday / Earlier, new en+hi keys) with relative timestamps
  (full date in the row `title`); score/unsubmitted badges → quiet state chips; loud red Clear
  button → quiet destructive link; search gets an icon field and a proper label; composed empty
  state. FuseButton delete stays, now icon-only with the label in `aria-label`.
- Bookmarks: loud full-text "Remove bookmark" buttons on every row → 44px icon-only controls with
  distinct `aria-label`s; exam rows are whole-row links (Select button retired, same destination);
  section cards with counts and hairline rows; saved questions become cards with a tinted answer
  inset and a 2-column desktop grid; `h-100` stretch removed so empty sections stay compact;
  stream names localized.
- Contracts added to `tests/e2e/taste-pass.e2e.js`: grouped history rows + icon-only 44px delete;
  three bookmark sections, four labeled remove controls, whole-row exam link.

### 3.6 Components

- `Toast`: type-differentiated styling, token colors, close affordance.
- `ProfileWizard`, `ReviewSheet`, `TestSearchDropdown`, `HoldButton`, `FuseButton`, `SquishSwitch`,
  `GoogleSignInButton`: token/radius/contrast fixes and loading states per audit.

## 4. Failure modes (written before the code)

1. An icon name is missing or misspelled and a page renders an empty box.
2. Replacing glyphs changes layout (nav becomes two lines, tap targets shrink below 44px).
3. A pinned E2E selector is renamed and the home/planner/results suites fail for the wrong reason.
4. Dark mode regresses: text loses contrast, or a fixed badge goes white-on-light.
5. Reduced motion / data saver still animates expensive decoration.
6. i18n: new visible string added only in English, or a Hindi key removed.
7. Telemetry: `track()` call or event name changed by accident.
8. Scroll-hint replacement keeps listening to `scroll` and reintroduces the banned pattern.

## 5. Testing

New `tests/e2e/taste-pass.e2e.js` (contract, written with the pass):

1. Shell renders SVG icons (no glyph/emoji text nodes) and ≥ 44px targets for header actions and
   bottom-nav items.
2. Home, results shell pages render zero console errors after the pass; existing suites stay green.
3. No emoji characters in rendered chrome on `/`, `/practice`, `/about`.
4. Primary button text/background contrast ≥ 4.5:1 in light and dark on `/`.
5. `prefers-reduced-motion` still disables animations.

Existing suites (`home-layout`, `planner-calm`, `welcome-gallery`, `results-hero`, `smoke`, `seo`)
are the regression contract and must stay green. Em-dash copy changes update the assertions that
pin them (`resultsCompareFirst`).

Verification: `npm run lint`, `npm run test`, `npm run check`, `npm run test:e2e`,
`npm run verify:vercel`.

## 6. Boundaries

- Always: en + hi together, visible copy stays visible, single H1 per page, 44px targets, safe
  areas, PWA/AdSense untouched, one accent (indigo) on the whole app.
- Ask first: route/SEO structure changes (none planned).
- Never: rename telemetry events, remove locale keys, break pinned E2E selectors without updating
  the suite in the same change.

## 7. Out of scope

- `/admin` visual redesign beyond generic fixes (English-only internal tool).
- Rewriting blog/legal prose beyond the flagged em dashes and the two awkward UI strings.
- New dependencies (icon set is local, no font change).
