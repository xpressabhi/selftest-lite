# Change intent

> Keep routine changes short. Add detail only when complexity, risk, ambiguity, or repository policy needs it.

## Request and outcome

A first-time visitor (no test history) sees a one-time welcome tour on the home page:
step 1 chooses the app language (persisted) with the header language toggle spotlighted,
steps 2–5 spotlight the composer, the example rows, Daily 5, and the streak card, and the
final "Fill an example" action writes a localized example into the composer with no
request and no auto-submit. Approved design:
`docs/superpowers/specs/2026-09-28-welcome-tour-design.md`.

## Context

The welcome gallery (2026-09-24 spec) fills the empty planner panel, but only ~1 in 4 page
identities ever start a generation. The home page already carries the sanctioned
always-on gradient ring on the composer; language is URL-driven (`/` ↔ `/hi`) with the
saved preference in `selftest_language`, and the header toggle persists it and navigates
to the twin. New UI strings ship in English and Hindi; tests are E2E.

## Scope

### Included

- `.intent`, `docs`, `AGENTS.md`, and the Intent CI workflow already on this branch (the
  adoption this feature builds on).
- A client-only WelcomeTour component with measured spotlight, card placement, step
  controls, focus trap, and body scroll lock.
- Five steps: language (spotlighting the header language toggle), composer, examples,
  Daily 5, and the streak card.
- HomePage open logic (welcome state, device flag, no focused input, 500ms settle) and
  handlers: language choice, fill (reuses `handleExampleTap`), skip, complete.
- New locale keys (en/hi), storage key `selftest_welcome_tour_done_at`, telemetry events
  `tour:start`, `tour:step`, `tour:language`, `tour:skip`, `tour:complete`.
- Tests: new `tests/e2e/welcome-tour.e2e.js`, a storage-state fixture, and a global
  suppression in `playwright.config.js` so existing suites never see the overlay.

### Excluded

- Replay affordances, tours on other pages, auto-advance or typewriter motion.
- Any API, schema, dependency, or background-job change.
- Changing the header language toggle or the generated-paper language control.
- Unit tests: the change is UI wiring, exercised by E2E.

## Preserved behavior

Existing behavior and pre-existing tests remain unchanged: the welcome gallery keeps its
contract (returning users untouched, tap-to-fill semantics), the composer and ring are
untouched, and the tour reuses the example-tap path instead of adding a parallel one.
Exception (by design, stated in the design doc): first-time visitors now also see the tour
once; the gallery itself does not change.

## Test changes

None. No pre-existing test file is modified: the new spec is additive and the existing
suites are protected from the overlay by a global storage-state fixture.

## Decisions and constraints

- Overlay spotlight tour over passive animation or non-blocking coach marks (approved in
  brainstorming).
- Shown once per device; finish, Skip, Esc, and backdrop tap all write the flag so it
  never nags.
- Language step reuses `setLanguage` + twin navigation so the choice persists and the
  tour continues in the chosen language; the header toggle stays spotlighted so the
  persistent control is discoverable.
- The spotlight is re-measured by a 250ms watcher while the tour is open (state updates
  only when the target actually moves), so late hydration shifts keep it aligned.
- No new runtime dependencies; geometry measured per step, motion CSS-only, no rAF loops;
  reduced motion has no transitions and instant scrolling.
- E2E artifact must stay reproducible; telemetry allowlist and emit sites stay honest in
  the same commit.

## Verification

- `npm run lint`, `npm run test`, `npm run check` pass.
- `npm run test:e2e` passes (new tour suite plus the existing suites under the
  suppression); `test-results/e2e-artifact.json` updated.
- `npm run verify:vercel` passes (i18n and locales touched).
- Manual spot check at 390×844 and 1280×900: spotlight contains its target, card never
  overlaps it, no console errors.
