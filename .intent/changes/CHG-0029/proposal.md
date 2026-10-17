---
protocol_version: "2.0"
id: "CHG-0029"
title: "Value-first first-visit onboarding and an excludable QA-telemetry tag"
status: "complete"
created_at: "2026-10-17T02:27:27Z"
request: "From the 2026-10-17 weekly telemetry review: make the first-visit experience value-first (no blocking tour; on-demand help), and note/implement the exclusion of the team's QA traffic from telemetry analysis."
proposal:
  revision: 2
  digest: "sha256:a489307befecea6cd021aa8fda380f8f47e624edf591c82f0595f56e0bf10ce6"
scope:
  paths:
    - "src/lib/client/constants.js"
    - "src/lib/client/telemetry.js"
    - "src/lib/client/OnboardingHint.svelte"
    - "src/lib/client/PlannerComposer.svelte"
    - "src/lib/client/pages/HomePage.svelte"
    - "src/lib/shared/telemetryEvents.js"
    - "src/lib/locales/english.json"
    - "src/lib/locales/hindi.json"
    - "tests/e2e/qa-tagging.e2e.js"
    - "tests/e2e/first-visit-hint.e2e.js"
    - "tests/e2e/welcome-tour.e2e.js"
    - "tests/e2e/welcome-tour-seen.storage.json"
    - "docs/telemetry.md"
    - "docs/superpowers/specs/2026-10-17-first-visit-onboarding-design.md"
    - "docs/superpowers/plans/2026-10-17-first-visit-onboarding.md"
test_changes:
  - path: "tests/e2e/welcome-tour.e2e.js"
    kind: "modified"
    reason: "The auto-open contract is replaced by the on-demand contract (explicit open via .how-it-works plus a no-auto-open assertion); every behavioral assertion (steps, spotlight, skip/fill/escape/backdrop, reduced motion, resize, blocked storage) is preserved."
  - path: "tests/e2e/welcome-tour-seen.storage.json"
    kind: "modified"
    reason: "The global suppression fixture gains the onboarding-hint dismissal key so pre-existing suites keep their layout; the tour key stays for bookkeeping."
  - path: "tests/e2e/qa-tagging.e2e.js"
    kind: "added"
    reason: "New coverage: ?qa=1 sets the sticky tag and every flushed event carries props.qa; untagged sessions carry none."
  - path: "tests/e2e/first-visit-hint.e2e.js"
    kind: "added"
    reason: "New coverage: hint visibility, dismissal persistence by typing and by dismiss, example-tap retirement, the 3-show cap, 320px/reduced-motion, and blocked storage."
links:
  related:
    - "CHG-0001"
  supersedes: []
  decisions: []
review_required: false
---

# Change intent

## Outcome

First-time visitors get a non-blocking, in-flow coach hint (below the composer panel, never inside it) instead of the auto-opening welcome tour: one line of copy, a one-tap language switch, and a 44px dismiss. It retires on dismiss, first typed input, example tap, or submit; its dismissal persists; and it is capped at three shows if never interacted with. The welcome tour becomes on-demand help opened from an always-visible "How it works" button under the composer, with the component itself unchanged. Team QA traffic becomes excludable from telemetry analysis: visiting `/?qa=1` stores a sticky tag that adds `props.qa = true` to every feature event, and `docs/telemetry.md` gains a "Known QA traffic" subsection with exclusion recipes for historical windows (iOS Chrome + Hyderabad; WebPageTest PTST).

## Scope

### Included

- A new `OnboardingHint` component, HomePage wiring, dismissal persistence, and the 3-show cap.
- Removal of the tour auto-start; a permanent "How it works" entry; `tour:start` emit moved to the open handler; `hasFinishedTour()` stops gating.
- New telemetry events, allowlist and emits in the same commit: `onboarding:hint-shown`, `onboarding:hint-dismissed`.
- QA tagging via `?qa=1` in the telemetry client; the `docs/telemetry.md` QA subsection with SQL recipes.
- Locale keys in both dictionaries: `onboardingHintBody`, `onboardingHintSwitch`, `onboardingHintDismissAria`, `howItWorks`.
- E2E: new `qa-tagging` and `first-visit-hint` specs; `welcome-tour` rewritten to the on-demand contract; the global suppression fixture updated.

### Excluded

- WelcomeTour component internals; composer, gallery, Daily 5, streak, personalize, nudges, PWA prompts, and the profile wizard.
- Bot filtering inside the report script; iOS device-tier reclassification.

## Preserved behavior

Existing behavior is unchanged except by design: the tour no longer auto-opens, and first-visit home gains the hint card. All pre-existing tests keep passing; the `welcome-tour` spec is updated mechanically to the new contract with no assertion weakened, and the suppression fixture only gains a key.

## Test changes

- `tests/e2e/welcome-tour.e2e.js` (modified): on-demand open contract; assertions preserved.
- `tests/e2e/welcome-tour-seen.storage.json` (modified): adds the hint dismissal key to the global suppression fixture.
- `tests/e2e/qa-tagging.e2e.js` (added): QA tag on and off.
- `tests/e2e/first-visit-hint.e2e.js` (added): hint visibility, dismissals, cap, viewport/reduced-motion, blocked storage.

## Decisions and constraints

- The hint is in-flow (no overlay, no measurement loops); typing — not focus — dismisses it, because the app programmatically focuses the empty composer on desktop; eligibility is snapshotted when the 800 ms timer fires; a hint that never displayed emits nothing.
- Dismissal is persistent with a 3-show cap only for never-interacted sessions.
- The language affordance lives in the hint (one-tap switch link) plus the header toggle; the tour entry is permanent for all visitors.
- The QA tag is client-side and sticky; its read/write is guarded so blocked storage never throws. API-side exclusion stays heuristic until a header-based tag exists.
- Telemetry allowlist entries ship in the same commit as their emit sites; `npm run test` enforces parity in both directions.

Design: docs/superpowers/specs/2026-10-17-first-visit-onboarding-design.md

## Verification

- Focused e2e RED→GREEN per task (`npx playwright test tests/e2e/<spec>.e2e.js`); whole change: `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e` with the artifact at `test-results/e2e-artifact.json`.
- QA tag: e2e asserts `props.qa` on flushed batches for `/?qa=1` and its absence otherwise.
- Fleet-filtered baseline recorded for the +1/+2-week comparison (46 page:view identities → 17 activated).
