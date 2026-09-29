# Change intent

> Keep routine changes short. Add detail only when complexity, risk, ambiguity, or repository policy needs it.

## Request and outcome

The local dev server no longer prints the six Svelte compiler warnings that predate
CHG-0001: the layout's intentional SSR language pin and three dead CSS selectors, the
recent-list pointer wrapper in ChatThread, and the toast's deliberate tabindex. Building
the app produces no `[vite-plugin-svelte]` output, with behavior and copy unchanged.

## Context

Warnings seen while running `npm run dev` on port 5173 after the welcome-tour work
(CHG-0001 had already removed the four warnings the tour itself introduced):

- `+layout.svelte:45` — `state_referenced_locally` on the SSR-only `data?.lang` read.
- `+layout.svelte:928/995/999` — three unused CSS selectors; no element ever combines
  `.header-icon` with `.active`, and the only `class:active` sites are the bottom-nav
  links, which never match `.mobile-menu button.active`.
- `ChatThread.svelte:147` — `.recent-block` has `onpointerdown` without an ARIA role.
- `Toast.svelte:157` — a non-interactive toast container with `tabindex="0"`,
  which is intentional: focus pauses the auto-dismiss timer and Escape dismisses it.

## Scope

### Included

- `untrack()` around the deliberate server-side language pin.
- Remove the three dead selectors.
- `role="presentation"` on the recent-list pointer wrapper.
- A documented `svelte-ignore` for the toast's focusable container.

### Excluded

- Any visual, copy, interaction, API, or dependency change.
- Reworking the toast's keyboard model (the container stays focusable on purpose).

## Preserved behavior

Existing behavior and pre-existing tests remain unchanged. The toast keeps pausing on
focus and dismissing on Escape; the layout, mobile menu, and recent list render
identically.

## Test changes

None.

## Decisions and constraints

- The toast keeps its `tabindex` because focus pauses the auto-dismiss timer and Escape
  dismisses it; the warning is silenced with a documented ignore rather than removing a
  keyboard affordance for a compiler warning.
- Dead selectors are deleted rather than kept for hypothetical future states.

## Verification

- `npx vite build` prints zero `[vite-plugin-svelte]` warnings.
- `npm run lint`, `npm run test`, `npm run check`, `npm run test:e2e`, and
  `npm run verify:vercel` pass.
