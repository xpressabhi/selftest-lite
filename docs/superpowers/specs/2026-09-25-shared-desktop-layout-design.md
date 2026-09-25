# Shared Desktop Layout Design

**Date:** 2026-09-25  
**Status:** Approved  
**Scope:** Application-wide page, header, and footer width alignment

## Context

The application currently has several unrelated desktop width systems:

- the global `.container` reaches `1280px`;
- the header uses `1320px`;
- the footer uses `920px`;
- page-level wrappers range from `640px` to `1120px`;
- marketing, utility, focused-workflow, and reading pages each define local maximum widths.

Although most pages are fluid and do not overflow, these independent values produce inconsistent page, header, and footer edges. The existing E2E design-consistency test checks overflow, clipping, and control sizing, but it does not assert that the app shell shares one horizontal grid.

## Goals

1. Give every non-immersive page, the header, and the footer one shared desktop width.
2. Make the shared shell the default for all current and future routes.
3. Preserve intentional reading and task-focused inner columns.
4. Keep mobile and tablet layouts responsive and touch-friendly.
5. Prevent future one-off page-shell widths through an automated E2E contract.
6. Avoid copy, navigation, feature, SEO, or data-flow changes.

## Non-goals

- Turning every paragraph, form, quiz, or card into a full-width element.
- Redesigning page-specific grids or visual hierarchy.
- Changing the immersive `/test` experience beyond applying the shared outer width.
- Introducing a new page-layout component or routing abstraction.
- Changing localized content or adding user-facing strings.

## Chosen Direction

Use a shared CSS layout primitive rather than a Svelte `PageShell` component or implicit global overrides.

The primitive is a **1120px border-box shell**, including responsive horizontal gutters. It becomes the one page-level width contract used by:

- every non-immersive page root;
- the header inner row;
- the footer inner content;
- the existing immersive test page's outer container.

Inner content may still use narrower semantic columns. Those columns live inside the common shell and do not redefine its outer edges.

## Layout Contract

### Shared shell

The shared shell uses:

- `width: 100%`;
- `max-width: 1120px`;
- centered horizontal margins;
- responsive horizontal padding:
  - `16px` below `640px`;
  - `24px` from `640px`;
  - `32px` from `1024px`.

The maximum includes horizontal padding because the project uses border-box sizing. At desktop, the shell therefore exposes 1056px of usable content between its gutters.

A stable `.app-container` layout marker is added to each shared root. The same class is used by header and footer inner elements. The E2E suite queries this marker without coupling tests to page-specific wrapper names.

### Existing global container

Every route root is migrated from `.container` to `.app-container`. The existing `.container` class remains temporarily as a compatibility alias with the exact same width, centering, and gutter declaration. New route code uses `.app-container`; `.container` is reserved for already-shared or compatibility contexts until a later cleanup can remove it safely.

### Gutters and safe areas

Responsive gutters are owned by the shared shell. Page roots do not add another horizontal padding layer. Safe-area handling remains owned by the existing app-shell rules; the home page's duplicate horizontal safe-area style is removed.

Vertical page spacing remains page-local and does not affect the horizontal contract.

## Page Composition

### Shared frame, focused inner content

The following retain focused internal columns centered inside the common shell:

- home generator (`720px`);
- profile (`640px`);
- privacy and terms (`640px`);
- blog article prose (`640px`);
- exam-paper builder (`720px`);
- test stats (`720px`);
- test and results task surfaces (up to `860px`);
- focused forms and practice experiences where their current width supports the interaction.

These are inner layout decisions, not page-shell widths.

### Shared frame, broader composition

The following may use most of the shell's usable width while retaining their existing internal grids:

- about;
- blog index;
- FAQ;
- contact;
- practice hub and representative practice detail;
- history;
- bookmarks;
- admin;
- error page.

Localized routes and dynamic detail routes inherit the same shell because they render the same shared page components or the same contract.

## Header and Footer

The header's brand begins at the shell's left content edge. Navigation and actions end at its right content edge. The existing `1320px` local maximum is removed.

The footer's brand, tagline, navigation, and copyright use the same shell class. The existing `920px` local maximum is removed. Footer vertical padding and stacking remain unchanged unless alignment requires a small flex/grid correction.

The mobile menu remains a viewport-level navigation surface and is not constrained to the desktop shell.

## Immersive Exception

`/test` continues to hide the global header and footer. Its outer page container still uses the shared 1120px shell, while its question/task surface retains the existing focused maximum. This preserves the established immersive behavior without introducing a different page-level width.

## Audit and Migration

The implementation audits all `+page.svelte` files and shared page components for:

- root `container` usage;
- page-level `max-width` declarations;
- local horizontal margins and padding;
- inline safe-area gutters;
- header/footer shell values.

Migration changes only shell ownership. Page-local inner maximum widths remain where they serve readability or task focus. Any remaining page-level width is either removed or documented as an explicit exception.

## Testing

Testing follows the repository's E2E-first rule. The existing `tests/e2e/design-consistency.e2e.js` is extended rather than replaced.

### Shell alignment assertions

At desktop widths, the test measures the shared shell marker on the page, header, and footer and asserts:

- the route inventory is generated from every SvelteKit `+page.svelte` file;
- the measured page shell is a direct child of `main`, with no nested `.app-container` or `.container`;
- equal left edges within 0.5px;
- equal right edges within 0.5px;
- a maximum border-box width of 1120px;
- horizontal centering when the viewport is wider than the shell;
- the 16/24/32px base gutters, plus injected horizontal safe-area insets, are preserved.

The matrix covers 390/768/1024/1280/1920px, English/Hindi routes, dynamic fixtures, `/test/stats`, seeded results, and authenticated admin when credentials are configured. The immersive audit separately covers summary and active-question states and documents the intentional absence of global header/footer.

### Existing guarantees

The suite continues to assert:

- no page-level horizontal overflow;
- no content outside the viewport;
- no clipped nowrap content;
- minimum control target sizes;
- dark-mode behavior;
- seeded test, stats, and results flows.

The existing artifact reporter records per-test status and attached evidence in `test-results/e2e-artifact.json`.

### Route coverage

Coverage includes every public page type, English and Hindi route variants, one representative dynamic blog route, one representative practice route, a missing-route error state, an authenticated admin shell, and the immersive test flow. A missing shell marker or edge mismatch fails with the route and measured values attached.

## Acceptance Criteria

1. Header, page, and footer share identical desktop left and right edges.
2. The shared shell never exceeds 1120px including gutters.
3. No non-immersive route root defines an independent page-shell maximum.
4. Home, about, blog, FAQ, contact, utility pages, localized pages, and dynamic pages all participate in the common shell.
5. Reading and task-focused inner columns remain readable and do not create overflow.
6. The immersive test flow retains its existing behavior.
7. Existing mobile and tablet layout guarantees remain intact.
8. The E2E layout contract fails when a route omits the shell or misaligns its edges.
9. `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e`, and `npm run verify:vercel` pass.
10. The change is committed and pushed to the current branch.
