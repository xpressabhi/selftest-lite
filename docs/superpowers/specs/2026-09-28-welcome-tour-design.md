# Welcome Tour — First-Visit Spotlight Walkthrough (Design)

Date: 2026-09-28
Status: approved (behavior and implementation reviewed in the brainstorming session)
Scope: a one-time, home-only spotlight tour for visitors with no test history: a language
choice, then composer, examples, and Daily 5. No API, schema, or dependency changes.

## 1. Objective

The welcome gallery (2026-09-24 spec) filled the empty planner panel, but the funnel still
leaks: 273 page identities versus 69 `generate:start` in the measured month (see the gallery
spec §1). The tour turns the next step into an explicit, four-move walkthrough and ends with
the composer already filled, so a first-time visitor is one tap from a test.

Success criteria:

- A new visitor (no history, device flag unset) sees the tour once, about 500ms after the
  welcome gallery settles, on `/` and `/hi` only.
- Step 1 chooses the app language; the choice persists (`selftest_language`) and the tour
  continues in it through the localized twin URL (`/` ↔ `/hi`).
- Steps 2–4 spotlight the composer, the example rows, and Daily 5; Skip is always visible;
  Esc and backdrop tap skip; finish and skip both write the device flag and the tour never
  returns.
- "Fill an example" uses the normal example-tap path: exact fill, no request, no
  auto-submit, no keyboard pop, gallery stays visible, `planner:example-tap` fires.
- Returning users (history exists) are untouched. English + Hindi copy ships in the same
  change; reduced motion has no transitions; controls keep 44px targets; E2E artifact
  updated.

## 2. Tech stack

SvelteKit 2 / Svelte 5 runes, existing tokens and helpers only. No new runtime dependencies,
no `svelte/transition`, no rAF loops: geometry is measured once per step and on
resize/rotate, motion is CSS transitions. Reuses `focusTrap.js`, the `readJson`/`writeJson`
storage helpers, the `--backdrop`/`--z-modal` layers, and the existing example-tap path.

## 3. States and triggers

Tour state lives in a new module store (`src/lib/client/welcomeTour.js`), so it survives the
client-side `/` → `/hi` navigation that the language step performs:

```
status: 'idle' | 'active' | 'done'
step:   1..4
```

Open condition, checked on HomePage mount:

```
showWelcome                               (existing derived state)
&& !hasFinishedTour()                     (selftest_welcome_tour_done_at unset)
&& no engaged text field                  (checked at open time: the composer
                                          counts only when typed/filled; any
                                          other focused text field blocks)
```

- When the condition holds, a 500ms settle timer opens the tour at step 1. If `showWelcome`
  flips false before it fires (typing, tap, plan card), the timer is cleared, the tour never
  opens, and the flag is not written.
- If the store is already `active` (the language step just navigated), the tour renders
  immediately at its current step, with no second delay and no timer.
- `finishTour()` and `skipTour()` write `selftest_welcome_tour_done_at` via the guarded
  storage helpers; both set `status: 'done'`. Once `done`, nothing reopens it in the
  session, and the flag prevents it on future visits.
- Tour state is deliberately session-scoped: a hard refresh mid-tour reopens at step 1
  (the language choice itself is already persisted).

## 4. Composition and steps

| # | Spotlight target | Title | Body |
| - | ---------------- | ----- | ---- |
| 1 | none (centered card) | Choose your language | Buttons: English · हिंदी. Shown bilingually; no spotlight. |
| 2 | `.intent-input` | Start here | Type what you want to practice. I'll build the test. Add "hard", "20 questions" or "in Hindi" for more control. |
| 3 | `.welcome-gallery` | No idea what to type? | Tap an example and I'll write it into the box. Edit it any way you like. |
| 4 | `.daily-five-row` | In a hurry? | Daily 5 starts a five-question round in one tap. No setup needed. |

Controls: Skip tour (always visible, top-right of the card), Back (steps 2–4), Next (steps
1–3), step dots plus an sr-only "Step N of 4" counter. Step 4's primary action is **Fill an
example**: it calls the existing `handleExampleTap` with the first example of the first
group (the localized sentence), closes the tour, and writes the flag. No focus is moved to
the composer, so no keyboard appears. The language step marks the current UI language with
a check and `aria-pressed="true"` on its button.

Language step behavior:

- Choosing a language calls the same path as the header toggle: `setLanguage(next)` (persists
  `selftest_language`, sets `<html lang>`) then `goto(languageHref('/', next))` (`/` → `/hi`
  for Hindi). The tour store keeps the step, and the tour continues at step 2 in the chosen
  language; choosing the language you are already on still persists it.
- Generated papers: for a first-timer with no saved paper-language preference, the existing
  HomePage default follows the UI language, so the first paper matches the choice (still
  changeable per test).
- Telemetry: `tour:language` with `{ language }`.

## 5. Interaction and motion

- **Spotlight**: one fixed div at `--z-modal` with `box-shadow: 0 0 0 100vmax var(--backdrop)`
  and a 2px `--brand-text` ring, radius `--radius-surface`. Its top/left/width/height come
  from the measured `getBoundingClientRect()` of the target plus an 8px halo; a CSS
  transition (~240ms ease) moves it between steps. No rAF loop: re-measure on
  `resize` and `orientationchange` only.
- **Card**: prefers below the target, flips above when space is short, clamps to 16px
  gutters, and must never overlap the spotlighted target. On phones the card sits in the
  larger free region; e2e asserts non-overlap and in-viewport placement at 390×844 and
  1280×900.
- **Scroll**: the target is scrolled into view (`behavior: smooth`, or `auto` under reduced
  motion) before measuring. Body scroll is locked while the tour is open, the same way
  `ReviewSheet` locks it.
- **Steps**: advancing re-measures and re-places the spotlight; focus moves to the step
  title (`tabindex="-1"`) so the change is announced.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables the spotlight and
  card transitions and uses instant scrolling; the tour remains fully usable.
- **Exits**: Skip button, Esc, and backdrop tap all skip (flag written). The final CTA
  completes (flag written). Missing target for a step skips just that step; the tour never
  breaks on unexpected DOM.

## 6. Wiring

- `src/lib/client/constants.js`: `WELCOME_TOUR_DONE_AT: 'selftest_welcome_tour_done_at'`.
- `src/lib/client/welcomeTour.js` (new): store + `beginTour`, `setStep`, `finishTour`,
  `skipTour`, `hasFinishedTour`.
- `src/lib/client/WelcomeTour.svelte` (new): card, spotlight, geometry, controls, a11y.
  Props: `{ step, onlanguage, onback, onnext, onskip, oncomplete, onfill }`.
- `src/lib/client/pages/HomePage.svelte`: open effect (timer + guard), handlers (language,
  fill via `handleExampleTap`, skip, complete), render `{#if ...}<WelcomeTour .../>{/if}`.
- `src/lib/locales/english.json` and `hindi.json`: the keys in §7 (parity test enforces).
- `src/lib/shared/telemetryEvents.js`: `tour:start`, `tour:step`, `tour:language`,
  `tour:skip`, `tour:complete` (the fill reuses `planner:example-tap`).
- Unchanged: `ChatThread`, `PlannerComposer`, APIs, schemas, dependencies.

## 7. Copy (en / hi)

| Key | English | Hindi |
| --- | ------- | ----- |
| `welcomeTourLabel` | Welcome tour | स्वागत टूर |
| `welcomeTourLanguageTitle` | Choose your language | अपनी भाषा चुनें |
| `welcomeTourLanguageHint` | You can change it any time. | आप इसे कभी भी बदल सकते हैं। |
| `welcomeTourStartTitle` | Start here | यहाँ से शुरू करें |
| `welcomeTourStartBody` | Type what you want to practice. I'll build the test. Add “hard”, “20 questions” or “in Hindi” for more control. | जो अभ्यास करना है वह लिखें। मैं टेस्ट बना दूँगा। ज़्यादा नियंत्रण के लिए “कठिन”, “20 प्रश्न” या “अंग्रेज़ी में” जोड़ें। |
| `welcomeTourExamplesTitle` | No idea what to type? | समझ नहीं आ रहा क्या लिखें? |
| `welcomeTourExamplesBody` | Tap an example and I'll write it into the box. Edit it any way you like. | किसी उदाहरण पर टैप करें, मैं उसे बॉक्स में लिख दूँगा। चाहें तो बदल भी सकते हैं। |
| `welcomeTourDailyTitle` | In a hurry? | जल्दी में हैं? |
| `welcomeTourDailyBody` | Daily 5 starts a five-question round in one tap. No setup needed. | डेली 5 एक टैप में पाँच सवालों का राउंड शुरू करता है। कोई सेटअप नहीं। |
| `welcomeTourSkip` | Skip tour | टूर छोड़ें |
| `welcomeTourBack` | Back | पीछे |
| `welcomeTourNext` | Next | आगे |
| `welcomeTourFill` | Fill an example | उदाहरण भरें |
| `welcomeTourStepCounter` | Step {current} of {total} | चरण {current} / {total} |

Copy rules: no emoji, glyphs, en/em dashes (taste-pass scans home text); curly quotes are
fine, matching existing locale copy. The language step shows both languages at once,
rendered via the explicit-language `translate` helper; the buttons are literal "English"
and "हिंदी" labels in their own scripts.

## 8. Accessibility

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on the card, `tabindex="-1"` for
  the focus move per step; `use:focusTrap={{ onEscape: skip }}` keeps Tab cycling and
  restores the previously focused element on close.
- Step changes move focus to the step title; the sr-only counter stays `aria-live="polite"`.
- Buttons keep the 44px minimum, token colors, and visible focus; the ring is present in
  both themes; backdrop dim uses the same `--backdrop` token as the sheets.
- The tour never blocks the language step behind a spotlight, so its two buttons are the
  only initial focusables.

## 9. Failure modes (written before the code)

1. Tour appears for a user with history or after the flag is written.
2. Tour opens while the user is typing or another text field is focused, or opens
   after the welcome state already left (must not write the flag).
3. Existing suites click through the overlay → global test suppression plus a dedicated
   tour spec.
4. The language step's navigation loses the tour (state resets to step 1 or closes) →
   covered by "continues at step 2 in Hindi".
5. Language navigation fails (offline): tour stays open in the old language, no crash.
6. Spotlight drifts from its target on resize/rotate → re-measure covered by test.
7. Fill runs a preview/request, or the gallery disappears after fill → covered by
   no-request + gallery-visible assertions.
8. Flag not written on skip/Esc/backdrop/finish, or written on a mere open.
9. Motion still animates under reduced motion.
10. Storage unavailable (private mode): tour works for the session, no error surfaces.
11. Console errors or hydration mismatch (the tour is client-only).
12. Card overlaps the spotlight or leaves the viewport at 390×844 / 1280×900.

## 10. Testing

E2E first (`tests/e2e/welcome-tour.e2e.js`), with the established stubs for
`/api/user/history` and `/api/test`; evidence attached to `test-results/e2e-artifact.json`:

1. New visitor at 390×844 → tour opens ~500ms after the gallery; step 1 shows both
   language buttons and marks the current language; no console errors (covers 11, 12).
2. Pick हिंदी → URL `/hi`, Hindi chrome, tour continues at step 2 in Hindi (covers 4).
3. Next/Back across steps 2–4; the spotlight rect contains the target at phone and desktop
   widths (covers 6, 12); step changes move focus to the title.
4. Step 4 "Fill an example" → composer value equals the first example exactly; no
   `/api/parse-intent` or `/api/generate`; gallery visible; flag written (covers 7, 8).
5. Skip button, Esc, and backdrop tap each close and write the flag (covers 8).
6. Reload after finish → no tour; returning user with one stubbed recent test → no tour
   (covers 1).
7. Reduced motion → computed transitions are ~0, tour fully usable (covers 9).
8. Text already in the composer when the app hydrates (pre-hydration fill) → no tour
   appears and the flag stays unset (covers 2).
9. Storage blocked (an init script makes writes to the tour's flag throw) → the tour
   still opens and skips with no uncaught errors (the app's own storage helpers log and
   recover) (covers 10).
10. Resize mid-step → spotlight still contains the target (covers 6).

Failure mode 3 (existing suites) is covered by the suppression below, not by an assertion.
Failure mode 5 (failed language navigation) is design-mitigated only: `setLanguage` is
local, a failed `goto` leaves the tour open in the old language, and no code path depends
on navigation success. Both are noted rather than e2e-asserted.

Existing suites: `playwright.config.js` sets a global `use.storageState`
(`tests/e2e/welcome-tour-seen.storage.json`, origin `http://localhost:5174`) that writes
`selftest_welcome_tour_done_at`, so no pre-existing spec or interaction changes; the tour
spec overrides with an empty state. No pre-existing test file is edited.

Verification: `npm run lint`, `npm run test`, `npm run check`, `npm run test:e2e`, and
`npm run verify:vercel` (i18n/locales touched).

## 11. Telemetry

| Event | Params | Fired when |
| ----- | ------ | ---------- |
| `tour:start` | — | the tour opens |
| `tour:step` | `{ step }` | each step becomes visible |
| `tour:language` | `{ language }` | step 1 choice |
| `tour:skip` | `{ step }` | skip via button, Esc, or backdrop |
| `tour:complete` | — | Fill-an-example completes step 4 |

The fill itself emits the existing `planner:example-tap { group, slot }`. Readout:
start → complete rate, complete → `generate:start` within the session, and skip step
distribution telling whether the tour is too long.

## 12. Boundaries

- Always: en + hi in the same change; 44px targets; browser APIs guarded; honest telemetry;
  reduced-motion contract.
- Ask first: new runtime dependencies (none planned); API/schema changes (none planned);
  changing the language toggle behavior itself.
- Never: bypass rate limits, render unsanitized model output, delete telemetry rows, break
  PWA/AdSense, append tour content to `plannerDraft.messages`, auto-submit or auto-preview
  from the tour.

## 13. Out of scope

- A replay affordance or help entry for returning users.
- Tours on other pages or after the first test.
- Auto-advance timers or typewriter effects.
- Changing paper language beyond the existing default-follows-UI behavior.
- Personalizing the tour by exam or locale beyond EN/HI.

## 14. Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Tour feels like friction; users skip | Med | Four short steps, Skip always visible, once per device; skip-rate telemetry measures it |
| Global test suppression hides regressions | Med | The dedicated spec drives every step and exit; suppression only sets the flag |
| Spotlight geometry drift (mobile URL bar, rotation) | Med | Re-measure on resize/orientationchange and at each step; e2e asserts containment |
| Language goto mid-tour on slow networks | Low | Module state survives; the tour stays usable and resumes in the chosen language |
| Existing no-history users see the tour once after ship | Low | Deliberate: that is the "new visitor" definition (no test history); users with history are untouched |
