## scope.included

- The layout, ChatThread, and Toast warning sites are clean under vite build.

## scope.excluded

- Any visual, interaction, copy, API, or dependency change.

## preserved

- Toast focus/Escape behavior and all rendered output stay identical.
- No pre-existing test is modified, skipped, or deleted.

## decisions

- The toast keeps tabindex with a documented svelte-ignore instead of losing the keyboard affordance.
- Dead CSS selectors are deleted, not kept for hypothetical states.

