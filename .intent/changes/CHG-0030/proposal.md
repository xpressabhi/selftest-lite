---
protocol_version: "2.0"
id: "CHG-0030"
title: "UX remediation sweep: every critique point across every page"
status: "draft"
created_at: "2026-10-17T12:57:39Z"
request: "Address the full all-pages UX critique (2026-10-17) and make every point green."
proposal:
  revision: 1
  digest: "sha256:dfbd40ca961b750f1f2f704f88517901daf112fc4a73b0eaa0dedaa53aac67cd"
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
    - "tests/e2e/exam-engine.e2e.js"
test_changes:
  - path: "tests/e2e/home-layout.e2e.js"
    kind: "modified"
    reason: "H1 copy assertion follows the practise/practice copy standardization."
  - path: "tests/e2e/results-hero.e2e.js"
    kind: "modified"
    reason: "Hero-link copy renamed (Review incorrect answers) and the utility row loses the internal Test ID leak (print keeps it)."
  - path: "tests/e2e/visual-explanation.e2e.js"
    kind: "modified"
    reason: "Retry-button and review-link copy follow the standardized strings."
  - path: "tests/e2e/playground.e2e.js"
    kind: "modified"
    reason: "Retry-button copy follows the standardized string."
  - path: "tests/e2e/test-stats.e2e.js"
    kind: "modified"
    reason: "The stats card is no longer gated at two visitors; the spec pins the new always-visible entry contract."
  - path: "tests/e2e/exam-engine.e2e.js"
    kind: "modified"
    reason: "Test summary CTA order and the new pre-start auto-advance toggle are pinned in the spec."
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
- 320px: collapsible filters, collapsed-by-default review lists when long, reserved async slots.

Design: docs/superpowers/plans/2026-10-17-ux-critique-sweep.md

## Verification

- Focused specs per sweep before each commit; full pre-commit smoke on every commit.
- Whole change: `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e`, `npm run verify:vercel`.
- `tests/e2e/ux-remediation.e2e.js` pins the behavioral fixes; `vite build` output validated by `check-build-mode`.
