# Change intent

## Request and outcome

Statement-based questions must show their statement numbers. Test 1822
(stored correctly with `1.` / `2.` / `3.` statements) rendered the statements
without numbers, so options like "1 and 2" had no visible referents.

## Context

- Tailwind's preflight resets `ol` / `ul` to `list-style: none; margin: 0;
  padding: 0`. `MarkdownContent.svelte` had no list rules, so every rendered
  markdown list lost its markers.
- Browser diagnostic on the exact stored question from test 1822:
  `getComputedStyle(ol).listStyleType === 'none'`, `paddingLeft === '0px'`,
  while the DOM contained `<ol>` with three `<li>`s.
- The fix is CSS-only; stored and generated question text is unchanged, so
  existing tests (1822 and others) render correctly without regeneration.

## Scope

### Included

- Restore list markers and indentation inside `.markdown-content` for ordered
  and unordered lists.
- E2E regression assertion that statement questions render `decimal` markers
  with non-zero indent.
- This change record.

### Excluded

- Changing stored or generated question text; regenerating existing tests.
- Styling lists outside rendered markdown (component-specific lists keep their
  own rules).

## Preserved behavior

- Markdown text, sanitization, KaTeX/code/table handling, and all non-list
  rendering are unchanged.
- No data, API, telemetry, or locale changes.

## Test changes

- `tests/e2e/question-formats.e2e.js` — modified — add the marker/indent
  regression assertion to both statement-paper scenarios.

## Decisions and constraints

- Fix at the `MarkdownContent` scope so the test card, results review, print
  view, and explanations all restore markers together.
- Use explicit `decimal` / `disc` markers with 1.5rem indent and a small
  `li` margin instead of `revert`, keeping the mobile layout predictable.

## Verification

- Browser diagnostic on the stored test 1822 question: `listStyleType` none →
  decimal, `paddingLeft` 0px → 24px.
- `npm run lint`, `npm run test`, `npm run check` pass.
- `npm run test:e2e` passes, including the new assertions in both languages.
