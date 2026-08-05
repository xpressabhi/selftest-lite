# Pretext Animation Implementation Plan

## Objective

Use [`@chenglou/pretext`](https://github.com/chenglou/pretext) as a text-geometry layer for smoother Selftest-lite animations. Pretext will measure and predict text layout; Svelte and CSS will continue to control the actual animations.

The initial scope covers:

1. Question-card transitions.
2. Generated-explanation reveals.
3. English/Hindi layout transitions.

## Design principles

- Use Pretext for plain text measurement, not as a Markdown or visual rendering engine.
- Keep Markdown, KaTeX, and Mermaid rendering in the existing pipeline.
- Use `prepare()` once per text/font combination and `layout()` for cheap width-dependent recalculation.
- Animate explicit pixel heights, then restore `height: auto` after the transition.
- Correct estimated heights after asynchronous rich content renders.
- Respect `.reduce-motion`, `.data-saver`, and `prefers-reduced-motion`.
- Preserve semantic HTML and accessibility; visual line animation must not hide content from assistive technology.
- Use named fonts such as `Inter` when accuracy matters.

## Proposed architecture

```text
Question / explanation text
            |
            v
pretextLayout.js
  - client-only import
  - font readiness
  - prepared-text cache
  - width-based layout measurement
            |
            v
AnimatedHeight.svelte
  - explicit height transition
  - ResizeObserver correction
  - reduced-motion fallback
            |
            v
Svelte page + CSS motion
```

## Phase 1: Define measurement boundaries

Document which content can be measured accurately:

- Plain question text and answer options: suitable for Pretext.
- Markdown headings, lists, code blocks, and inline formatting: use Pretext as an estimate only.
- KaTeX and Mermaid: use post-render DOM measurement correction.
- Padding, borders, margins, buttons, and gaps: calculate outside Pretext.

The final rendered result must always be treated as authoritative for rich content.

## Phase 2: Add the measurement utility

Create:

`src/lib/client/pretextLayout.js`

Responsibilities:

- Dynamically import `@chenglou/pretext` on the client.
- Wait for `document.fonts.ready` before preparing text.
- Cache prepared text by content, font, and relevant options.
- Expose a small API such as:

```js
prepareText(text, font, options)
measureText(prepared, width, lineHeight)
clearTextMeasurementCache()
```

- Return a safe fallback when Canvas or `Intl.Segmenter` is unavailable.
- Avoid DOM reads inside the resize/layout hot path.

## Phase 3: Build reusable height animation

Create:

`src/lib/client/AnimatedHeight.svelte`

Required behavior:

- Start from the current measured height.
- Animate to an explicit target height.
- Set `height: auto` after the transition completes.
- Use `ResizeObserver` to correct the target when Markdown, KaTeX, or Mermaid changes the final size.
- Skip or simplify transitions when reduced motion or data saver mode is active.
- Avoid clipping focus rings and interactive controls during the transition.

## Phase 4: Animate question-card changes

Update:

`src/routes/test/+page.svelte`

Implementation sequence:

1. Detect whether navigation is forward, backward, or a direct question jump.
2. Prepare and measure the incoming question and its options.
3. Freeze the card wrapper at its current height.
4. Fade and translate the outgoing content.
5. Swap the question state.
6. Animate the wrapper to the incoming height.
7. Fade and translate the incoming content from the navigation direction.
8. Restore automatic height.

Acceptance criteria:

- No visible layout jump when moving between short and long questions.
- No horizontal overflow at 320px width.
- Answer selection and keyboard behavior remain unchanged.
- Screen readers receive the new question as normal semantic content.

## Phase 5: Animate generated explanations

Update:

`src/routes/results/+page.svelte`

Implementation sequence:

1. Replace the abrupt loading state with a measured skeleton or reserved content area.
2. Fetch the explanation as before.
3. Insert the Markdown content into the existing renderer.
4. Use `ResizeObserver` after rendering to obtain the final rich-content height.
5. Animate from the reserved height to the final height.
6. Do not animate error messages as if they were successful explanations.

The rendered explanation must remain accessible immediately; only its visual container should animate.

## Phase 6: Animate language changes

When switching between English and Hindi:

- Measure old and new text heights where practical.
- Animate cards, labels, and controls between those heights.
- Keep all new user-facing strings in:

  - `src/lib/locales/english.json`
  - `src/lib/locales/hindi.json`

- Test mixed-script questions and long Hindi labels.

## Phase 7: Verification

Run the repository checks:

```bash
npm run lint
```

Also verify:

- 320px mobile layout.
- Desktop layout.
- Slow 3G and data-saver mode.
- `prefers-reduced-motion: reduce`.
- Light and dark themes.
- Long questions and options.
- Markdown lists and code blocks.
- KaTeX formulas.
- Mermaid diagrams.
- Emoji, Hindi, Arabic, CJK, and mixed-script content.
- Browser console for hydration or resize-loop errors.

## Recommended delivery order

1. Measurement utility and fallback behavior.
2. `AnimatedHeight.svelte` with isolated tests.
3. Question-card height transition.
4. Explanation reveal and rich-content correction.
5. Language-switch transitions.
6. Performance and accessibility hardening.

## Success criteria

The integration is successful when:

- Question changes feel smooth without introducing layout shift.
- Explanations expand naturally after asynchronous generation.
- Rich Markdown content settles without visible snapping.
- Reduced-motion users see minimal or no motion.
- The resize path does not repeatedly trigger DOM layout measurement.
- Low-end and slow-network experiences remain responsive.

## Out of scope for the first iteration

- Replacing the Markdown renderer.
- Animating every individual word or grapheme.
- Canvas-only rendering of quiz content.
- Full virtualization of the results page.
- Automatic hyphenation or a complete CSS inline-layout engine.

