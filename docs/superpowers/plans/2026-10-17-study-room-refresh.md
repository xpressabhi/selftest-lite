# Study Room Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand Selftest-lite from the current indigo/SaaS look to the "Study Room" calm, focused, editorial-typographic system (teal accent, warm paper/ink grounds, system font stack, generous spacing) across all pages, improving UI/UX and unifying the experience.

**Architecture:** Evolve the existing token model in `src/lib/styles/globals.css` (values change, not the system) so all components and pages inherit the new look automatically. Phase 1 swaps token values; Phase 2 tunes type; Phase 3 verifies component primitives; Phase 4 refines page-level composition on the highest-traffic routes. Each phase is gated by lint + vitest + the design-consistency and taste-pass Playwright suites.

**Tech Stack:** SvelteKit 3 + Vite 8 + Tailwind CSS 4; tokens in `globals.css` `@theme`/`:root`/`:root.dark`; verification via `npm run lint`, `npm run test`, `npm run test:e2e`.

**Spec:** `docs/superpowers/specs/2026-10-17-study-room-design.md`

## Global Constraints

- Accent hue: indigo → deep teal. Light `teal-600 #0d9488`/`teal-700 #0f766e`; dark `teal-300 #5eead4`/`teal-400 #2dd4bf`. No gradients, no shadows at rest.
- Ground: light `#f6f3ec` (paper), dark `#0e1116` (ink). Ink: light `#1a1a1a`, dark `#e8e4da`. Muted only for captions.
- Single font family = system UI stack (no web fonts added). Devanagari line-height ≥ 1.6.
- All UI strings in both English and Hindi (no hardcoded text).
- Low-end Android + slow internet baseline: no new heavy deps, lazy images, PWA offline unchanged.
- Token model (names) unchanged; only values. `palette.test.js` must stay green (no new Tailwind palette families introduced).

## Review Focus

1. Dark-mode contrast on teal accent and paper/ink grounds — `taste-pass.e2e.js` measures filled-button contrast in both themes; a teal swap that drops below 4.5:1 on either theme would ship invisible. (Pinned in Task 1/2 verification.)
2. Devanagari readability at the new body line-height (1.55) and tighter display tracking (-0.02em) — Hindi copy can clip or feel cramped. (Pinned in Task 5.)
3. `--brand-rgb` triplet consistency — focus rings, chips, and outlines all derive from it; a stale triplet (e.g., left as indigo) makes rings mismatch the new accent. (Pinned in Task 2.)
4. `color-mix()`/`rgba()` fallback ordering in `--chip` and `--focus-ring` — must keep the rgba triplet line first. (Pinned in Task 2.)
5. Section rhythm change (120–160px) on mobile — large gaps can push key content below the fold on 320px phones and break `home-layout.e2e.js`. (Pinned in Task 9.)

---

### Task 1: Swap brand color scale to teal

**Files:**
- Modify: `src/lib/styles/globals.css:48-56` (first `@theme` block, `--color-brand-*`)

**Interfaces:**
- Produces: teal values for `--color-brand-50/100/300/500/600/700`, consumed by every `brand-*` utility and `color-mix(in srgb, var(--color-brand-600) …)` site-wide.

- [ ] **Step 1: Edit the brand scale** in `src/lib/styles/globals.css` first `@theme` block:
  - `--color-brand-50: #f0fdfa;`
  - `--color-brand-100: #ccfbf1;`
  - `--color-brand-300: #5eead4;`
  - `--color-brand-500: #14b8a6;`
  - `--color-brand-600: #0d9488;`
  - `--color-brand-700: #0f766e;`
  - Update the adjacent comment from "stays indigo" to "stays teal (the one accent)".
- [ ] **Step 2: Run lint** — `npm run lint` → expected: no errors.
- [ ] **Step 3: Run unit tests** — `npm run test` → expected: all pass (palette.test.js unaffected; no new Tailwind family used).
- [ ] **Step 4: Commit** — `git commit -m "feat(design): swap brand scale indigo->teal"`

---

### Task 2: Swap light-mode surface/ink/line tokens and brand triplets

**Files:**
- Modify: `src/lib/styles/globals.css` `:root` block (`--surface`, `--surface-muted`, `--text`, `--text-muted`, `--line`, `--brand-rgb`, `--brand-text`, `--brand-text-rgb`, `--on-brand`)

**Interfaces:**
- Consumes: teal brand scale from Task 1.
- Produces: light-mode paper/ink/teal token values used by all components.

- [ ] **Step 1: Edit `:root`** values:
  - `--surface: #ffffff;` → keep (cards lift off paper)
  - `--surface-muted: #f8fafc;` → `#ece7dc;`
  - `--text: #111827;` → `#1a1a1a;`
  - `--text-muted: #64748b;` → `#5a5a55;`
  - `--line: #e2e8f0;` → `#e3ddd0;`
  - `--brand-rgb: 79, 70, 229;` → `13, 148, 136;`
  - `--brand-text: #4f46e5;` → `#0d9488;`
  - `--brand-text-rgb: 79, 70, 229;` → `13, 148, 136;`
  - `--on-brand: #f8fafc;` keep.
  - `--focus-ring` needs no edit (derives from `--brand-rgb`).
- [ ] **Step 2: Verify fallback ordering** — confirm `--chip` active state still has the `rgba(var(--brand-rgb), …)` lines before the `color-mix()` lines; `--focus-ring` remains `rgba()` form. No change expected; check only.
- [ ] **Step 3: Run lint + tests** — `npm run lint && npm run test` → expected: pass.
- [ ] **Step 4: Commit** — `git commit -m "feat(design): swap light-mode tokens to Study Room paper/ink/teal"`

---

### Task 3: Swap dark-mode tokens

**Files:**
- Modify: `src/lib/styles/globals.css` `:root.dark` block

**Interfaces:**
- Produces: dark-mode ink/paper/teal values.

- [ ] **Step 1: Edit `:root.dark`**:
  - `--surface: #111827;` → `#161b22;`
  - `--surface-muted: #0f172a;` → `#0e1116;` (ground becomes deep ink)
  - `--text: #f8fafc;` → `#e8e4da;`
  - `--text-muted: #94a3b8;` → `#9a9a92;`
  - `--line: #334155;` → `#2a3038;`
  - `--brand-text: #a5b4fc;` → `#5eead4;`
  - `--brand-text-rgb: 165, 180, 252;` → `94, 234, 212;`
  - Semantic `--ok/--warn/--danger` and their rgb keep current dark values.
- [ ] **Step 2: Run lint + tests** — `npm run lint && npm run test` → pass.
- [ ] **Step 3: Commit** — `git commit -m "feat(design): swap dark-mode tokens to Study Room"`

---

### Task 4: Ground the page on paper (html background)

**Files:**
- Modify: `src/lib/styles/globals.css` `html { background: var(--surface-muted); }` (already token-driven)

**Interfaces:**
- Consumes: `--surface-muted` from Tasks 2/3.

- [ ] **Step 1: No code change required** — confirm `html` background resolves to the new paper/ink ground in both themes. Verify by running the dev server and toggling theme; screenshot both.
- [ ] **Step 2: Run lint** — `npm run lint`.
- [ ] **Step 3: Commit (only if a change was made)** — otherwise skip.

---

### Task 5: Typography tuning (tracking, line-height, weights)

**Files:**
- Modify: `src/lib/styles/globals.css` `.text-page`, `.text-section`, body font-family block, `.measure`

**Interfaces:**
- Produces: tightened display tracking, comfortable body line-height, 68ch measure (already), Devanagari line-height ≥ 1.6.

- [ ] **Step 1: Edit type rules**:
  - `.text-page`: `letter-spacing: -0.01em;` → `-0.02em;`, `line-height: 1.2;` → `1.15;`.
  - `.text-section`: `line-height: 1.3;` → `1.25;`.
  - Body `font-family` block: add `line-height: 1.55;` to `body` (or global). Ensure Devanagari: add `:lang(hi) { line-height: 1.6; }` override.
  - `.text-display` (if present) tracking `-0.02em` (check globals; add if missing).
- [ ] **Step 2: Run lint + tests** — `npm run lint && npm run test`.
- [ ] **Step 3: Run e2e design gates** — `npm run test:e2e -- tests/e2e/design-consistency.e2e.js tests/e2e/taste-pass.e2e.js` → expected: pass (headline line-count assertions still hold).
- [ ] **Step 4: Commit** — `git commit -m "feat(design): tune typography for Study Room"`

---

### Task 6: Update design-system docs to reflect teal accent

**Files:**
- Modify: `docs/design-system.md` (accent references: indigo → teal; brand-text; any "indigo" wording)

**Interfaces:**
- Documentation only; no runtime effect.

- [ ] **Step 1: Replace** "One accent (indigo)" → "One accent (teal, deep)" and any `brand-600` indigo references with teal wording. Keep token names.
- [ ] **Step 2: Run lint** (docs not linted, but verify no broken links).
- [ ] **Step 3: Commit** — `git commit -m "docs: update design system accent indigo->teal"`

---

### Task 7: Component primitive verification pass

**Files:**
- Inspect (no edit unless failing): `src/lib/styles/globals.css` `.btn*`, `.panel`, `.chip`, `.form-control`

**Interfaces:**
- Consumes: teal tokens from Tasks 1–3.

- [ ] **Step 1: Run the full e2e suite** — `npm run test:e2e` → expected: 255/255 (or current baseline) pass. Primitives are token-driven; accent swap should be automatic.
- [ ] **Step 2: If any failure**, fix the specific primitive (most likely `btn-outline-primary` dark variant using `brand-100` which is now teal-100 — verify contrast). Document the fix in the commit.
- [ ] **Step 3: Commit (if changes)** — `git commit -m "fix(design): adjust primitives for teal accent"`

---

### Task 8: Home page composition refinement

**Files:**
- Modify: `src/lib/client/pages/HomePage.svelte` (section rhythm, ordering)
- Modify: `src/lib/client/pages/HomePage.svelte` `<style>` block (spacing)

**Interfaces:**
- Consumes: tokens from Tasks 1–3; type scale from Task 5.
- Produces: calmer home with planner as single hero; streaks/popular-exams/pitch below the fold.

- [ ] **Step 1: Review current home markup** and identify the planner block, streak card, QuickStart, popular-exams, pitch, manual section.
- [ ] **Step 2: Adjust vertical rhythm** — increase section gaps to 24–32px between major blocks; remove any ad-hoc `mb-4` clustering that makes the stack feel tight. Keep resume alert above Daily 5 (pinned by CHG-0030).
- [ ] **Step 3: Ensure single focal point** — planner composer remains the dominant element on first screen; do not add competing large type above it.
- [ ] **Step 4: Run lint + check** — `npm run lint && npm run check`.
- [ ] **Step 5: Run home layout e2e** — `npm run test:e2e -- tests/e2e/home-layout.e2e.js` → pass (kicker one line, planner owns first screen).
- [ ] **Step 6: Commit** — `git commit -m "feat(design): calm home composition around planner hero"`

---

### Task 9: Results page composition refinement

**Files:**
- Modify: `src/routes/results/+page.svelte`

**Interfaces:**
- Consumes: tokens/type from earlier tasks.
- Produces: hero score → review list; calmer spacing.

- [ ] **Step 1: Review results page** for score hero, comparison pill, review list, actions.
- [ ] **Step 2: Increase section rhythm** to 24–32px; reduce card nesting where tone steps suffice.
- [ ] **Step 3: Run lint + check**.
- [ ] **Step 4: Run results e2e** — `npm run test:e2e -- tests/e2e/results-hero.e2e.js` → pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(design): calm results composition"`

---

### Task 10: Practice & exams pages composition refinement

**Files:**
- Modify: `src/routes/practice/+page.svelte`
- Modify: `src/routes/exams/+page.svelte` (if present) or the exams hub component
- Modify: `src/routes/practice/[examId]/+page.svelte` (if present)

**Interfaces:**
- Consumes: tokens/type from earlier tasks.
- Produces: editorial headers (large title + one subtitle) then content.

- [ ] **Step 1: Add consistent page header** (`.text-page` title + one `.text-meta` subtitle) to practice hub and exams hub.
- [ ] **Step 2: Increase section rhythm**; collapse dense filter rows behind the existing mobile toggle.
- [ ] **Step 3: Run lint + check**.
- [ ] **Step 4: Run practice/exams e2e** — `npm run test:e2e -- tests/e2e/practice-hub.e2e.js tests/e2e/public-pages.e2e.js` → pass.
- [ ] **Step 5: Commit** — `git commit -m "feat(design): editorial headers on practice and exams"`

---

### Task 11: Full verification pass

**Files:**
- No edits; verification only.

- [ ] **Step 1: Run lint** — `npm run lint` → pass.
- [ ] **Step 2: Run unit tests** — `npm run test` → pass.
- [ ] **Step 3: Run full e2e** — `npm run test:e2e` → 255/255 (or current baseline) pass.
- [ ] **Step 4: Run build** — `npm run check` → pass.
- [ ] **Step 5: If any failure**, open a follow-up fix commit per failing suite; do not skip tests.
- [ ] **Step 6: Commit verification (if fixes)** — `git commit -m "fix(design): resolve verification failures"`

---

### Task 12: SEO/visual verification (optional, if routes touched)

**Files:**
- No edits unless needed.

- [ ] **Step 1: Run** `npm run verify:vercel` → pass.
- [ ] **Step 2: Commit (if changes)**.

---

## Self-Review Notes

- **Spec coverage:** §1 brand/color → Tasks 1–3; §2 typography → Task 5; §3 spacing → Tasks 8–10; §4 components → Task 7; §5 pages → Tasks 8–10; §6 imagery → deferred (no photos today; UI fragments/drawn remain as-is, no new asset work in this plan); §7 motion → unchanged (already compliant); §8 dark mode → Task 3; §9 i18n → preserved (no string changes); §10 performance → preserved (no new deps/fonts); §11 migration → Tasks 1–4; §12 metrics → Task 11.
- **Imagery (§6)** intentionally deferred: the spec's imagery strategy (UI fragments, drawn, archival) requires asset work beyond token swaps; this plan covers the visual system. A follow-up plan should handle imagery.
- **Type consistency:** token names unchanged; only values. `--brand-rgb`, `--brand-text`, `--brand-text-rgb` all move together (Task 2/3). Focus ring derives from `--brand-rgb`.
- **Review Focus:** all five lines pinned to tasks (see task verification steps).