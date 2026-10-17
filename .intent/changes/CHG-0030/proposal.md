---
protocol_version: "2.0"
id: "CHG-0030"
title: "UX remediation sweep: every critique point across every page"
status: "draft"
created_at: "2026-10-17T12:57:39Z"
request: "Address the full all-pages UX critique (2026-10-17) and make every point green."
proposal:
  revision: 2
  digest: "sha256:28809997044066afd6a33bb623e4d783ec503b3af4e40b62a67c92840a45a7a9"
scope:
  paths:
    - "src/routes/+layout.svelte"
    - "src/routes/admin/+page.svelte"
    - "src/routes/bookmarks/+page.svelte"
    - "src/routes/exam-paper/+page.svelte"
    - "src/routes/history/+page.svelte"
    - "src/routes/print/+page.svelte"
    - "src/routes/profile/+page.svelte"
    - "src/routes/results/+page.svelte"
    - "src/routes/settings/+page.svelte"
    - "src/routes/test/+page.svelte"
    - "src/routes/test/stats/+page.svelte"
    - "src/routes/practice/[examId]/+error.svelte"
    - "src/lib/client/ConfirmDialog.svelte"
    - "src/lib/client/ChatThread.svelte"
    - "src/lib/client/ExplainerHeader.svelte"
    - "src/lib/client/FaqAccordion.svelte"
    - "src/lib/client/GoogleSignInButton.svelte"
    - "src/lib/client/PrintPaper.svelte"
    - "src/lib/client/ResultReviewItem.svelte"
    - "src/lib/client/ReviewSheet.svelte"
    - "src/lib/client/TestQuestionCard.svelte"
    - "src/lib/client/TestStatsCard.svelte"
    - "src/lib/client/pages/AboutPage.svelte"
    - "src/lib/client/pages/BlogIndexPage.svelte"
    - "src/lib/client/pages/BlogPostPage.svelte"
    - "src/lib/client/pages/ContactPage.svelte"
    - "src/lib/client/pages/ExamPage.svelte"
    - "src/lib/client/pages/ExamsHubPage.svelte"
    - "src/lib/client/pages/FaqPage.svelte"
    - "src/lib/client/pages/HomePage.svelte"
    - "src/lib/client/pages/PlaygroundPage.svelte"
    - "src/lib/client/pages/PracticeHubPage.svelte"
    - "src/lib/client/pages/PrivacyPage.svelte"
    - "src/lib/client/pages/PublicExplainerPage.svelte"
    - "src/lib/client/pages/TermsPage.svelte"
    - "src/lib/styles/globals.css"
    - "src/lib/locales/english.json"
    - "src/lib/locales/hindi.json"
    - "docs/superpowers/plans/2026-10-17-ux-critique-sweep.md"
    - "docs/ux-review.md"
    - "tests/e2e/ux-remediation.e2e.js"
    - "tests/e2e/home-layout.e2e.js"
    - "tests/e2e/results-hero.e2e.js"
    - "tests/e2e/visual-explanation.e2e.js"
    - "tests/e2e/playground.e2e.js"
    - "tests/e2e/test-stats.e2e.js"
    - "tests/e2e/sign-in-methods.e2e.js"
    - "tests/e2e/taste-pass.e2e.js"
    - "tests/e2e/seo.e2e.js"
    - "tests/e2e/practice-hub.e2e.js"
test_changes:
  - path: "tests/e2e/home-layout.e2e.js"
    kind: "modified"
    reason: "H1 copy assertion follows the practise/practice copy standardization."
  - path: "tests/e2e/results-hero.e2e.js"
    kind: "modified"
    reason: "Hero-link copy renamed (Review incorrect answers) and the utility row loses the internal Test ID leak (print keeps it)."
  - path: "tests/e2e/visual-explanation.e2e.js"
    kind: "modified"
    reason: "Retry-button and review-link copy follow the standardized strings; the two link-dependent tests retire the shared links rate-limit bucket before their read (the repo's own remedy), so the full suite cannot silently degrade the restore to the build offer."
  - path: "tests/e2e/playground.e2e.js"
    kind: "modified"
    reason: "Retry-button copy follows the standardized string."
  - path: "tests/e2e/test-stats.e2e.js"
    kind: "modified"
    reason: "The stats card now also shows for a lone taker with an attempt of their own; the spec pins the new visibility contract."
  - path: "tests/e2e/sign-in-methods.e2e.js"
    kind: "modified"
    reason: "Passkey removal and Google disconnect now go through the shared confirmation dialog, and row buttons carry device names."
  - path: "tests/e2e/taste-pass.e2e.js"
    kind: "modified"
    reason: "Bookmark exam rows deep-link to their practice pages (was /?exam=), matching every other exam row in the app."
  - path: "tests/e2e/seo.e2e.js"
    kind: "modified"
    reason: "The language toggle announces its target language (हिंदी में बदलें / अंग्रेज़ी में बदलें) instead of a generic label."
  - path: "tests/e2e/practice-hub.e2e.js"
    kind: "modified"
    reason: "The default catalog now shows an exam count; the spec asserts it after clearing a search."
  - path: "tests/e2e/ux-remediation.e2e.js"
    kind: "added"
    reason: "New coverage for the behavioral fixes: empty-paper guard, confirm dialogs, hydration skeletons, exam-paper gate errors, results personalization chip, print guard."
links:
  related:
    - "CHG-0029"
  supersedes: []
  decisions: []
review_required: false
---

# Change intent

## Outcome

Every point of the 2026-10-17 all-pages UX critique is addressed: correctness bugs (empty-paper crash, hidden test-page exit, exam-paper gate sign-in feedback, false settings states, print while loading, history empty-state flash, FAQ anchor offset, About double numbering) plus the consistency program (one destructive-action system, one loading/empty/error language, copy pass, contrast pass, 320px density fixes, a11y semantics sweep, dead-end recovery, trust content).

## Scope

### Included

- Sweeps 1–9 of `docs/superpowers/plans/2026-10-17-ux-critique-sweep.md`, each landing as its own commit behind the repo's full pre-commit gate.
- New shared `ConfirmDialog` replacing every native `confirm()`.
- Copy and i18n updates in both dictionaries; locale parity preserved.
- New `tests/e2e/ux-remediation.e2e.js` plus targeted spec updates where pinned copy/behavior intentionally changed.
- Final `docs/ux-review.md` publishing the critique with every item marked resolved.

### Excluded

- Blog article bodies getting subheads/images (content backlog; rhythm fixed structurally instead).
- A product support mailbox (`support@`) — needs an operational decision; Contact JSON-LD is de-personalized and copy made truthful instead.
- Redesign-scale work: no new pages, no nav IA overhaul beyond making Bookmarks reachable.

## Preserved behavior

Existing tests keep passing except where the critique intentionally changed pinned behavior; every such update is declared in `test_changes` with its reason. Telemetry event names and consent semantics are untouched.

## Test changes

Listed in front matter; `ux-remediation.e2e.js` adds behavioral coverage for the S1/S2 fixes.

## Decisions and constraints

- One destructive pattern: `ConfirmDialog` (safe default focused), plus the existing fuse/undo for reversible single-row deletes.
- Loading language: skeletons with reserved space; labels name the actual wait; "Thinking…" reserved for model generation only.
- Copy standard: sentence case for buttons/titles, no trailing colons in headings, numerals, second person.
- Contrast: no opacity-stacking on text; darker success color for answer keys; underline contrast raised.
- 320px: collapsible filters, reserved async slots; review-list expansion kept as designed (auto-opened cards drive the viewport visual-probe; collapse-all sits above the list).

Design: docs/superpowers/plans/2026-10-17-ux-critique-sweep.md

## Completion notes (revision 2)

Delivered in ten gated commits (`c393515`, `e90f8a2`, `0616817`, `a741ebf`, `93e91d8`, `e4cd91b`, `12c68c6`, `a2cd812`, `fd033cd`, plus this record): every commit green under the full pre-commit smoke (lint + 1138 vitest tests + full Playwright; final 255/255). `docs/ux-review.md` maps every critique item to its resolution. Completion rulings: account focus chips stay clear-buttons; admin keeps its tablist without panel wiring; the bookmarks bottom-bar tab is deferred (Bookmarks already sits beside History in the menu and desktop header); explainer dual-theme payload and blog article subheads are deferred as backlog. Process note: one gate run tested a working tree mid-edit and reported spurious failures; the settled tree passed, and every later sweep stopped editing during hook runs.

## Verification

- Focused specs per sweep before each commit; full pre-commit smoke on every commit.
- Whole change: `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e`, `npm run verify:vercel`.
- `tests/e2e/ux-remediation.e2e.js` pins the behavioral fixes; `vite build` output validated by `check-build-mode`.
