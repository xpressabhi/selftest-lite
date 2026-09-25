# Todo: Share Cards

## Task 1: `cardKit.js` + unit tests (tests first)
**Description:** New `src/lib/client/cardKit.js`: `CARD_WIDTH`/`CARD_HEIGHT` (1080×1920), pure `shareCardText(caption, url)` (URL on its own line, no duplication, trims) and `cardFilename(kind)` (`selftest-streak.png` / `selftest-test.png` / `selftest-score.png`), plus browser helpers `loadCardLogo()` (cached `/icons/192.png`, resolves null on failure), `drawCardLogo(ctx, logo, {x,y,size})` (rounded clip + line border), `canvasToFile(canvas, filename)` (PNG File or null), `shareCardFile(file, {title,text,url})` returning `shared | downloaded | cancelled | failed` (AbortError → cancelled). Write the pure tests first, then implement.
**Acceptance criteria:**
- [ ] `shareCardText` appends URL on a new line, leaves a caption that already contains it unchanged, trims, handles empty caption/url
- [ ] `cardFilename` maps the three kinds and falls back safely
- [ ] `shareCardFile` downloads when file share is unavailable and returns `cancelled` on AbortError
- [ ] `loadCardLogo` never rejects; `drawCardLogo` no-ops without a logo
**Verification:**
- [ ] Tests pass: `npx vitest run src/lib/client/cardKit.test.js`
- [ ] Tests pass: `npm run test`
**Dependencies:** None
**Files likely touched:**
- `src/lib/client/cardKit.js`
- `src/lib/client/cardKit.test.js`
- `src/lib/client/scoreCard.js` (import constants)
**Estimated scope:** Small: 3 files

## Task 2: `streakCard.js` renderer
**Description:** `drawStreakCard(canvas, data, logo)` painting the approved streak card: app-token gradient background, logo top-center, flame, "N-day test streak" hero + subtitle, rolling 7-day balls with connectors and today ring, 4 stats, badge row with progress, URL line, footer. Uses `wrapCardText` where needed and the token hex palette in a commented map. Returns false without a 2D context.
**Acceptance criteria:**
- [ ] Renders all data passed (week cells, stats, badges, labels, url); no hardcoded user copy
- [ ] Level 1/2/3 ball colors, connectors and today ring match the in-app card
- [ ] Long subtitles/badge titles stay inside the 1080px width
**Verification:**
- [ ] Build succeeds: `npm run check`
- [ ] Manual check: dev server draw via the share button once Task 5 lands
**Dependencies:** Task 1
**Files likely touched:**
- `src/lib/client/streakCard.js`
**Estimated scope:** Small: 1 file

## Task 3: `testCard.js` renderer
**Description:** `drawTestCard(canvas, data, logo)` painting the test card: logo, localized kicker, wrapped topic, chips (question count, difficulty, language), CTA + sub-line, URL, footer. Same palette and helpers as Task 2.
**Acceptance criteria:**
- [ ] Topic wraps to capped lines; chips stay on one row for normal values
- [ ] All strings come from `data` (localized by the caller)
- [ ] Returns false without a 2D context
**Verification:**
- [ ] Build succeeds: `npm run check`
**Dependencies:** Task 1
**Files likely touched:**
- `src/lib/client/testCard.js`
**Estimated scope:** Small: 1 file

## Task 4: Restyle `scoreCard.js`
**Description:** Move `drawScoreCard` to the family palette (brand-50→white→surface-muted background, indigo ring on brand-100 track, dark text, URL in brand-600) and add the logo parameter. Keep `stripCardText`/`wrapCardText` exports and the existing data API; constants now come from `cardKit.js`.
**Acceptance criteria:**
- [ ] Same data fields render as today, restyled; logo drawn when provided
- [ ] Existing `scoreCard.test.js` still passes unchanged
**Verification:**
- [ ] Tests pass: `npm run test`
- [ ] Build succeeds: `npm run check`
**Dependencies:** Task 1
**Files likely touched:**
- `src/lib/client/scoreCard.js`
**Estimated scope:** Small: 1 file

## Checkpoint: After Tasks 1-4
- [ ] Unit suite green; all renderers compile in the build

## Task 5: Streak share button
**Description:** In `StreakCard.svelte`, add a 44px share icon button in the head row beside the flame, rendered only when `currentStreak >= 1`. Tap: emit `streak:share`; build week/badges/stats/labels; `loadCardLogo` → `drawStreakCard` → `canvasToFile(cardFilename('streak'))` → `shareCardFile` with `window.location.origin`; toast `streakCardSaved` on download and `cardShareFailed` on failure. Add EN+HI keys `shareStreakText`, `streakCardSaved`, `cardShareFailed` and the `streak:share` allowlist entry. Extend `streak-home.e2e.js`: button absent at 0 streak; with a streak, one tap yields a file share whose text contains the URL; download fallback fires when share is unavailable.
**Acceptance criteria:**
- [ ] Button hidden for a 0-day streak; visible and keyboard focusable otherwise
- [ ] Share call carries one PNG file and text containing the direct URL
- [ ] Fallback download + toast when `navigator.share` is missing; cancel does not toast
- [ ] `streak:share` allowlisted in the same commit as the emit
**Verification:**
- [ ] Tests pass: `npx playwright test tests/e2e/streak-home.e2e.js`
- [ ] Tests pass: `npm run test` (telemetry allowlist scan)
**Dependencies:** Tasks 1-2
**Files likely touched:**
- `src/lib/client/StreakCard.svelte`
- `src/lib/locales/english.json`, `src/lib/locales/hindi.json`
- `src/lib/shared/telemetryEvents.js`
- `tests/e2e/streak-home.e2e.js`
**Estimated scope:** Medium: 5 files

## Task 6: Test page share upgrade
**Description:** Replace `shareTest()` link-only share with the image pipeline: `loadCardLogo` → `drawTestCard` (topic, count, difficulty, language, localized kicker/CTA/sub) → `canvasToFile(cardFilename('test'))` → `shareCardFile` with `/test?id=…`; keep `test:share`; toast `testCardSaved` / `cardShareFailed`. Add EN+HI keys `shareTestText`, `shareTestKicker`, `shareTestCta`, `shareTestCtaSub`, `testCardSaved`. New `tests/e2e/share-cards.e2e.js` seeds a paper, stubs share, clicks the summary Share button, and asserts one file share whose text contains the `/test?id=` URL.
**Acceptance criteria:**
- [ ] Shared text contains the recipient-openable `/test?id=` URL and the file is a PNG
- [ ] Copy is localized in both languages
- [ ] No behavior change when the paper is missing (early return)
**Verification:**
- [ ] Tests pass: `npx playwright test tests/e2e/share-cards.e2e.js`
- [ ] Tests pass: `npm run test`
**Dependencies:** Tasks 1, 3
**Files likely touched:**
- `src/routes/test/+page.svelte`
- `src/lib/locales/english.json`, `src/lib/locales/hindi.json`
- `tests/e2e/share-cards.e2e.js`
**Estimated scope:** Medium: 4 files

## Task 7: Results share card via kit
**Description:** `shareCard()` uses `loadCardLogo` + restyled `drawScoreCard` + `canvasToFile` + `shareCardFile`, with the URL in the share text; success toast stays `cardSaved`, failure uses `cardShareFailed`. Update `results-hero.e2e.js` stub to capture the share payload and assert the card share text contains the challenge URL.
**Acceptance criteria:**
- [ ] Score card renders the new family style with the logo
- [ ] Card share text contains the challenge URL; existing sheet behavior unchanged
- [ ] Results e2e green with the payload assertion
**Verification:**
- [ ] Tests pass: `npx playwright test tests/e2e/results-hero.e2e.js`
- [ ] Tests pass: `npm run test:e2e`
**Dependencies:** Tasks 1, 4
**Files likely touched:**
- `src/routes/results/+page.svelte`
- `tests/e2e/results-hero.e2e.js`
**Estimated scope:** Small: 2 files

## Checkpoint: Complete
- [ ] `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e` all green
- [ ] Artifact inspected: share evidence present, `gitDirty: false`, byte-stable across two clean runs
- [ ] Pushed to `origin/main`
