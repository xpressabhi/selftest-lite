## scope.included

- Rendered markdown ordered and unordered lists keep markers and indentation.
- E2E regression assertions for statement-question list markers.

## scope.excluded

- Question text, stored data, generation, and component-specific list styling.

## preserved

- Markdown text, sanitization, math/code/table handling, and non-list rendering stay unchanged.

## decisions

- Fix at the MarkdownContent scope so test, review, print, and explain views restore markers together.
- Use explicit decimal/disc markers with 1.5rem indent and a small li margin for predictable mobile layout.
- No regeneration needed: stored question text already contains the numbering.

