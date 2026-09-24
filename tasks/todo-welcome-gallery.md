# Welcome gallery — task list

- [x] 1. E2E specs first: `tests/e2e/welcome-gallery.e2e.js` (7 cases + evidence)
- [x] 2. Locale keys: 11 new en + hi strings (spec §7)
- [x] 3. ChatThread: `welcome`/`exampleGroups` props, greeting + groups + tip, aria-live gating, remove old chips + `plannerExample1-3`/`welcomeTryThese`
- [x] 4. PlannerComposer `ontyping` + HomePage `plannerTyped`/`showWelcome`/tap handler/preview gate + `planner:example-tap` allowlist
- [x] 5. Make E2E green; full suite + artifact
- [x] 6. `npm run lint` + `npm run test` + `npm run check` + `npm run test:e2e` + `npm run verify:vercel`; manual 390×844 + data-saver; small conventional commits

Notes:
- Hydration: the dev-server home page is streamed SSR, so tests must wait for
  `__svelte_meta` before typing (`waitForHydration` in the new suite).
- Fold at 390×844: log is 352px, gallery ~420px after tightening (greeting 2 lines,
  10px group gap, 4px inner gap). First four examples above the fold; the last group
  is a short scroll. Six 44px tap targets cannot fit 352px.
- Typed state is derived from the composer value, not from input events: a value that was
  already in the field when hydration finished counts as typed, and only gallery fills are
  exempt (`galleryFill` flag gates the preview effect). `PlannerComposer` is unchanged.
