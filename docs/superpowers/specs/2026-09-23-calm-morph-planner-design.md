# Calm Planner — Settle, Coexistence, Keyboard Tiers (Design)

Date: 2026-09-23
Status: approved (mockups reviewed at phone width, keyboard-open mockups approved)
Scope: make the home planner's live previews stop flickering, keep the search lane and the
planner lane independent, and make the plan card usable in the keyboard-halved viewport.
No API, schema, or dependency changes.

## 1. Objective

The home planner already previews a plan while the user types (`livePreview.js` Tier 0,
`/api/parse-intent` preview Tier 1). Today every preview result is applied immediately, so topic
spans, difficulty and counts morph on every keystroke, and the card can change while the user is
still deciding. This design introduces a settle layer (ported from ShapeShift's calm-UI idea,
adapted to per-field rules), keeps past-test search visibly independent, and adds viewport tiers so
the plan card stays useful when the mobile keyboard covers ~half the screen.

Success criteria:

- A preview value only reaches the card when it wins twice in a row, is strongly evidenced, or the
  text direction makes it an explicit edit. Alternating candidates never commit.
- The user-edited (`explicit`) fields are never overwritten by previews (unchanged behaviour).
- Search results (keyword or test ID) and the plan card update independently; neither suppresses,
  disables or hides the other, and numeric queries never trigger planner previews.
- The overlay shows the planner: a plan-status row plus an always-visible "plan a new test" action.
- The plan card degrades to dense/micro tile tiers so topic, status and Generate stay visible when
  the visual viewport is halved by the keyboard.
- Performance: no new dependencies; animations are CSS transitions disabled under `.reduce-motion`
  and `.data-saver`; no extra network calls (the settle tick is local-only).
- Full English + Hindi strings for every new UI text; E2E artifact updated.

## 2. Tech stack

- SvelteKit 2 / Svelte 5 (runes), Tailwind 4 + scoped component CSS, existing design tokens.
- TypeSafe Jev via `/api/parse-intent` (unchanged), deterministic lexicon Tier 0 (unchanged).
- Vitest for the pure settle module (failure-modes-first), Playwright E2E for every user-visible
  behaviour. No new runtime dependencies.

## 3. Settle algorithm (`src/lib/client/previewSettler.js`)

Pure module, no Svelte imports, JSDoc, exported constants. Holds per-field state:

```
{ value, lastText, challenger: { value, wins } }
```

Fields: `topic`, `testType`, `difficulty`, `numQuestions`, `language`, `examId`.

API:

- `createSettleState()` — empty state.
- `settlePreview(state, { source, text, candidates, explicit })` → `{ state, committed, held,
  changedFields, status }` where `candidates` is `{ field: { value, strong } }`.
- `candidatesFromLocal(local)` / `candidatesFromPlan(plan, fieldConfidence)` — adapters.
- `resetSettleState()`.
- `SETTLE_TICK_MS` constant (400ms) used by HomePage's quiet re-check.

Resolution order per field:

1. Explicit lock → field skipped entirely.
2. Candidate absent → keep the committed value (silence is not evidence).
3. Candidate equals committed → clear challenger, refresh `lastText`.
4. Strong evidence → commit immediately. Strong = local lexicon hit on an explicitly mentioned
   field, a user-written question count, or Jev `fieldConfidence[field] >= 0.85`.
5. Topic direction rules:
   - append growth (`candidate` starts with `committed + ' '`) → commit immediately;
   - shrink while the text is shrinking (backspace) → commit immediately;
   - shrink while typing forward → not enough on its own.
6. Challenger: same candidate wins on two consecutive results → commit. Alternating candidates
   reset the win count.
7. `settle` status is `settling` while any field has a pending challenger; `ready` otherwise.

HomePage re-runs the local preview once after 400ms of quiet when a challenger is pending; that
supplies the second win without a network call. Continuous typing cancels the tick.

Failure modes (written first, tested in `previewSettler.test.js`):

1. A single ambiguous result never changes a committed value.
2. `A B A B` never commits `B`; two consecutive `B`s do.
3. Explicit lock beats strong evidence.
4. Absent and malformed candidates never throw and never clear.
5. Backspace-shrink commits; forward-typing shrink does not.
6. Append growth commits immediately.
7. A settle tick resolves a pending challenger.
8. Turn results bypass the settler and clear challenger state.
9. Question-count clamps and exam default-count coupling stay intact.
10. `settling` is never reported when nothing is contested.

## 4. Wiring

- `HomePage.svelte`: `applyLocalPreviewFor()` and `runPlannerPreview()` build candidates and apply
  only the committed output (existing field assignments stay, now gated). `applyPlannerPlan` remains
  for authoritative turn results and resets the settle state. Settle state is ephemeral (not
  persisted). Reset points: turn success, `resetPlanner`, explicit tile/chip edits (clear that
  field's challenger), and `handleTestNavigate` (also cancels in-flight previews).
- `lastTopicSource` / `lastFieldConfidence` describe committed values only.
- `PreviewCard.svelte`: new `settling` and `changedFields` props; `draft` styling becomes the
  settling state; a committed field gets a one-shot highlight pulse.
- `plannerState.js` is unchanged; `explicit` is read as-is.

## 5. Search × planner coexistence

Surfaces: plan card in the thread; search strip above the composer (one row in dense/micro);
overlay on search tap (fits the remaining visual viewport, sticky footer). Rules:

1. Numeric query → search owns the input: no preview, no settle tick; exact-match chip; Enter opens.
2. Keyword ≥4 chars → both lanes run; search (350ms) and preview (900ms) debounces stay independent;
   failures are isolated (search 429 row vs preview 5s pause).
3. Overlay footer (always visible, matches or not): plan-status row (topic · count · Draft/Ready)
   and a plan action (`plannerGenerateNew` style) that submits the current query as a planner turn.
4. Enter = plan, tap = open. ArrowDown focuses results; Enter opens the focused result; Escape
   returns focus to the input.
5. Navigation cancels previews and resets settle state.
6. Announcement discipline: commits are rare now, so the thread's `role="log"` live region no
   longer narrates every keystroke; the strip's debounced count announcement stays.
7. Data saver: strip hidden (existing), overlay available, no pulses/transitions.

## 6. Keyboard viewport tiers

Measured from `window.visualViewport?.height ?? window.innerHeight` via
`src/lib/client/viewportTier.js` (`tierForHeight(h)` pure: `<360px` → `micro`, `<480px` → `dense`,
else `full`). HomePage passes the tier to `PreviewCard`; `PlannerComposer` uses it for the strip.

- **full** — current card (58px tiles, labels, reassurance line).
- **dense** — tighter padding, radius and gaps, one type step down, reassurance line dropped;
  tiles keep a **44px** minimum height (tap-target rule), so everything stays visible (topic,
  status, all four tiles, Generate).
- **micro** — padding/fonts step down again, tile labels hidden (each tile keeps its localized
  `aria-label`), the Generate subtitle drops, strip shows one chip; tiles still keep the 44px
  tap target.
- Tiles never disappear; the tier change is a single CSS transition, instant under
  `.reduce-motion` / `.data-saver`.
- E2E emulates keyboard-open by setting viewport sizes (390×844 full, 390×420 dense, 390×300 micro).

## 7. UI choreography

CSS-only (no motion dependency): the settling state is a dashed edge, a 45%-opacity accent bar and
a "Refining — keeping your last values" note; a committed field gets a 600ms tile pulse; the tier
change transitions padding/type scale with the app's cubic-bezier easing. All transitions are
skipped under `.reduce-motion` / `.data-saver`. The sticky overlay footer keeps the plan status and
the plan action visible while results scroll. Readiness-weighted elevation and spring physics can be
layered later via `svelte/motion` (part of Svelte, not a new dependency) if the CSS feel is not
enough.

## 8. Telemetry

No new events. `intent:preview` gains `settled` (boolean) and `heldFields` (count) metadata so
commit/held rates are visible in `npm run telemetry:report`; `search:submit` gains the
`overlay-footer` source. The allowlist scan (`npm run test`) is unaffected because event names are
unchanged.

## 9. Testing

- E2E first (`tests/e2e/planner-calm.e2e.js`): no-fragment typing (MutationObserver topic log),
  settle hold + strong-evidence commit, search strip and plan card visible simultaneously, numeric
  query with zero preview requests and an untouched card, overlay footer + plan status, density
  tiers at the three viewport sizes. Evidence attaches to `test-results/e2e-artifact.json`.
  Reduce-motion and data-saver behaviour stays CSS-only, covered by the existing class toggles.
- Isolated unit tests for the settle module only, failure modes listed above, written before the
  module. No after-the-fact unit tests.

## 10. Boundaries

- Always: en + hi strings in the same change; telemetry allowlist stays honest; browser APIs guarded;
  `npm run lint`, `npm run test`, `npm run check`, `npm run test:e2e` green before finishing.
- Ask first: new runtime dependencies (none planned), API/schema changes (none planned).
- Never: bypass rate limits, render unsanitized model output, delete telemetry rows, break
  PWA/Adsense requirements, overwrite explicit user edits.

## 11. Out of scope

- One-shell morph (composer growing into the card) — explicitly deferred.
- Reworking the conversational turn flow or `plannerState` protocol.
- Changeless summary/see-all chip in the strip (candidate follow-up).
- Spring physics via a motion library.

## 12. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Settle rules starve the card (nothing commits) | Med | Settle tick + strong-evidence paths; E2E asserts final commit |
| Tier thresholds misfire across browsers | Med | Measure visual viewport; E2E covers three sizes |
| Extra tick causes preview churn | Low | Local-only, cancelled on keystroke, only when a challenger exists |
| i18n drift (new strings) | Low | Locale parity test in `npm run test` |
