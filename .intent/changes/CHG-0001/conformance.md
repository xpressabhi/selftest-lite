# Conformance

## Change and intent

- Change: `CHG-0001` — First-visit welcome tour on the home page.
- Proposal: `proposal.md`, revision 2, digest
  `sha256:2a0981c35e9d5a8c3280e4620f74676eafb59403ae5ef9d335626c3846a09fca`.
- Approval: not required (`review.required: false`); no review evidence recorded.

## Outcome

As requested. A first-time visitor (no test history, device flag unset) gets a one-time
tour on `/` and `/hi`: step 1 chooses the app language (persisted through the existing
preference and twin-URL navigation; the tour continues in that language) with the header
language toggle spotlighted so the persistent control stays discoverable, then steps 2–5
spotlight the composer, the example rows, Daily 5, and the streak card. The final "Fill an
example" action fills the composer through the existing example-tap path (no request, no
auto-submit, no keyboard), and finish, Skip, Escape, and backdrop tap all write
`selftest_welcome_tour_done_at`. Returning users and devices that finished the tour never
see it. English and Hindi copy ship together; reduced motion has no transitions.

## Verification evidence

| Check | Result |
| ----- | ------ |
| `npm run lint` | Pass |
| `npm run test` | Pass — 69 files, 806 tests |
| `npm run check` | Pass — SvelteKit sync, production build, build-mode check (193 chunks, no DEV-only code) |
| `npm run test:e2e` | Pass — 155/155, including the new `welcome-tour` suite (13 tests) and every pre-existing suite under the tour suppression; `test-results/e2e-artifact.json` updated |
| `npm run verify:vercel` | Pass — 236 sitemap URLs, 232 prerendered pages, SSR function present |
| `.intent/scripts/verify-change.sh --change .intent/changes/CHG-0001 --base origin/main` | Pass — digest match, scope covered, no protected paths touched, verify command passed |

## Material deviations and decisions

- Design doc adjusted while implementing: the tour's open guard treats the app's own
  invitation focus on the empty composer as not busy; typed or filled composer content,
  or any other focused text field, still blocks opening. The reduced-motion test now
  measures the spotlight after step 2 exists, and the blocked-storage test blocks writes
  to the tour's own flag only (a pre-existing unguarded app write is out of scope).
- Revision 2 (second user-requested delta): the streak card joins as step 5, step 1 now
  spotlights the header language toggle (new `.lang-toggle` hook in the layout) so users
  learn where to switch later, copy and the step counter/dots/autofocus follow the five
  steps, and the design doc records all of it.
- The first E2E run caught a real defect: a step with no position (no target) rendered the
  card invisible at the viewport origin, also swallowing backdrop taps there. The card now
  centers when a step has no (or a hidden) target; the backdrop-tap test pins it. The spec
  wording was corrected from "skip that step" to this fallback.
- The language spotlight initially pinned to the pre-settlement header position (the
  sign-in control changes width after hydration). The tour now re-measures with a 250ms
  watcher that only writes state when the rect actually moves, keeping the spotlight on
  its target without re-render churn.
- Post-verification cleanup: the overlay markup was split into a presentational
  backdrop (the click skip target, with scroll prevention) and a handler-free card,
  and the step focus tracker initializes to `null`, removing the four Svelte compiler
  warnings the first version emitted in dev (initial `step` capture; backdrop role and
  keyboard; card click). No behavior change; the tour suite stayed green.
- The pinned verifier was patched: its scope and protected-path loops let bash
  pathname-expand the unquoted pattern lists, replacing declared globs like `src/**` with
  concrete file names so they stopped matching. Both loops now run under `set -f` with the
  compared path quoted; a positive run and an out-of-scope negative run both behave
  correctly. An `--upgrade` will reintroduce the upstream behavior and the patch.
- No new runtime dependencies, no API or schema changes, no pre-existing test modified.
  `playwright.config.js` gained a global storage state so existing suites keep their
  first-visit behavior; the new suite overrides it with an empty state.

## Declared test changes

None. New files only: `tests/e2e/welcome-tour.e2e.js`,
`tests/e2e/welcome-tour-seen.storage.json`, and the config suppression in
`playwright.config.js`.

## Assumptions

- A hard refresh mid-tour restarts at step 1; the language choice itself is already
  persisted.
- A visitor who left the welcome state before the settle timer never starts the tour and
  keeps the chance to see it on a later visit.
