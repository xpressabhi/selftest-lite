# Conformance

## Change and intent

- Change: `CHG-0002` — Silence remaining Svelte compiler warnings.
- Proposal: `proposal.md`, revision 1, digest
  `sha256:544defec9f525987b0abf13bf5cea263b4884b11935e9d972f87fba42b2a5ed3`.
- Approval: not required (`review.required: false`); no review evidence recorded.

## Outcome

As requested. `npx vite build` prints zero `[vite-plugin-svelte]` warnings: the SSR
language pin reads through `untrack`, the three dead CSS selectors are deleted, the
recent-list pointer wrapper carries `role="presentation"`, and the toast's intentional
`tabindex` is documented with a `svelte-ignore` (focus still pauses the auto-dismiss
timer and Escape still dismisses). No rendered output, copy, or interaction changed.

## Verification evidence

| Check | Result |
| ----- | ------ |
| `npx vite build` | Zero `[vite-plugin-svelte]` warnings |
| `npm run lint` | Pass |
| `npm run test` | Pass — 69 files, 806 tests |
| `npm run check` | Pass — build-mode check OK (193 chunks, no DEV-only code) |
| `npm run test:e2e` | Pass — 155/155 |
| `npm run verify:vercel` | Pass — 236 sitemap URLs, 232 prerendered pages |

## Material deviations and decisions

- None. The toast warning is silenced with a documented ignore by design: the container
  is deliberately focusable so keyboard users can pause the timer and dismiss with
  Escape; removing `tabindex` would trade a real affordance for a compiler warning.

## Declared test changes

None; new files only are the CHG-0002 record itself.

## Assumptions

- The removed selectors were dead in the current markup (verified by the compiler and by
  the full e2e suite rendering the layout, mobile menu, and recent list unchanged).
