# UX Remediation Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this plan task-by-task.

**Goal:** Close every finding from the 2026-10-17 all-pages UX critique — bugs (S1), consistency (S2), and polish (S3) — with every commit proven by the repo's full pre-commit gate.

**Source critique:** the session's page-by-page review (all routes + shared shell, code-grounded against the Vercel Web Interface Guidelines and the repo's own 44px / reduced-motion / i18n rules). Ten cross-cutting themes + per-page items.

**Branch:** `feat/ux-critique-sweep` (base `main` @ `22f031b`). Record: CHG-0030.

## Global constraints

- Full smoke gate (lint + vitest + Playwright) runs on every commit; focused specs run before each commit.
- Locale parity: every string change lands in `english.json` **and** `hindi.json`.
- Don't weaken a pinned test to fit a change; where a pinned design intentionally changes, update the spec in the same commit and declare it in CHG-0030 `test_changes`.
- 320px + reduced-motion + 44px constraints hold for every touched surface.

## Sweep 1 — Copy pass (locale-only + spec sync)

Fix: practise/practice drift, sentence-case drift ("Try Again", "Unsubmitted Test", "Untitled Test"), bookmarks heading pattern ("Bookmarked questions"), stats strip casing, About double numbering (copy side) + trailing-colon headings, "Free to start"→"Free to use", "Deleting…"→"Resetting…", "Someone"→"Another learner", "N/A"→"—", "Review wrong answers"→"Review incorrect answers", "ask the admin"→Contact phrasing.
Specs: `home-layout`, `results-hero`, `visual-explanation`, `playground` updated to the new strings.

## Sweep 2 — Destructive actions unified + contrast fixes

- New shared `ConfirmDialog.svelte` (role=dialog, aria-modal, focus trap via existing `focusTrap.js`, **safe default focused**, Escape/cancel).
- Replace native `confirm()`: history clear, bookmarks remove ×3, profile reset, settings passkey remove + Google unlink, results retake.
- Contrast: remove opacity-stacking on disabled 50-50 + eliminated options; `.text-success` darker for answer keys; `.utility-link` underline no longer `var(--line)`.
- Tests: update dialogue flows in every spec that used `page.on('dialog')` (history/bookmarks none exist — covered in new `ux-remediation.e2e.js`).

## Sweep 3 — Loading / empty / error states

- History: skeleton while hydrating (no empty-state flash), hydration error branch, split "no history" vs "no results" (+ clear-search), hide `0/0` score chip.
- Bookmarks: skeleton, empty states with CTAs, preset rows re-runnable (`Start` → `/?preset=<id>` handled on Home), exams rows link to practice pages.
- Test stats: skeleton, back link, always-visible entry (drop the visitors≥2 gate; keep explainer counter policy), "Full details" becomes a real 44px link.
- Phase-accurate loading labels: new keys (`loadingTest`, `checkingAccess`, `loadingSignInMethods`, …) replace "Thinking…" wherever AI isn't involved.

## Sweep 4 — Test page

- Empty-paper guard with a real empty state (no crash).
- Exit affordance during loading/error (header renders before resolve).
- Summary CTA order: Start first, secondary Share/Print below.
- Auto-advance toggle on the pre-start summary.
- 50-50 lock teaser visible on phones.
- Remove "Test ID" leak from the summary (keep in print).
- Full-exam time budget line in the summary meta.
- Contrast per Sweep 2 tokens.

## Sweep 5 — Results

- Announce auto-personalization + "Show all answers" undo chip.
- Review list defaults collapsed when many incorrect items; Expand all stays.
- Explain progress line (`Explaining n of m…`, aria-live).
- `TestStatsCard` heading level fix; "Review incorrect answers" label; retake via ConfirmDialog (Sweep 2).

## Sweep 6 — Practice / Exam / Exams / Exam-paper

- Practice hub: role=search + Enter submits to first result, always-visible count, jump-chip active state (scroll-spy), reserved space for "Recommended".
- Exam page: secondary "short sectional" promoted to a real button, bottom CTA repointed (no blog copy), Languages cell dropped from pattern grid, "N/A" durations omitted, custom `+error.svelte` for unknown exam ids.
- Exams hub: card titles become links, mobile collapsible filter bar with active-count, recovery chip restyled, "New" badge renamed, stale note surfaced on cards.
- Exam paper: gate errors visible at the gate, "unavailable" ≠ paywall, staged progress + cancel for generation, tab-switch notice, "request access" copy.

## Sweep 7 — Content pages

- Playground: real `.btn-lg`/`.form-control-lg` styles, focus moves to artifact after generation, connection-specific error copy, answer-only deep-link shows context.
- Public explainer: identity line (breadcrumb to home), stats fetch gated, eyebrow label.
- Blog: hero CTA, share on posts, "Latest" label, aria-label fix, "All posts" back link, paragraph rhythm.
- About: hero alignment, duplicate link removed, `.text-page` title.
- FAQ: anchor offset `calc(74px + var(--sat))`, independent accordions, sticky chips.
- Contact: JSON-LD de-personalized, "Report a bad question" label fixed, new-tab SR hints, og overrides.
- Privacy/Terms: merge Analytics card, real Terms expansion with date + premium clause + links, consistent grid.

## Sweep 8 — Account / admin / shell

- Profile: combobox semantics + zero-result row, `aria-pressed` chips, Reset moved to a danger zone, "Resetting…" label, N/A removal.
- Settings: signed-out Google button signs in (not links) + truthful copy, load-failure state, expiring two-step confirm, named Remove labels.
- Admin: tablist/tabpanel wiring, sessionStorage tab persistence, revoke confirm, `role="alert"`, English-only literals where `$t` leaked.
- Shell: language toggle announces target language (+ EN/हि state), Bookmarks reachable from the bottom bar when the user has saved items.

## Sweep 9 — Home polish

- Daily 5 hint adapts when there is no last topic.
- Unsubmitted-test alert sits with the composer (attention order).
- "Browse topics & exams" renamed; section rhythm tightened.
- Any leftover a11y items from the critique checklist.

## Sweep 10 — Verification & close

- `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e`; `npm run verify:vercel` (i18n/routes touched).
- New `tests/e2e/ux-remediation.e2e.js` covering the behavioral fixes (empty paper, confirm dialogs, skeleton gates, gate errors, personalization chip, CTA order, print guard).
- `docs/ux-review.md` finally published with every item marked green.
- CHG-0030 conformance + final review + PR.
