# Implementation Plan: Shared 1120px Application Shell

## Overview

Implement the approved design in `docs/superpowers/specs/2026-09-25-shared-desktop-layout-design.md`. Introduce one 1120px border-box page shell with 16/24/32px responsive gutters, migrate all 19 visible page roots plus header/footer, preserve intentional inner reading/task widths, and extend the existing Playwright layout contract so missing or misaligned shells fail with route-level evidence.

## Architecture Decisions

- `.app-container` is the explicit route/header/footer shell primitive: `width: 100%`, `max-width: 1120px`, centered margins, border-box sizing, and 16px / 24px / 32px gutters below 640px / from 640px / from 1024px.
- `.container` remains a compatibility alias with the exact same shell declaration, but every visible route root migrates to `.app-container` so new code has an unambiguous contract.
- English and Hindi thin route files need no changes because all localized indexable pages render the same shared components.
- Header/footer borders, mobile menu, bottom navigation, banners, and overlays stay full-bleed; only their inner content aligns to the shell.
- Home, legal/article prose, profile, exam-paper, stats, test, and results retain intentional inner maximums. Whole-page caps currently attached to exam-paper and stats roots move inward.
- About and blog index remove their redundant 1024px whole-page caps so their broad card/grid compositions use the shell's 1056px desktop content area.
- `/test` remains immersive (no global header/footer) but its outer `.test-shell` adopts the 1120px shell and its duplicate horizontal padding is removed.
- Testing remains E2E-first. The new shell assertions are added to `tests/e2e/design-consistency.e2e.js` before implementation and must initially fail against the current 1320/1280/920 widths.

## Dependency Graph

```
E2E shell contract (fails first)
        │
        ▼
.app-container + header/footer + design-system contract
        │
        ├──────────────┬─────────────────┬──────────────────┐
        ▼              ▼                 ▼                  ▼
Marketing roots   Content/forms     Utility/error      Workflow roots
(shared pages)    (shared pages)    (direct routes)     (test/results/etc.)
        │              │                 │                  │
        └──────────────┴─────────────────┴──────────────────┘
                                       │
                                       ▼
                         Full E2E + build + Vercel verification
                                       │
                                       ▼
                         Commit, clean-tree artifact reruns, push
```

## Task List

### Phase 1: Executable contract

- [x] **Task 1 (M): Add the failing shared-shell E2E contract**
    - Extend `tests/e2e/design-consistency.e2e.js` with a reusable shell-audit function.
    - Cover static English/Hindi pages, representative blog/practice detail pages, app pages, the error boundary, and seeded results/test/stats states.
    - Assert a visible page shell exists, header/page/footer left and right edges match within 0.5px, width never exceeds 1120px, and wide viewports center the shell.
    - Validate `/test` separately for its intentional header/footer absence.
    - Attach deterministic per-route measurements as `evidence` through the existing artifact reporter.
    - Run the focused spec before implementation and confirm it fails on the current widths, not because of a harness error.

### Checkpoint: Contract fails correctly

- [x] The new shell test fails with measured current header/page/footer width mismatches.
- [x] Existing overflow, clipping, and touch-target audits still pass.
- [x] No production code has changed yet.

### Phase 2: Shell foundation

- [x] **Task 2 (M): Define `.app-container` and align global chrome**
    - Add explicit 1120px border-box shell tokens/declarations in `src/lib/styles/globals.css`.
    - Make `.container` an exact compatibility alias and migrate new code guidance to `.app-container`.
    - Apply `.app-container` to `src/routes/+layout.svelte` header and footer inner elements.
    - Remove the header's 1320px, footer's 920px, and all shell-specific horizontal padding overrides; keep vertical and full-bleed behavior unchanged.
    - Update `docs/design-system.md` widths section with the shell, usable area, responsive gutters, inner-width exceptions, and E2E contract.
    - Re-run the focused E2E test to verify the chrome contract improves while page roots still expose the remaining migration failures.

### Checkpoint: Foundation

- [x] Header and footer are both 1120px with identical edges.
- [x] Mobile menu and fixed navigation remain full-bleed.
- [x] Focused inner columns and safe-area behavior remain intact.

### Phase 3: Route migration

- [x] **Task 3 (M): Migrate marketing shared pages**
    - Files: `HomePage.svelte`, `AboutPage.svelte`, `BlogIndexPage.svelte`, `BlogPostPage.svelte`, `FaqPage.svelte`.
    - Replace route-root `.container` with `.app-container`.
    - Remove Home's duplicate top/left/right safe-area shell padding.
    - Keep Home at 720px and blog prose at 640px; remove About and blog index's redundant 1024px whole-page caps.
    - Keep FAQ content readable and prevent any new horizontal overflow.

- [x] **Task 4 (M): Migrate form and practice shared pages**
    - Files: `ContactPage.svelte`, `PrivacyPage.svelte`, `TermsPage.svelte`, `PracticeHubPage.svelte`, `ExamPage.svelte`.
    - Replace route-root `.container` with `.app-container`.
    - Preserve the existing contact/practice focus and legal reading widths as inner columns.
    - Verify English and Hindi twins receive the identical shell through shared components.

- [x] **Task 5 (M): Migrate utility, account, admin, and error roots**
    - Files: `history/+page.svelte`, `bookmarks/+page.svelte`, `profile/+page.svelte`, `admin/+page.svelte`, `+error.svelte`.
    - Replace route-root `.container` with `.app-container`.
    - Keep profile at 640px and the error message at 560px.
    - Remove Admin's duplicate 1120px inner page cap so it uses the shell's full 1056px desktop content area.

- [x] **Task 6 (M): Migrate focused workflows and the immersive test**
    - Files: `exam-paper/+page.svelte`, `test/stats/+page.svelte`, `results/+page.svelte`, `test/+page.svelte`.
    - Replace route-root containers and apply `.app-container` to the immersive test shell.
    - Move exam-paper and stats' 720px caps from the route root to inner wrappers.
    - Remove test shell-level duplicate horizontal padding while preserving its 860px question/bottom columns, sticky controls, summary cards, and immersive behavior.
    - Keep Results' existing 860px task blocks and wider review content valid inside the new shell.

### Checkpoint: All routes

- [x] All 19 visible `.container` roots are migrated to `.app-container`.
- [x] Thin English/Hindi route wrappers remain unchanged and render aligned shared pages.
- [x] Dynamic blog/practice pages, app pages, admin, error state, and `/test` satisfy their documented contracts.
- [x] Focused shell E2E passes across the route matrix.

### Phase 3.5: Review remediation

- [x] Task 7 (S): Restore shared horizontal safe-area ownership and cover it with injected-inset E2E evidence.
- [x] Task 8 (M): Generate the shell route matrix from every SvelteKit page file, require direct page roots, reject nested shells, and audit all breakpoints.
- [x] Task 9 (M): Cover active-question `/test`, seeded stats/results, and authenticated admin shell states.

### Phase 4: Verification and delivery

- [x] **Task 10 (M): Complete visual, static, and full-suite verification**
    - Run `npm run lint`.
    - Run `npm run check`.
    - Run `npm run test`.
    - Run `npm run test:e2e` and inspect `test-results/e2e-artifact.json` for zero failures and route-level shell evidence.
    - Run `npm run verify:vercel`.
    - Use Search/bench at desktop widths to inspect representative home, about, blog, legal, utility, results, and test pages for visual alignment, header fit, and overflow.

- [ ] **Task 11 (S): Commit, prove repeatability, and push**
    - Review `git diff`, ensure only intended source/test/docs/task files are staged, and create one focused implementation commit.
    - With the commit clean, run `npm run test:e2e` twice and compare the two `test-results/e2e-artifact.json` files byte-for-byte.
    - Confirm the clean artifact reports the implementation SHA and `gitDirty: false`.
    - Push `design/coherence-pass` to `origin` without force.

### Checkpoint: Complete

- [ ] Every design-spec acceptance criterion is met.
- [ ] Full verification commands pass with current output.
- [ ] E2E artifact is repeatable on the clean implementation commit.
- [ ] Commit is pushed and the local branch matches its remote tracking ref.

## Task Details and Acceptance Criteria

### Task 1 — E2E contract

**Acceptance criteria**

- [ ] Every audited non-immersive route has one measurable page shell.
- [ ] Header, page, and footer outer bounds differ by no more than 0.5px.
- [ ] No measured shell exceeds 1120px and shells center correctly on wide viewports.
- [ ] `/test` is measured independently and global chrome absence is intentional.
- [ ] Failure evidence identifies the route, viewport, selector, and measured bounds.

**Verification**

- [ ] Tests pass/fail as expected: `npx playwright test tests/e2e/design-consistency.e2e.js --grep "shared shell"`
- [ ] Manual check: inspect attached JSON evidence from the intentional failing run.

**Dependencies:** None
**Files likely touched:** `tests/e2e/design-consistency.e2e.js`
**Estimated scope:** M

### Task 2 — Shell foundation and chrome

**Acceptance criteria**

- [ ] `.app-container` is 1120px border-box with 16/24/32px responsive gutters.
- [ ] `.container` resolves to the same shell contract.
- [ ] Header and footer inner content share exact edges with no local width override.
- [ ] The design-system canon documents the contract and exceptions.

**Verification**

- [ ] Tests pass/fail as expected: focused shell E2E.
- [ ] Build succeeds: `npm run check`.
- [ ] Manual check: compare header/footer rectangles in attached measurements.

**Dependencies:** Task 1
**Files likely touched:** `src/lib/styles/globals.css`, `src/routes/+layout.svelte`, `docs/design-system.md`
**Estimated scope:** M

### Tasks 3–6 — Route migration

Each migration task must:

- [ ] touch no more than five page files;
- [ ] leave the route in a working state;
- [ ] preserve mobile/tablet behavior and existing internal grids;
- [ ] add no new copy or locale keys;
- [ ] pass the existing fluid-layout audit for its route group.

**Verification**

- [ ] Tests pass: `npx playwright test tests/e2e/design-consistency.e2e.js`
- [ ] Build succeeds: `npm run check`
- [ ] Manual check: representative desktop pages in Search/bench.

**Dependencies:** Task 2
**Estimated scope:** M per task

### Task 10 — Full verification

**Acceptance criteria**

- [ ] Lint, production check, 599+ unit tests, full E2E suite, and Vercel verification pass.
- [ ] The E2E artifact contains the new shell evidence and no failed tests.
- [ ] Manual desktop checks show aligned header/page/footer edges without crowding or overflow.

**Verification**

- [ ] `npm run lint`
- [ ] `npm run check`
- [ ] `npm run test`
- [ ] `npm run test:e2e`
- [ ] `npm run verify:vercel`
- [ ] Search/bench screenshots and DOM measurements for representative routes.

**Dependencies:** Tasks 3–6
**Files likely touched:** None unless verification exposes a defect
**Estimated scope:** M

### Task 11 — Commit and push

**Acceptance criteria**

- [ ] Commit contains the implementation, E2E contract, docs, and task plan only.
- [ ] Two clean-tree full E2E artifacts are byte-identical and report `gitDirty: false`.
- [ ] `git status` is clean and the remote branch contains the commit.

**Verification**

- [ ] `git diff --check`
- [ ] `cmp` the two clean-tree artifact copies.
- [ ] `git status --short --branch`
- [ ] `git rev-parse HEAD` matches `git rev-parse origin/design/coherence-pass` after push.

**Dependencies:** Task 7
**Files likely touched:** `tasks/plan-shared-layout.md`, `tasks/todo-shared-layout.md` with final checkboxes
**Estimated scope:** S

## Risks and Mitigations

| Risk                                                                | Impact | Mitigation                                                                                                                    |
| ------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Header becomes crowded at 1024–1280px, especially Hindi             | High   | E2E overflow audit at 1024/1280 plus manual desktop header inspection; preserve icon sizing and desktop-nav one-line contract |
| Global and local padding stack, producing 40–64px effective gutters | High   | Remove route-root horizontal overrides and assert computed content bounds/width, not only class presence                      |
| Narrow page caps remain attached to shell roots                     | Medium | Move exam-paper/stats caps inward; preserve only documented home/prose/form/task inner widths                                 |
| Compatibility `.container` masks a missed migration                 | Medium | Grep confirms zero visible route-root `.container` usages; E2E requires `.app-container`                                      |
| Test's sticky bars and safe areas regress                           | High   | Keep inner 860px columns and sticky behavior; audit both first-visit and active-question states at all supported widths       |
| E2E route matrix becomes slow or flaky                              | Medium | Stub noisy APIs, seed only required DB rows, split static and seeded matrices, reuse one settled-page helper                  |
| Admin/result/profile content depends on auth or local data          | Medium | Audit the stable shell in their available states and seed existing E2E fixtures; do not change auth behavior                  |
| Mobile menu or bottom nav accidentally narrows                      | Medium | Keep these selectors outside `.app-container`; verify full-bleed rectangles at phone width                                    |
| Pre-commit E2E artifact records a dirty/previous SHA                | Low    | Run final E2E twice after the implementation commit and compare clean artifacts before push                                   |

## Parallelization Opportunities

- Route migration Tasks 3–6 can be edited independently after Task 2 because they share only the completed CSS/class contract.
- Verification must remain sequential after all migration tasks merge into the same worktree.
- No database, API, dependency, or route-loader changes are required.

## Open Questions

None. The approved spec resolves shell inclusion semantics, gutter breakpoints, and route exceptions.
