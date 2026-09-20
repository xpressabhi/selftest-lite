## Task 1: Challenge URL + compare block
**Description:** Results `shareResult` appends `ch` (score) and `by` (name, 24 chars) to the shared test URL; results page parses `ch`/`by` from `page.url` and renders a compare block (you vs challenger, win/lose/draw + challenge-back button). EN+HI strings. Invalid params → no block, no error.
**Acceptance criteria:**
- [ ] Shared URL opens test; friend's results show compare only when params valid
- [ ] Challenge-back shares friend's own score URL
- [ ] All new copy in EN+HI
**Verification:**
- [ ] Tests pass: `npm run test`
- [ ] Manual check: two-device flow (share → take → compare renders)
**Dependencies:** None
**Files likely touched:**
- `src/routes/results/+page.svelte`
- `src/lib/locales/english.json`, `src/lib/locales/hindi.json`
**Estimated scope:** Small: 1-2 files (+locales)

## Task 2: Canvas card module + helper tests
**Description:** New `src/lib/client/scoreCard.js` with pure `stripCardText`/`clampCardLines` plus `drawScoreCard(canvas, data)` painting 1080x1920 (brand, score hero + ring arc, topic, stats, CTA + link or no-link variant). Unit tests for the pure helpers.
**Acceptance criteria:**
- [ ] Helpers handle markdown, long topics, Hindi text without throwing
- [ ] Draw fn degrades gracefully (missing topic/score → sensible defaults)
**Verification:**
- [ ] Tests pass: `npx vitest run src/lib/client/scoreCard.test.js`
**Dependencies:** None
**Files likely touched:**
- `src/lib/client/scoreCard.js`
- `src/lib/client/scoreCard.test.js`
**Estimated scope:** Small: 1-2 files

## Checkpoint: After Tasks 1-2
- [ ] Focused tests pass, lint clean

## Task 3: Card button + share wiring + telemetry
**Description:** "Card" button beside Share on results; generates PNG via canvas `toBlob`, shares with `navigator.share({files})` falling back to download; adds `results:share-card`, `results:challenge-accept`, `results:challenge-view` to allowlist with emit sites (accept on mount with `ch` param, view when block renders).
**Acceptance criteria:**
- [ ] Share sheet on mobile, download fallback on desktop
- [ ] Telemetry test passes (keys + emit sites same commit)
- [ ] No layout shift in the results button row
**Verification:**
- [ ] Tests pass: `npm run test`
- [ ] Build succeeds: `npm run check`
- [ ] Manual check: Hindi paper card, local-only paper card (no link row)
**Dependencies:** Tasks 1-2
**Files likely touched:**
- `src/routes/results/+page.svelte`
- `src/lib/shared/telemetryEvents.js`
**Estimated scope:** Small: 1-2 files

## Checkpoint: Complete
- [ ] `npm run lint`, `npm run check`, `npm run test` pass
- [ ] Ready for review (no commit until user approves — standing instruction)
