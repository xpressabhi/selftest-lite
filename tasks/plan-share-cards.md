# Implementation Plan: Share Cards

## Overview

Add direct image sharing to the streak card and the test page, and move the results score card onto the same kit: one 1080×1920 light-editorial card family synced to app tokens, the app icon as logo, and the direct URL both printed on the image and included as a clickable link in the share text. Spec: `docs/superpowers/specs/2026-09-25-share-cards-design.md`.

## Architecture Decisions

- **`cardKit.js`** owns the shared browser plumbing: card constants, logo loading, rounded-logo drawing, canvas→PNG `File`, pure `shareCardText`/`cardFilename`, and `shareCardFile` with `shared | downloaded | cancelled | failed` outcomes. Cancellation never toasts.
- **Renderers stay synchronous and logo-injected** (`streakCard.js`, `testCard.js`, `scoreCard.js`) so canvas drawing is deterministic and the async boundary lives in one place.
- **URL always in `text`** because file shares may drop a separate `url` field; the image also prints it.
- **Palette hardcodes app token hex values** with a comment mapping each to its token (canvas cannot read CSS variables).
- **Telemetry**: add `streak:share` in the same commit as its emit; `test:share` and `results:share*` are reused.
- **Localization is mandatory**: every new card string ships EN+HI.

## Task List

### Phase 1: Kit and renderers

- [ ] Task 1: `cardKit.js` + unit tests (tests first)
- [ ] Task 2: `streakCard.js` renderer
- [ ] Task 3: `testCard.js` renderer
- [ ] Task 4: restyle `scoreCard.js` to the family with logo

### Checkpoint: Foundation

- [ ] `npx vitest run src/lib/client/cardKit.test.js` green
- [ ] `npm run test` green

### Phase 2: Instances

- [ ] Task 5: streak share button + copy + `streak:share` + streak e2e
- [ ] Task 6: test page share upgrade + copy + test e2e
- [ ] Task 7: results share card via kit + e2e URL assertion

### Checkpoint: Instances

- [ ] `npm run check` clean
- [ ] Focused e2e files green

### Phase 3: Prove and ship

- [ ] `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e`
- [ ] Artifact clean-tree byte-stable with the new share evidence
- [ ] Push to `origin/main`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Logo load fails offline | Low | `loadCardLogo` resolves null; cards draw without it |
| Cancel shows error toast | Med | `AbortError` → `cancelled`, callers stay silent |
| `toBlob` null on low-end | Med | `'failed'` → single `cardShareFailed` toast |
| Long topic overflows canvas | Med | `wrapCardText` capped lines; e2e uses a realistic topic |
| Files+`url` share incompatibility | High | URL inside `text`; separate `url` never sent with files |
| Hindi glyphs on canvas | Med | System font stack only, as the existing card |
| Existing results e2e breaks | Med | Same commit updates its stub to capture text + URL |

## Open Questions

- None blocking. QR code, square variant and OG images stay backlog.
- Tasks tracked in `tasks/todo-share-cards.md`.
