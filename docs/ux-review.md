# UX review — selftest.in (all pages)

**Date:** 2026-10-17 · **Branch:** `feat/ux-critique-sweep` · **Record:** CHG-0030
**Method:** code-grounded review of every route and shared component against the Vercel Web Interface Guidelines and this repo's own rules (44px targets, reduced motion, i18n parity, low-end-Android baseline), followed by a nine-sweep remediation where **every commit passed the full pre-commit smoke** (lint + 1138 vitest tests + full Playwright; final **255/255**).

Legend: **✅ fixed** · **🔒 ruled as-designed** (reason given) · **⏭ deferred** (owner decision).

## Cross-cutting themes

| # | Finding | Resolution |
|---|---------|------------|
| 1 | ~16 one-off type sizes; muted text compounded with opacity to ~2–3:1 | ✅ Contrast pass: no opacity-stacking (50-50 hint, eliminated options), `.text-success` → emerald-700 (5.4:1), underline/separator colors raised. Scale normalization is a follow-on style chore. |
| 2 | Three destructive-action dialects | ✅ One `ConfirmDialog` (safe default focused, Escape/backdrop cancel, focus return) replaced every native `confirm()` in history/bookmarks/profile/settings/results; fuse/undo kept for reversible row deletes. |
| 3 | "Thinking…" for four different waits; empty-state flash on history/bookmarks | ✅ Phase-accurate labels (`loadingTest`, `loadingResults`, `loadingSignInMethods`, `checkingAccess`, `loadingHistory`), skeletons with reserved space, both list pages start hydrating so SSR paints the skeleton. |
| 4 | Dead-end navigation | ✅ `practice/[examId]` error boundary with recovery links; print/stats errors offer next steps; exam-paper "unavailable" distinguished from the paywall. |
| 5 | Copy drift | ✅ practise/practice, sentence-case fixes, colon-headings removed, N/A→"—", "ask the admin"→Contact phrasing, "Deleting…"→"Resetting…", duplicate About numbering removed. |
| 6 | A11y semantics on compound controls | ✅ Profile combobox (role/aria-expanded/controls + arrow keys + no-match row), subjects `aria-pressed`, admin revoke confirm + `role="alert"`, results personalize announcement. |
| 7 | 320px density | ✅ Exams filters collapse behind a "Filters (n)" toggle on phones; explainer header eyebrow; review-list expansion kept as-designed (below). |
| 8 | Home section stack | ✅ Resume-alert moved above Daily 5; Daily-5 hint adapts with no history; manual setup renamed "Set up manually". |
| 9 | Perf-as-UX | ✅ Practice recommendation reserves its slot; explain progress is visible (`Explaining n of m…`, aria-live); explainer dual-theme payload ⏭. |
| 10 | Trust content | ✅ Contact JSON-LD de-personalized (Organization + contactPoint); Terms expanded (accounts, AI content, early access, changes, governing law, date, links). |

## Page by page

**Home `/`** — ✅ "Practice" spelling; resume alert attention order; adaptive Daily-5 hint; "Set up manually"; SEO pitch/popular-exams placement 🔒 (pinned by `home-layout` design: pitch sits with the exam links below the planner).

**Test `/test`** — ✅ empty-paper guard with a real empty state (was a crash); exit affordance during loading/error (immersive dead screen fixed); Start first, full-width, secondaries below; pre-start auto-advance toggle; 50-50 unlock teaser wraps to its own line on phones (was hidden); Test-ID leak removed from summary (kept in print); full-exam time budget chip; contrast fixes.

**Results `/results`** — ✅ auto-applied personalization announced with a "Show all answers" undo chip (was silent); retake through the shared dialog with Cancel focused; explain progress line; `TestStatsCard` heading level fixed; "Review incorrect answers" label; utility-row Test ID removed. Review-list default expansion 🔒 — auto-opened wrong cards are what the viewport visual-probe is built around, and collapse-all sits directly above the list.

**Exam paper `/exam-paper`** — ✅ gate sign-in failure now visible at the gate; network failure no longer disguised as the paywall (retry card); "Find the pattern" is a full-size primary; staged progress + Cancel during generation; tab switch announces that the loaded pattern was cleared; "Checking access…".

**Test stats `/test/stats`** — ✅ skeleton tiles; back link + "View results" when applicable; chart gets a screen-reader data list (was `aria-hidden` with hover-only titles); entry card reachable for lone takers (own attempt shows it) and "Full details" is a 44px link; tile scale unified; bars use the app's brand-600.

**Practice hub `/practice`** — ✅ always-visible exam count; `role="search"` + Enter opens the first result; jump-chip scroll-spy; recommendation slot reserved while the personalize call runs.

**Exam page `/practice/[examId]`** — ✅ sectional entry promoted to a real button (it is the recommended first action); bottom CTA replaced the recycled blog banner with "Keep practising" links; Languages cell dropped (already in the lead); missing durations omitted instead of "N/A"; custom not-found boundary.

**Exams hub `/exams`** — ✅ mapped titles link to their practice page; mobile filter collapse with active count; recovery button styled as a primary action; "New" badge renamed "Just added" (filter chip untouched); stale-sync note surfaces on cards.

**History `/history`** — ✅ skeleton first paint (no "No tests found" flash); sync failure note; "No tests yet" vs "No tests match your search" split + clear-search control; score chip never renders `0/0`; Clear uses the shared dialog.

**Bookmarks `/bookmarks`** — ✅ hydration skeletons; empty states carry CTAs; saved presets are re-runnable (`/?preset=` runs the same quick-start, then strips the param); exam rows deep-link to their practice pages; unified removals via the shared dialog. Bottom-bar tab ⏭ (Bookmarks already sits beside History in the menu and in the desktop header).

**Playground `/playground`** — ✅ `btn-lg`/`form-control-lg` actually exist now; focus moves to the artifact after generation; network failure names the next step; answer-only deep links show their context.

**Public explainer `/explain/[slug]`** — ✅ "Free animated explainer" eyebrow gives strangers context; share + create CTA unchanged. Dual-theme payload ⏭ (needs server theme negotiation).

**Print `/print`** — ✅ Print disabled until the paper resolves (was printable-empty); toolbar honors the top safe-area inset; error offers a way back.

**Blog `/blog` + posts** — ✅ hero CTA above the fold; share button on posts; "Latest" badge; "Blog categories" aria-label; "All posts" back link (no duplicate "Blog"). Article subheads/images ⏭ (content backlog).

**About `/about`** — ✅ double numbering fixed; hero centered like its siblings; duplicate FAQ link removed; responsive title scale.

**FAQ `/faq`** — ✅ anchors land below the sticky header on notched devices (`calc(74px + safe-area)`); accordions toggle independently (comparing answers no longer closes the first); `noscript` still opens all.

**Contact `/contact`** — ✅ JSON-LD de-personalized; "How to report a bad question" label matches its destination; external links announce new tabs; og/twitter descriptions added.

**Privacy `/privacy`** — ✅ "Analytics:" colon-heading retitled "Device information"; uniform card grid. **Terms `/terms`** — ✅ expanded from a two-sentence stub to six clauses + date + Contact/Privacy links.

**Profile `/profile`** — ✅ exam picker is a real combobox (arrow keys, no-match row); subject chips expose `aria-pressed`; Reset moved to its own danger zone; "Resetting…" label. Account-focus chips 🔒 — they are clear-buttons with `Clear X` labels, not toggles.

**Settings `/settings`** — ✅ signed-out Google button now signs in (it ran the link action and claimed success); failure copy truthful; load failure no longer fakes "No passkeys yet"; removal dialogs carry device names and go through the shared dialog.

**Admin `/admin`** — ✅ tab selection survives reload; revoke goes through a confirmation; login alert has `role="alert"`. Tablist panel-role wiring 🔒 (internal tool; buttons + `aria-selected` already expose state).

**Shell** — ✅ language toggle announces its target and shows EN/हि state. Bookmarks tab ⏭ (see Bookmarks).

## Verification

- Nine gated commits (`e90f8a2 … a2cd812`): every one green under lint + 1138 vitest tests + full Playwright; final **255/255**.
- Focused RED→GREEN suites per sweep; new `tests/e2e/ux-remediation.e2e.js` pins the behavioral fixes (empty paper, confirm dialogs, history skeleton, personalize notice).
- Spec updates where pinned behavior intentionally changed: `home-layout`, `results-hero`, `visual-explanation`, `playground`, `test-stats`, `sign-in-methods`, `taste-pass`, `seo`, `practice-hub` (all declared in CHG-0030).
- `npm run verify:vercel` on the final tree.
