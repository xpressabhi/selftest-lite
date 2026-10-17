# First-visit Onboarding (Value-First) + QA Telemetry Exclusion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blocking first-visit welcome tour with value-first in-page guidance, make the tour on-demand help, and make the team's QA traffic excludable from all future telemetry analysis.

**Architecture:** The existing `WelcomeTour` component is kept intact but loses its auto-start; it opens from a new "How it works" entry under the composer. A small presentational `OnboardingHint` card teaches the composer inline for first-time visitors (no modal, no backdrop, no measurement timers). QA traffic gets a sticky client-side tag (via `?qa=1`) attached to feature-event props, plus a runbook entry in `docs/telemetry.md` documenting the current heuristic (iOS Chrome + Hyderabad) so historical windows stay filterable.

**Tech Stack:** SvelteKit 3 / Svelte 5 runes, Tailwind + `globals.css`, Playwright E2E (sole verification per AGENTS.md), telemetry allowlist in `src/lib/shared/telemetryEvents.js`.

**Spec:** `docs/superpowers/specs/2026-10-17-first-visit-onboarding-design.md` (authority for conflicts). Related: `docs/superpowers/specs/2026-09-28-welcome-tour-design.md`, CHG-0001.

**Branch:** `feat/first-visit-onboarding` (base: `main`).

## Global Constraints

- All user-facing text in **both** `src/lib/locales/english.json` and `hindi.json`; look up via `$t(...)`. No hardcoded UI strings.
- Every `track()` event must be in the allowlist (`telemetryEvents.js`) **in the same commit** as its emit site; `npm run test` enforces both directions.
- E2E-first: specs in `tests/e2e/*.e2e.js`; artifact `test-results/e2e-artifact.json`; never touch `DATABASE_URL`; focused run `npx playwright test tests/e2e/<spec>.e2e.js`.
- Mobile-first 320px+; 44×44px tap targets; `prefers-reduced-motion` respected (global CSS); no new JS timers/observers beyond the one-shot hint show delay; safe-area insets untouched.
- Style: semicolons, single quotes; PascalCase components, camelCase modules.
- Do not modify `WelcomeTour.svelte` behavior beyond what "manually openable" requires.
- Telemetry in E2E: `http://app.localhost:5174/` bypasses the `isLocalhost()` filter so the real queue → beacon path runs; `page.route('**/api/telemetry')` captures batches (pattern: `tests/e2e/device-profile.e2e.js:123-168`); `window.dispatchEvent(new Event('pagehide'))` forces a flush.

## Review Focus

Inputs/failure modes most likely to bite, each with its test in the owning task:

1. **Interaction before the hint's ~800 ms delay** (example tap or typing immediately) — no orphan `onboarding:hint-*` events, no resurrection after reload.
2. **Blocked/private-mode storage** — hint dismissal and the QA flag must never throw (mirror `welcome-tour.e2e.js` blocked-storage test).
3. **Hindi path** — hint renders on `/hi`; the switch link works in both directions; the tour still opens after switching.
4. **Non-first-visit visitors** — hint never shows when `showWelcome` is false (history present); "How it works" still opens the tour for everyone.
5. **Reduced motion + 320px viewport** — no overflow, 44px dismiss target, no transition under reduced motion.

---

## Task 0: QA telemetry tagging + runbook note

**Files:**
- Modify: `src/lib/client/telemetry.js`, `src/lib/client/constants.js`
- Modify: `docs/telemetry.md`
- Test: `tests/e2e/qa-tagging.e2e.js` (new)

**Interfaces:**
- Produces: `props.qa = true` on every flushed event when `localStorage['selftest_qa']` is set; `startTelemetry()` reads `?qa=1` from the URL and sets that key stickily.
- Consumes: `STORAGE_KEYS` from `constants.js`, `writeJson`/`readJson` from `storage.js`.

- [ ] Step 1: Write the failing spec `tests/e2e/qa-tagging.e2e.js`:
  - test A: visit `http://app.localhost:5174/?qa=1`, stub `**/api/telemetry`, wait for hydration, dispatch `pagehide`, assert every captured event carries `props.qa === true` and `localStorage.getItem('selftest_qa')` is set.
  - test B: visit `http://app.localhost:5174/` with empty storage; assert no captured event has a `qa` prop and the key stays unset.
- [ ] Step 2: Run `npx playwright test tests/e2e/qa-tagging.e2e.js` — Expected: FAIL (no flag handling).
- [ ] Step 3: Implement: add `QA_TESTER: 'selftest_qa'` to `STORAGE_KEYS`; in `startTelemetry()`, when `new URLSearchParams(window.location.search).get('qa')` is truthy, `writeJson(STORAGE_KEYS.QA_TESTER, Date.now())` (wrapped so storage failures never throw); in `track()`, merge `{ qa: true }` into the props passed to `queue.push` when `readJson(STORAGE_KEYS.QA_TESTER, null)` is set (one read per event is fine; or memoize at module level after `startTelemetry`).
- [ ] Step 4: Run the spec — Expected: PASS.
- [ ] Step 5: Paste the "Known QA traffic" subsection (below) into `docs/telemetry.md` under "Production vs non-production" and add the exclusion recipes.
- [ ] Step 6: Run `npx playwright test tests/e2e/qa-tagging.e2e.js` once more and commit:

```bash
git add src/lib/client/telemetry.js src/lib/client/constants.js tests/e2e/qa-tagging.e2e.js docs/telemetry.md
git commit -m "feat(telemetry): tag QA sessions via ?qa=1 and document known QA traffic"
```

Draft `docs/telemetry.md` addition:

```markdown
### Known QA traffic

Team phone testing against production produces real-looking traffic: fresh
`client_id` per private-tab session, ~2–3 s lifetimes, no product events.
Observed signature (Oct 2026): iOS Chrome (CriOS) on iPhone, uniform Chrome
builds, all from one city (Hyderabad), 1–8 new identities/day.

- Exclude it from identity metrics by excluding the `client_id`s joined from
  `api_request_events` on `user_agent LIKE '%CriOS%' AND ip_city = 'Hyderabad'`
  (organic iOS Chrome users in other cities are unaffected). Also exclude
  WebPageTest agents (`user_agent LIKE '%PTST%'`) in ad-hoc analysis.
- Going forward, open QA sessions as `/?qa=1` (bookmark it). The client stores a
  sticky flag and attaches `props.qa = true` to every feature event; filter with
  `COALESCE(props->>'qa','false') <> 'true'`.
- API rows carry no `qa` prop yet; use the UA + city heuristic there.
```

## Task 1: Tour becomes on-demand

**Files:**
- Modify: `src/lib/client/pages/HomePage.svelte`, `src/lib/locales/english.json`, `src/lib/locales/hindi.json`
- Test: `tests/e2e/welcome-tour.e2e.js` (rewrite of the auto-open contract)

**Interfaces:**
- Produces: `function openTour()` in HomePage = `beginTour(); track('tour:start');`; entry = `<button class="how-it-works">` inside `.intent-section` after `<PlannerComposer/>`; new locale key `howItWorks`.
- Consumes: existing `welcomeTour` store (`beginTour`, `setTourStep`, `skipTour`, `finishTour`).

- [ ] Step 1: Rewrite `tests/e2e/welcome-tour.e2e.js`:
  - `openTour(page)` helper: goto `/`, waitForHydration, assert `.welcome-tour` count stays 0 for 1200 ms (no auto-open), then click `.how-it-works`, wait for `.welcome-tour` visible.
  - Convert every previously auto-open test to use the helper; keep all other assertions (steps, spotlight, fill, skip/escape/backdrop, reduced motion, resize, blocked storage, hindi switch).
  - "finish/skip writes the flag, a finished device never sees it again" keeps asserting no auto-open after reload AND that `.how-it-works` still opens it on demand.
  - Update the file header comment (the auto-start contract is gone).
- [ ] Step 2: Run `npx playwright test tests/e2e/welcome-tour.e2e.js` — Expected: FAIL (no entry button; auto-start still present).
- [ ] Step 3: In `HomePage.svelte`: delete the tour block in the first `onMount` (~458–491: `tourTimer`, `engagedTextField`, auto `beginTour()`, auto `track('tour:start')`); drop the now-unused `hasFinishedTour` import/usage; add `function openTour()` and the `.how-it-works` button after `<PlannerComposer .../>`; add the `howItWorks` string to both locales (EN "How it works", HI "यह कैसे काम करता है").
- [ ] Step 4: Run the spec — Expected: PASS.
- [ ] Step 5: Commit:

```bash
git add src/lib/client/pages/HomePage.svelte src/lib/locales/english.json src/lib/locales/hindi.json tests/e2e/welcome-tour.e2e.js
git commit -m "feat(home): welcome tour opens on demand from How it works"
```

## Task 2: First-visit coach hint

**Files:**
- Create: `src/lib/client/OnboardingHint.svelte`
- Modify: `src/lib/client/pages/HomePage.svelte`, `src/lib/client/PlannerComposer.svelte`, `src/lib/client/constants.js`, `src/lib/shared/telemetryEvents.js`, `src/lib/locales/english.json`, `src/lib/locales/hindi.json`
- Modify: `tests/e2e/welcome-tour-seen.storage.json` (add the hint dismissal key so pre-existing suites keep their layout)
- Test: `tests/e2e/first-visit-hint.e2e.js` (new)

**Interfaces:**
- `OnboardingHint.svelte`: presentational card, props `{ ondismiss: (reason: 'close') => void; onswitch: () => void }`. Class hooks: `.onboarding-hint`, `.onboarding-hint-dismiss`, `.onboarding-hint-switch`.
- HomePage: `dismissHint(reason: 'close'|'composer'|'example'|'submit')` writes `ONBOARDING_HINT_DISMISSED_AT`, hides, `track('onboarding:hint-dismissed', { reason })`. Eligibility snapshot at the 800 ms timer: `showWelcome` true && not dismissed && shows < 3; on show: increment `ONBOARDING_HINT_SHOWS`, `track('onboarding:hint-shown', { show })`.
- New `STORAGE_KEYS`: `ONBOARDING_HINT_DISMISSED_AT: 'selftest_onboarding_hint_dismissed_at'`, `ONBOARDING_HINT_SHOWS: 'selftest_onboarding_hint_shows'`.
- New allowlist events: `onboarding:hint-shown`, `onboarding:hint-dismissed`.
- `PlannerComposer.svelte`: new optional prop `onuserinput = () => {}`, called from the `.intent-input` `oninput` when the value is non-empty.

- [ ] Step 1: Write `tests/e2e/first-visit-hint.e2e.js` (storage opted out like `welcome-tour.e2e.js`): (a) clean load → no `.welcome-tour`, hint visible; (b) typing in `.intent-input` hides the hint and a reload shows none; (c) × dismisses and persists; (d) example tap fills the composer and retires the hint; (e) three fresh loads show the hint, the fourth does not (cap); (f) 320px viewport: no horizontal overflow, dismiss ≥ 44px; reduced motion: no transition; (g) blocked-storage variant of (c) throws nothing.
- [ ] Step 2: Run the spec — Expected: FAIL.
- [ ] Step 3: Implement component + HomePage wiring + `PlannerComposer` prop + storage keys + allowlist entries + emits + locale strings (`onboardingHintBody`, `onboardingHintSwitch`, `onboardingHintDismissAria`) + fixture update.
- [ ] Step 4: Run `npx playwright test tests/e2e/first-visit-hint.e2e.js tests/e2e/welcome-tour.e2e.js tests/e2e/welcome-gallery.e2e.js` and `npm run test` (allowlist doctor) — Expected: PASS.
- [ ] Step 5: Commit:

```bash
git add src/lib/client/OnboardingHint.svelte src/lib/client/pages/HomePage.svelte src/lib/client/PlannerComposer.svelte src/lib/client/constants.js src/lib/shared/telemetryEvents.js src/lib/locales/english.json src/lib/locales/hindi.json tests/e2e/first-visit-hint.e2e.js tests/e2e/welcome-tour-seen.storage.json
git commit -m "feat(home): value-first coach hint replaces the blocking first-visit tour"
```

## Task 3: Verification + baseline

- [ ] Step 1: `npm run lint && npm run check && npm run test`.
- [ ] Step 2: `npm run test:e2e` — inspect `test-results/e2e-artifact.json` (all green, evidence attached).
- [ ] Step 3: Manual: 320px + iOS safe areas; both locales; `/?qa=1` sticks; tour via "How it works" from `/hi`.
- [ ] Step 4: Record the pre-ship baseline with the fleet-filtered activation query (spec § Verification): 46 view → 17 activated (37%); tour funnel 19 → 8 → 3.
- [ ] Step 5: Commit stragglers; hand off to `finishing-a-development-branch` (PR — ask before pushing).

## Measurement plan (post-ship)

- +1 week, +2 weeks: `npm run telemetry:report -- --days=7` plus the fleet-filtered activation query; compare with 17/46.
- Primary: first-session `generate:start` rate among new visitors. Secondary: `intent:parse` per visitor, first `test:start`. Guardrail: `ui:rage-tap` on home; weekly gates unchanged.
- Hint health: `onboarding:hint-shown` → `hint-dismissed` reason mix; share of visitors who saw the hint and engaged; cap behaviour.
