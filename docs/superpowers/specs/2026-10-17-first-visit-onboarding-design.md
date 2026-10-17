# Value-first first-visit onboarding, and a QA-telemetry exclusion

## Context

The home page auto-opens a blocking 5-step `WelcomeTour` modal ~500 ms after load for first-time visitors (CHG-0001, spec `2026-09-28-welcome-tour-design.md`): language chooser → composer → examples → Daily 5 → streak, ending by filling an example into the composer.

The 2026-10-17 weekly telemetry review first read this tour as a catastrophe — 47 starters → 8 at step 2 → 3 completions, with ~36 identities exiting silently at step 1. Investigation separated signal from noise:

- The week's dominant traffic was the team's **iPhone QA sessions** (39 identities, iOS Chrome `CriOS 155/156` on iOS 27.0.1, all from Hyderabad, 1–8 fresh `client_id`s/day, 2–3 s lifetimes, zero product events), plus WebPageTest agents and desktop probes. After excluding them: the tour funnel is 19 → 8 → 3 with 7 skips — unremarkable, and too small to prove benefit or harm.
- Among the 14 external accounts that actually answered questions, **10 never saw the tour** (deep links / returning users), including the most engaged user of the week; the 3 skippers proceeded fine.
- The tour's teaching content already exists visibly on home (welcome gallery examples, Daily 5, streak, composer). While open, the modal runs a 250 ms measurement interval, scroll lock, focus trap and a 100vmax shadow — paid at first paint on the low-end devices this product targets.
- The QA fleet also explains inflated identity/funnel/device numbers, and will keep polluting every future review: it needs a durable exclusion path.

Separately noted, out of scope: iPhones classify as `low` tier (no `deviceMemory`; cores fallback `≤4` → low), inflating the low-end share of device stats.

## Objective

1. **First visits become value-first.** No modal. A small inline coach hint below the composer panel teaches the one action that matters; it is dismissible, persists its dismissal, and shows at most three times if never interacted with.
2. **The tour becomes on-demand help.** The existing `WelcomeTour` component is kept unchanged, opened from an always-visible "How it works" entry under the composer.
3. **QA traffic becomes excludable.** `?qa=1` marks future QA sessions with `props.qa = true` on every feature event, and `docs/telemetry.md` documents the current heuristic signature and exclusion recipes for historical windows.

## Non-goals

- No changes to `WelcomeTour` internals: steps, spotlight, strings, focus trap, skip/complete semantics stay as shipped.
- No changes to the composer, welcome gallery, Daily 5, streak, personalize, nudges, PWA prompts, or the profile wizard. The PWA install prompt remains browser-driven and untouched.
- No bot filtering implemented in `scripts/telemetry-report.mjs` (documentation + client tagging only).
- No fix for the iOS device-tier classification (noted above; separate change).

## Decisions

- **D1 — The hint is in-flow.** Static card in normal document flow, directly under the planner panel (under the composer), never inside the fixed-height panel so the chat log's height budget is untouched; no overlay, no fixed positioning, no measurement loops, no scroll lock. This is mobile-proof and removes the tour's first-paint cost; the modal is replaced by plain content.
- **D2 — Dismissal is explicit and persistent.** Reasons: `close` (×), `composer` (first non-empty user input), `example` (example-chip tap), `submit` (planner submit). Once dismissed, never shown again. If the tab is killed before any of those, the hint may reappear later, hard-capped at 3 total shows.
- **D3 — Eligibility is the newcomer state.** The hint shows only while `showWelcome` holds (no history, no conversation, nothing typed), snapshotted when the 800 ms one-shot timer fires. If the user interacts before it fires, the timer is cancelled silently and nothing is persisted or emitted — a hint that never displayed produces no `onboarding:*` events.
- **D4 — Typing dismisses, focus does not.** The app programmatically focuses the empty composer on desktop "as an invitation"; focus as a dismissal trigger would kill the hint instantly there. The composer dismissal fires from a non-empty user input event only.
- **D5 — The language affordance moves into the hint.** The tour's blocking language chooser is replaced by a one-tap switch link inside the hint (English UI → "हिंदी में देखें"; Hindi UI → "View in English") that reuses `setLanguage` + `goto` twin. The header `.lang-toggle` remains the persistent control.
- **D6 — The tour entry is permanent.** "How it works" (both locales) sits under the composer for every visitor, not only newcomers; it calls `beginTour()` and emits `tour:start`. `hasFinishedTour()` stops gating anything; the flag write on skip/complete stays for bookkeeping.
- **D7 — QA tagging is client-side and sticky.** `?qa=1` stores `selftest_qa`; `track()` merges `qa: true` into event props while the flag exists. The flag/read/write is fully guarded so private-mode storage never throws. API rows carry no tag yet; `docs/telemetry.md` documents the `CriOS` + `Hyderabad` (and `PTST`) heuristic for them.
- **D8 — Existing suites keep their layout.** The global storage fixture (`tests/e2e/welcome-tour-seen.storage.json`, applied in `playwright.config.js`) gains the hint-dismissal key so pre-existing specs don't suddenly render the new card; the new hint spec and the tour spec opt out with empty storage, as the tour spec already does.

## Behavior

First visit (`/` or `/hi`, no history, clean storage):

| moment | state |
| --- | --- |
| 0 ms | page renders: greeting + welcome gallery + composer, nothing blocking |
| ~800 ms, still eligible | hint appears in flow: body copy, language switch link, 44 px × |
| first user input / example tap / submit / × | hint retires for good (persisted), one `onboarding:hint-dismissed` with its reason |
| reload after retirement | no hint |
| tab killed before any interaction | hint may appear on a later visit; third show is the last |

Tour: never auto-opens. `.how-it-works` (under the composer) opens the existing component for anyone; skip/complete behave as shipped.

Edge cases:

- Interaction within the 800 ms window: cancelled silently — no storage writes, no `onboarding:*` events.
- History present (`showWelcome` false): hint never appears, even with clean hint storage. "How it works" still opens the tour.
- Blocked/private-mode storage: hint dismissal and QA reads/writes must throw nothing (mirrors the tour's blocked-storage contract).
- `/hi`: hint renders with Hindi strings; the switch link goes back to `/`; the tour continues to resume across the language-step navigation (module-level store, unchanged).
- 320 px viewport: no horizontal overflow; dismiss target ≥ 44 px; reduced motion: no transition on the hint.

## Telemetry

- **New allowlist entries** (same commit as emit sites): `onboarding:hint-shown` `{ show }`, `onboarding:hint-dismissed` `{ reason: 'close' | 'composer' | 'example' | 'submit' }`.
- **Reused:** `tour:start` (emit site moves to the open handler), `tour:step`, `tour:skip`, `tour:complete`, `planner:example-tap`. Nothing is removed from the allowlist.
- **QA tag:** every feature event carries `props.qa = true` for tagged sessions; `docs/telemetry.md` gains the "Known QA traffic" subsection with exclusion recipes.
- **Post-ship measurement** (fleet-filtered): primary first-session `generate:start` rate among new visitors (baseline 17/46 ≈ 37 %); secondary `intent:parse` per visitor, first `test:start`; guardrail `ui:rage-tap` and the weekly gates unchanged; hint health via shown→dismissed reason mix.

## Verification

- Per task: focused Playwright runs, RED before GREEN (`npx playwright test tests/e2e/<spec>.e2e.js`); Task 2 also runs the tour/gallery specs and `npm run test` (allowlist doctor).
- Whole change: `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e` with the artifact at `test-results/e2e-artifact.json`.
- Manual: 320 px + iOS safe areas; both locales; `?qa=1` stickiness; tour open from `/hi`.
- Operational baseline recorded pre-ship with the fleet-filtered activation query (see the plan), re-measured at +1 and +2 weeks.

Design: linked from CHG-0029. Plan: `docs/superpowers/plans/2026-10-17-first-visit-onboarding.md`. Related record: CHG-0001.
