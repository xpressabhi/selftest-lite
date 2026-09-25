# Share Cards — Design

Date: 2026-09-25
Status: approved (brainstorm; palette synced to app tokens, family mockups approved)
Scope: streak, test and score share cards plus a shared canvas/share kit. No QR codes, no square variant, no dynamic OG images (backlog).

## 1. Decisions

- Every share instance produces its own **1080×1920 PNG** and shares it directly (no sheet on streak/test; results keeps its existing sheet).
- One **card family look**: app light-theme tokens (brand-50 wash → white → surface-muted, indigo links/actions, slate text) with amber reserved for streak language. Score card is restyled to match.
- The **app icon** (`static/icons/192.png`) is drawn as the logo on every card; a failed logo load degrades to a logo-less card, never a blocked share.
- Every card prints its **direct URL**; every share **text message contains the same URL** so it is clickable. When files are attached the URL rides in `text` (some platforms drop a separate `url` field with files).
- Results page link share and share sheet stay as they are.

## 2. Shared kit — `src/lib/client/cardKit.js` (new)

- `CARD_WIDTH` / `CARD_HEIGHT` (1080×1920) move here; `scoreCard.js` imports them.
- `loadCardLogo()` → `Promise<HTMLImageElement | null>`; loads `/icons/192.png` once, resolves `null` on any failure.
- `drawCardLogo(ctx, logo, { x, y, size })` — rounded tile with a `--line` border; no-op when `logo` is null.
- `canvasToFile(canvas, filename)` → `File | null` (PNG via `toBlob`).
- `shareCardText(caption, url)` — pure: trims, appends the URL on its own line; if the caption already contains the URL, returns it unchanged.
- `cardFilename(kind)` — `selftest-streak.png`, `selftest-test.png`, `selftest-score.png`.
- `shareCardFile(file, { title, text, url })` → `'shared' | 'downloaded' | 'failed'`:
  - `navigator.canShare?.({ files: [file] }) && navigator.share` → share `{ files, title, text: shareCardText(text, url) }`;
  - otherwise download the PNG and return `'downloaded'`;
  - missing blob/file or thrown share → `'failed'`.
- Callers toast on `'downloaded'` (card-saved message) and `'failed'`; a successful native share stays silent.
- Renderers stay synchronous and take a pre-loaded logo:
  - `streakCard.js` — `drawStreakCard(canvas, data, logo)`
  - `testCard.js` — `drawTestCard(canvas, data, logo)`
  - `scoreCard.js` — `drawScoreCard(canvas, data, logo)` restyled; `stripCardText` / `wrapCardText` stay and are reused.

## 3. Palette (hardcoded hex in canvas, each mapped to its token in a comment)

`brand-50 #eef2ff` · `brand-100 #e0e7ff` · `brand-600 #4f46e5` · `brand-700 #4338ca` · `surface #ffffff` · `surface-muted #f8fafc` · `text #111827` · `text-muted #64748b` · `line #e2e8f0` · ball levels `#fcd34d` / `#f59e0b` / `#b45309` with inks `#78350f` / `#fff7ed` · `warn #b45309` (flame) · star `#d97706` · locked `#cbd5e1`.

Background gradient: brand-50 at the top → white at ~38% → surface-muted at the bottom. System font stack only, so Hindi shapes correctly without webfonts.

## 4. Card content

| Card | Content | URL on image | Caption |
|---|---|---|---|
| Streak | flame + "N-day test streak", state subtitle, rolling 7-day ball strip (from `buildStreakWeek`), 4 stats, badge row (earned + progress) | `selftest.in` | `shareStreakText` |
| Test | "Practice paper" kicker, topic, chips (question count, difficulty, language), "Think you can ace this paper?", sub-line | `selftest.in/test?id=…` | `shareTestText` |
| Score | indigo score ring, `score / total`, time, topic, "Beat my X/Y", challenge URL (when the id is numeric) | `selftest.in/challenge?…` | existing `shareResultText` |

All cards end with the URL line in brand-600 and a quiet "Made with selftest" footer (brand signature stays English, like the existing card).

## 5. Instance changes

- **Streak card (`StreakCard.svelte`):** share icon button in the head row beside the flame, 44px target, `aria-label={$t('share')}`, rendered only when `currentStreak >= 1`. Tap: build week/badges/stats → `loadCardLogo()` → `drawStreakCard` → `canvasToFile` → `shareCardFile`. Emits `streak:share`. Toasts `streakCardSaved` / `cardShareFailed`.
- **Test page (`shareTest()`):** same pipeline with `drawTestCard`, URL `/test?id=…` (already recipient-openable). Keeps emitting `test:share`. Toasts `testCardSaved` / `cardShareFailed`.
- **Results page (`shareCard()`):** switches to the kit, restyled `drawScoreCard` + logo, URL in the share text. `shareResult()` and the share sheet are untouched. Success toast stays `cardSaved`; failure unifies to `cardShareFailed`.

## 6. Copy and telemetry

- New EN+HI keys: `shareStreakText` ("I'm on a {count}-day test streak on selftest.in"), `shareTestText` ("I'm attempting \"{topic}\" on selftest.in"), `streakCardSaved`, `testCardSaved`, `cardShareFailed`. Existing results copy unchanged.
- Telemetry allowlist: add `streak:share` in the same commit as its emit. `test:share` and `results:share*` are reused as-is.

## 7. Tests

- Unit (vitest, pure only): `shareCardText` (URL on its own line, no duplication, trims) and `cardFilename`. Browser-only paths (`loadCardLogo`, `toBlob`) are covered by the e2e fallback test; renderers keep returning `false` without a 2D context (existing pattern).
- E2E (stub `navigator.share` / `canShare`, poll `window.__shareCalls` like `results-hero`):
  - streak: button hidden at 0 streak; with a streak, one tap produces a **file** share whose `text` contains the URL; fallback download path with share unavailable.
  - test page: seeded paper → share produces a file share with the `/test?id=` URL in the text.
  - results: existing share test stays green; assert the card share text contains the challenge URL.
  - artifact `test-results/e2e-artifact.json` regenerated, clean-tree byte-stable.
- Verification: `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e`.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Logo fails to load | `loadCardLogo` resolves null; cards draw without it |
| Files/`canShare` unsupported | Download fallback + `cardSaved`-style toast |
| `toBlob` returns null | `'failed'` result → `cardShareFailed` toast |
| Long topics overflow canvas | Reuse `wrapCardText` with capped lines |
| Hindi shaping on canvas | System font stack only, same as the existing score card |
| URL invisible when files are attached | URL always inside `text`; also printed on the image |

## Out of scope / backlog

- QR code on cards.
- Square 1080×1080 variant.
- Dynamic OG images for shared links.
- Share sheet / preview modal on streak and test.
- Name or avatar personalization on cards.
