# Welcome Gallery — Plan-Your-Test Empty State (Design)

Date: 2026-09-24
Status: approved (layout C reviewed as mockups in the brainstorming companion, copy section approved)
Scope: fill the blank planner panel for users with no test history and teach what to type,
until the first keystroke. No API, schema, or dependency changes.

## 1. Objective

For a first-time visitor the planner panel (`.planner-panel` in `HomePage.svelte`, made of
`ChatThread` + `PlannerComposer`) is mostly blank: the log holds only three small example chips
under "Try these". Telemetry for the last 30 days shows why that matters — 273 page identities
versus 69 `generate:start` (≈4 of 5 never start a test), and only ~40 identities ever produce an
`intent:preview`. Users who do generate are school- and Hindi-heavy (CBSE 10/12, NEET biology,
Hindi grammar, GK; 93 of 241 papers in Hindi).

The design replaces the empty log with a **welcome gallery**: an assistant greeting, three
goal-based example groups (2 rows each), and one modifier tip — visible until the user starts
typing. Tapping an example fills the composer (no auto-submit) so the user sees and can edit the
kind of sentence the planner understands.

Success criteria:

- A user with no history sees greeting + 3 group labels + 6 examples + tip without scrolling at
  390×844.
- The first typed character (or paste) removes the gallery and tip; clearing the field brings them
  back; the panel height never changes, so nothing jumps.
- Tapping an example fills the composer exactly, fires no `/api/parse-intent` or `/api/generate`
  request, and emits `planner:example-tap`.
- Users with recent tests keep today's recent-tests idle state — no gallery, no tip.
- English + Hindi copy in the same change; motion is CSS-only and disabled under `.reduce-motion`
  and `.data-saver`; rows keep 44px tap targets; E2E artifact updated.

## 2. Tech stack

SvelteKit 2 / Svelte 5 runes, Tailwind 4 + scoped component CSS and existing tokens. No new
runtime dependencies, no `svelte/transition` (the repo animates with CSS + `AnimatedHeight`
only). Vitest keeps the locale-parity test; Playwright E2E carries the behaviour.

## 3. States and triggers

The welcome gallery is a new state of the existing chat log:

```
showWelcome = recentTests.length === 0
           && !hasConversation
           && !planCard
           && !PARSING
           && status !== 'loading'
           && !plannerTyped
```

- `plannerTyped` lives in `HomePage` and is set by a new `ontyping` callback fired from the
  composer's real `oninput` handler (so programmatic fills never count). It resets when
  `intentValue === ''` and on Start over (`resetPlanner`).
- Returning users (recent tests exist) are untouched: `ChatThread` keeps rendering the recent
  list; the old "Try these" chips are deleted for everyone (the gallery replaces them).
- The greeting bubble is **static rendering only** — it is never appended to
  `plannerDraft.messages`, so the conversation protocol and its persistence are unaffected.

## 4. Composition

Inside the log, in order:

1. Assistant-style greeting bubble (`plannerWelcomeGreeting`): "Tell me what you want to practice
   — an exam, a school chapter or a skill. I'll draft the plan; you can tweak every part."
2. Three groups, each a small uppercase label plus two full-width tappable rows (44px minimum,
   same visual language as recent-test rows):
   - `plannerGroupExam` — SSC CGL general awareness practice · UPSC prelims polity — 15 questions
   - `plannerGroupSchool` — Class 10 CBSE Science: life processes · Hindi vyakaran: sangya aur sarvnam
   - `plannerGroupSkills` — 20 JavaScript array questions for interview prep · English grammar: tenses practice
3. Pinned below the log (above the composer, outside the scroll area): the tip
   `plannerWelcomeTip` — "💡 Add a level, count or language: “hard”, “20 questions”, “in Hindi”".

If the panel is shorter than the content (very short phones), the log scrolls; greeting, tip and
composer stay pinned. No new network calls.

## 5. Interaction and motion

- **Tap a row** → fills the composer with the localized sentence, does not submit, does not focus
  the input (no surprise keyboard), gallery stays visible; `planner:example-tap` fires. No preview
  may run from this fill: the live-preview `$effect` on `intentValue` (HomePage.svelte:704) is
  gated on `plannerTyped`, so only typed text previews. Without the gate a tap would commit a
  local topic, pop the plan card and wipe the gallery instantly — the opposite of the intent.
- **First typed character / paste** → gallery and tip are conditionally removed (instant, from the
  DOM, so a plan card that commits mid-typing lands at the top of the log). Entering the state
  fades in softly via a CSS keyframe; under `html.reduce-motion` / `html.data-saver` there is no
  animation. Previews resume on the first real edit of a tapped example.
- **Clear to empty** → gallery returns while no conversation or plan card exists.
- **Send** → unchanged planner turn.
- Panel height, header, composer, search overlay, Daily 5 and all network behaviour are unchanged.

## 6. Wiring

- `src/lib/client/ChatThread.svelte`: new props `welcome` (boolean) and `exampleGroups`
  (array of `{ labelKey, examples: [{ key, group, slot }] }`), replacing `examples`; greeting +
  groups render inside `.chat-log`, tip as a footer row; `onexample` now receives the example
  object and no longer submits.
- `src/lib/client/PlannerComposer.svelte`: new `ontyping` callback invoked from
  `handleIntentInput` (real input events only).
- `src/lib/client/pages/HomePage.svelte`: `plannerTyped` state, `showWelcome` derived, example
  group data, `handleExampleTap` (fill + `track`), reset points, and the preview `$effect` gate
  (`if (!plannerTyped) return;` after the timer clears) so programmatic fills never preview.

## 7. Copy (en / hi)

| Key | English | Hindi |
| --- | --- | --- |
| `plannerWelcomeGreeting` | Tell me what you want to practice — an exam, a school chapter or a skill. I'll draft the plan; you can tweak every part. | बताइए आप क्या अभ्यास करना चाहते हैं — कोई परीक्षा, स्कूल का पाठ या कोई स्किल। मैं योजना तैयार कर दूँगा, और हर हिस्सा आप बदल सकते हैं। |
| `plannerGroupExam` | Exam prep | परीक्षा की तैयारी |
| `plannerGroupSchool` | School & boards | स्कूल और बोर्ड |
| `plannerGroupSkills` | Skills & interviews | स्किल और इंटरव्यू |
| `plannerWelcomeExample1` | SSC CGL general awareness practice | SSC CGL सामान्य जागरूकता अभ्यास |
| `plannerWelcomeExample2` | UPSC prelims polity — 15 questions | UPSC प्रारंभिक परीक्षा: राजव्यवस्था — 15 प्रश्न |
| `plannerWelcomeExample3` | Class 10 CBSE Science: life processes | कक्षा 10 CBSE विज्ञान: जीवन प्रक्रियाएँ |
| `plannerWelcomeExample4` | Hindi vyakaran: sangya aur sarvnam | हिंदी व्याकरण: संज्ञा और सर्वनाम |
| `plannerWelcomeExample5` | 20 JavaScript array questions for interview prep | इंटरव्यू तैयारी: JavaScript array के 20 सवाल |
| `plannerWelcomeExample6` | English grammar: tenses practice | अंग्रेज़ी व्याकरण: काल (Tense) अभ्यास |
| `plannerWelcomeTip` | 💡 Add a level, count or language: “hard”, “20 questions”, “in Hindi” | 💡 स्तर, संख्या या भाषा जोड़ें: “कठिन”, “20 प्रश्न”, “अंग्रेज़ी में” |

Removed: `plannerExample1-3`, `welcomeTryThese` (both locales) and the `.example-chip` /
`.example-chips` styles.

## 8. Accessibility

- While the welcome state is showing, the log drops `role="log"` / `aria-live="polite"` so screen
  readers do not announce six rows on every reappearance; conversation states keep the live region.
- Each example row is a `<button>` whose accessible name is the sentence; group labels are plain
  decorative text; the tip is a normal paragraph above the composer.
- Rows keep the 44px minimum tap target; hover/active states match existing chips.

## 9. Failure modes (written before the code)

1. Gallery shows for a user with recent tests → regression test with a stubbed recent test.
2. Gallery does not hide on typing, or does not return when the field is cleared.
3. Tap submits a request, does not fill exactly (index/locale mapping wrong), or the programmatic
   fill triggers the live-preview effect (card/gallery flash).
4. Programmatic prefill counts as typing and wipes the gallery (tap would blink).
5. Gallery is announced by the live region on first load / reappearance.
6. Hindi copy missing or English leaking on `/hi`.
7. Hydration mismatch from SSR-rendered gallery (home is streamed SSR).
8. Panel height changes when the gallery appears/disappears (layout jump).
9. Motion plays under `reduce-motion` / `data-saver`.

## 10. Testing

E2E first (`tests/e2e/welcome-gallery.e2e.js`), stubbing `/api/user/history` and `/api/test` as the
existing planner suite does; evidence attached to `test-results/e2e-artifact.json`:

1. Empty history + `/` → greeting, 3 group labels, 6 rows, tip; no console errors (covers 5, 7).
2. One stubbed recent test → no gallery, recent rows as today (covers 1).
3. Tap an example → input value equals that sentence; no `/api/generate`, no `/api/parse-intent`;
   gallery still visible (covers 3, 4). The existing planner-calm suite guards that typed text
   still previews after the gate.
4. Type one character → gallery + tip removed; clear → they return (covers 2).
5. `/hi` → Hindi copy, no English leakage (covers 6).
6. Measure `.planner-panel` height before/after typing → unchanged (covers 8).
7. `localStorage.dataSaverMode = 'true'` before load → gallery renders but its computed
   `animation-name` is `none` (covers 9). Stable test hooks: `.welcome-gallery`,
   `.welcome-example`, `.welcome-tip`.

No new unit tests: the change is UI wiring, and the locale-parity test already fails on missing
keys. Layout/motion under `reduce-motion`/`data-saver` stays CSS-only (covered by class toggles).

Verification: `npm run lint`, `npm run test`, `npm run check`, `npm run test:e2e`, and
`npm run verify:vercel` (locale/i18n touched).

## 11. Telemetry

New allowlisted event `planner:example-tap` with `{ group: 'exam'|'school'|'skills', slot: 1|2 }`.
No view event (too noisy). The measurable path is tap → filled → `generate:start`; high taps with
flat generation means the copy is not landing. `telemetryEvents.test.js` keeps the allowlist and
emit sites honest in the same commit.

## 12. Boundaries

- Always: en + hi in the same change; 44px targets; browser APIs guarded; honest telemetry.
- Ask first: new runtime dependencies (none planned); API/schema changes (none planned).
- Never: bypass rate limits, render unsanitized model output, delete telemetry rows, break
  PWA/AdSense, append gallery content to `plannerDraft.messages`.

## 13. Out of scope

- Personalization / trending topics in the gallery (data-driven option was considered and parked).
- Moving Daily 5, Quick Start, or the full-exam entry into the panel.
- Typewriter animation; morphing the panel into the card (deferred earlier).
- Any change to conversation turns, settle rules, or search behaviour.

## 14. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Gallery content scrolls even at 390×844 | Med | Six rows + greeting + tip measured in E2E; trim tip or fourth row if not |
| Returning users lose the old "Try these" chips | Low | Deliberate: recent list is the useful pre-typing content for them |
| Tap-to-fill feels inert (no keyboard, no submit) | Low | Send stays enabled and visible; E2E asserts the exact filled value |
| Example copy ages (exams change) | Low | All copy is locale-keyed in one table, cheap to edit |
