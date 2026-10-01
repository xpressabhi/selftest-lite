# Conformance

## Outcome

As requested. Rendered markdown lists keep their markers: the statement-based
question from test 1822 now displays `1.` / `2.` / `3.` beside the statements,
so the combination options refer to visible numbers. The fix is scoped to
`.markdown-content` in `MarkdownContent.svelte` and applies to the test card,
results review, print view, and explanations. Stored and generated question
text is unchanged; existing tests need no regeneration.

## Verification

| Check | Result |
| ----- | ------ |
| Browser diagnostic (stored test 1822 question) | Before: `listStyleType: none`, `paddingLeft: 0px`; after: `decimal`, `24px` |
| `npm run lint` | Pass |
| `npm run test` | Pass — 71 files, 831 tests |
| `npm run check` | Pass — build-mode check OK |
| `npm run test:e2e` | Pass — 157/157, including marker assertions in the Hindi and English statement scenarios |

## Test changes

- `tests/e2e/question-formats.e2e.js` — modified as declared: both statement
  scenarios now assert computed `listStyleType === 'decimal'` and a positive
  indent on the statement list.

## Deviations and decisions

- None material. The fix intentionally lives at the markdown renderer scope,
  which also restores markers for any other rendered list content; no
  component-specific list styling was touched.

## Approval constraints

Not required (`review.required: false`); no review evidence recorded.
