# Conformance — CHG-0030

Linked revision: proposal r2 (`sha256:28809997044066afd6a33bb623e4d783ec503b3af4e40b62a67c92840a45a7a9`).

## Outcome

Delivered: every page of the 2026-10-17 UX critique addressed — correctness bugs (empty-paper crash, immersive loading dead screen, exam-paper gate feedback, settings false states, print-while-loading, history empty-state flash, FAQ anchor overlap, About double numbering), the consistency program (one destructive-action dialog, one loading/empty/error language, copy pass, contrast pass, 320px density fixes, a11y semantics sweep, dead-end recovery, trust content), and the published mapping in `docs/ux-review.md`. Nine gated commits on `feat/ux-critique-sweep`: `e90f8a2`, `0616817`, `a741ebf`, `93e91d8`, `e4cd91b`, `12c68c6`, `a2cd812` (plus the r1 copy commit `c393515` and the r1 review-fix commit carried in CHG-0029's line).

## Deviations and rulings

- **Results review-list expansion kept as-designed** (plan said collapse-by-default when many wrong): the two visual-explanation specs showed the auto-opened cards are what the viewport visual-probe is built around, and collapse-all already sits directly above the list. Reverted the change; plan updated in the same commit.
- **Links rate-limit flake**: the two link-dependent visual-explanation tests were hardened with the repo's own `clearLinksRateLimit` remedy (the suite's parallel workers exhaust the shared bucket); no app behavior changed.
- **Focus chips** in the profile are clear-buttons with `Clear X` labels, not toggles — `aria-pressed` applies only to the subject chips.
- **Admin** keeps its tablist without `tabpanel` wiring (internal tool; buttons + `aria-selected` expose state). Revoke confirmation, `role="alert"`, and reload persistence shipped.
- **Bookmarks bottom-bar tab deferred**: the critique's minimum (Bookmarks beside History in the menu and in the desktop header) already holds; a sixth tab is a navigation-IA decision for the owner.
- **Process note**: one gate run (Sweep 6) tested a working tree while Sweep 7 edits were being applied and reported two spurious failures; both passed on the settled tree, and the combined commit re-ran the full gate green before landing. Editing during hook runs stopped for every subsequent sweep.

## Verification evidence

- Per-sweep focused suites RED→GREEN; every commit through `.githooks/pre-commit` (lint + vitest + full Playwright); final full suite **255/255** with `test-results/e2e-artifact.json` evidence.
- `tests/e2e/ux-remediation.e2e.js` added: empty-paper guard, confirmation-dialog flows (history clear, bookmark remove), history skeleton gating, personalize announcement/undo.
- Spec updates where pinned behavior intentionally changed: `home-layout`, `results-hero`, `visual-explanation`, `playground`, `test-stats`, `sign-in-methods`, `taste-pass`, `seo`, `practice-hub` — every one declared in the front matter with its reason.
- `npm run verify:vercel` (build + sitemap/canonical/hreflang/crawler checks) on the final tree.
- Locale parity preserved in both dictionaries; telemetry allowlist untouched (no new events this change).
