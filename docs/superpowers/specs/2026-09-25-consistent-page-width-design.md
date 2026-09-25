# Consistent Page Width — One Column Header-to-Footer (Design)

Date: 2026-09-25
Status: approved
Scope: make the header, every page's container, and the footer share one max width (1280px) and
one gutter scale; remove page-level inner width caps; keep long-form prose readable and the
immersive test screen focused. No API, schema, route, or dependency changes.

## 1. Objective

Today every surface picks its own width, so the content edges move as you navigate:

| Surface | Current width | Gutters / padding |
| --- | --- | --- |
| Header `.header-inner` | 1320px | 12 / 20 / 28px |
| Page `.container` | 1280px | 16 / 24 / 32px |
| Footer `.footer-inner` | 920px | 28px |
| Home `.home-wrap` | 720px | — |
| Profile `.profile-wrap` | 640px | — |
| Results content blocks | 860px | — |
| Admin `.admin-wrap` | 1120px | — |
| About / Blog index / Practice hub | 1024px | — |
| Contact / Exam page | 896px | — |
| FAQ | 832px | — |
| Blog post / Privacy / Terms | 736px | — |
| Exam paper form | 720px | — |
| Error page message | 560px, centered | — |

The goal: one column sitewide. At desktop widths, header, page content, and footer share the same
left and right edges on every page; at phone widths they share the same gutters. Nothing shifts
horizontally when navigating page to page.

### Success criteria

- At 1440px and 1280px viewports, `.header-inner`, the page `.container`, and `.footer-inner` have
  identical `x` and `right` (within 1px) on every page in the E2E set.
- The page container's edges are identical across pages.
- At 390px, header, container and footer share the same 16px gutter; no horizontal overflow
  (`document.scrollWidth <= window.innerWidth`).
- Long-form prose (blog post body, legal lead, FAQ answers, About copy) stays around a 68ch
  measure so lines do not run across the full 1280px.
- The immersive `/test` question area stays an 860px centered reading column — it has no header or
  footer, so it is not part of the shell alignment contract.
- `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e` pass; the standard
  `test-results/e2e-artifact.json` carries the new spec's evidence.

## 2. Tech stack

SvelteKit 2 / Svelte 5 with the existing Tailwind component layer and scoped CSS. Two CSS custom
properties carry the layout contract; no new dependencies and no component API changes.

## 3. Approach

1. **CSS tokens + aligned shell + dropped page caps (chosen).** One source of truth in
   `globals.css`; header, `.container`, and footer consume it; page-level `max-width` leftovers are
   removed. Small diff, easy to verify, no page markup changes.
2. A shared `PageContainer.svelte` component wrapping every page. Structurally stronger but a large
   refactor of ~20 pages for no visual gain.
3. Hardcoding 1280px separately in layout and pages. Rejected: the drift returns with the next new
   page.

## 4. Changes

### 4.1 Single source of truth — `src/lib/styles/globals.css`

```css
:root {
  --page-max: 80rem; /* 1280px */
  --page-gutter: 1rem;
}
@media (min-width: 640px) {
  :root { --page-gutter: 1.5rem; }
}
@media (min-width: 1024px) {
  :root { --page-gutter: 2rem; }
}
```

- `.container` becomes `width: 100%; max-width: var(--page-max); margin-inline: auto;
  padding-inline: var(--page-gutter);` (replaces `@apply ... max-w-7xl px-4 sm:px-6 lg:px-8`).
- Add a `.measure` utility: `max-width: 68ch;` for prose blocks.

### 4.2 Shell — `src/routes/+layout.svelte`

- `.header-inner`: `max-width: var(--page-max)`, `padding: 6px var(--page-gutter)`. Delete the
  1320px value and the 768px padding override.
- `.footer-inner`: `max-width: var(--page-max)`, `padding: 28px var(--page-gutter)`. Delete the
  920px value.
- `.mobile-menu`: `padding: 8px var(--page-gutter) 14px` so the open menu aligns with the header.

### 4.3 Page-level caps removed

Delete the page-column `max-width` (and now-redundant `margin: 0 auto`) from:

- `HomePage.svelte` — `.home-wrap` (720px)
- `AboutPage.svelte` — `.about-wrap` (64rem)
- `BlogIndexPage.svelte` — `.blog-wrap` (64rem)
- `BlogPostPage.svelte` — `.post-wrap` (46rem)
- `ContactPage.svelte` — `.contact-wrap` (56rem)
- `ExamPage.svelte` — `.practice-wrap` (56rem)
- `FaqPage.svelte` — `.faq-wrap` (52rem)
- `PracticeHubPage.svelte` — `.practice-hub` (64rem)
- `PrivacyPage.svelte` / `TermsPage.svelte` — `.legal-wrap` (46rem)
- `routes/profile/+page.svelte` — `.profile-wrap` (640px)
- `routes/admin/+page.svelte` — `.admin-wrap` (1120px)
- `routes/exam-paper/+page.svelte` — `.exam-paper-form`, `.exam-paper-pattern`,
  `.exam-paper-gate` (720px)
- `routes/results/+page.svelte` — `.result-hero-card`, `.hero-links`, `.hero-utility`,
  `.result-retake`, `.result-footer`, `.challenge-card`, `.filter-bar` (860px). This supersedes the
  "content max-width 860px to match the page" note in `2026-09-22-results-spotlight-hero-design.md`;
  the page width that the hero now matches is 1280px.

### 4.4 Content measures kept (component-level, never re-center the page column)

These cap line length, not the page edge. They are either left-aligned inside the column or
proportionally sized:

- Blog post: `.post-excerpt`, `.post-body` → `.measure`; key-point list text likewise.
- Privacy / Terms: `.legal-lead` → `.measure` (cards stay full column; two-column grid at ≥768px).
- FAQ: `.faq-subtitle` → `.measure` centered inside the centered hero; FaqAccordion answer
  paragraphs → 68ch.
- About / Contact / PracticeHub / Exam heroes: existing centered subtitle measures stay.
- Home: `.chat-bubble` capped at `min(86%, 72ch)` so bubbles do not stretch across 1280px; the chat
  panel itself fills the column.
- History `.search-block` (520px) stays a form-field width, not a page column.
- Results `.hero-body` (440px) stays a text measure inside the full-width hero.

### 4.5 Deliberate exceptions (not page columns)

- `.sign-in-modal` (400px) and `.pwa-install-hint` (440px) — overlays.
- `+error.svelte` centered 560px message, centered empty states (e.g. history) — message blocks.
- `/test` immersive question area: `.test-main` stays 860px centered, `.test-summary-card` 480px.
- Bottom navigation and connection banner remain full-bleed.
- Admin is an internal English-only tool; only its width cap changes.

## 5. Verification

- New `tests/e2e/page-width.e2e.js`:
  - Pages: `/`, `/about`, `/faq`, `/blog`, `/privacy`, `/terms`, `/practice`, `/contact`, `/hi/about`.
  - At 1440×900 and 1280×800: for each page, `.header-inner`, `main .container`, `.footer-inner`
    bounding boxes share the same `x` and `right` (±1px), and the container edges equal the first
    page's container edges.
  - At 390×844: computed `padding-inline-start` of all three is 16px; `scrollWidth <= innerWidth`.
  - Attach per-page edge measurements to the artifact as evidence.
- Full suite: `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e`
  (writes `test-results/e2e-artifact.json`).
- Visual pass at 1440px and 390px over the widest pages (`/`, `/results`, `/profile`, `/faq`) to
  catch stretched cards and over-wide text; anchored to the spec in this file.

## 6. Risks

- **Home page widens 720 → 1280.** The planner chat/composer now span the full column; the bubble
  measure keeps messages readable. This is the most visible change and is covered by the visual
  pass.
- **Results content widens 860 → 1280.** Cards (hero, breakdown, challenge) stretch; the hero body
  measure keeps its text height comfortable.
- **Wide cards on prose pages.** Legal and FAQ cards span 1280px; their text is measured, headings
  and controls remain full width by design.
