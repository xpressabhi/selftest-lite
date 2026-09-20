# Challenge-a-Friend + Score Card — Design

Date: 2026-09-20
Status: approved sections 1-3 (card adjusted: vertical 1080x1920 for WhatsApp)
Scope: results-page sharing cluster only. No server changes, no new tables.

## 1. Challenge contract (approved)

- Share URL gains `?id=X&ch=<score>&by=<name>` carrying the challenger's
  claimed score and display name (URL-encoded, name capped at 24 chars).
- Friend opens the link, takes the test, and on their results page a compare
  block renders when `ch`/`by` params exist: "You 8/10 vs Aarav 7/10" with a
  win/lose/draw line. CTA under it: "Challenge back" (shares their own URL).
- Fully client-side, anonymous-friendly, offline-first. Claimed scores are
  fun-first and labeled friendly, not verified across identities.
- Existing `results:share` / `test:share` behavior unchanged; challenge params
  are appended, never replace the test id.

## 2. Score card image (approved, vertical)

- New "Card" button beside Share on results. Renders 1080x1920 canvas:
  brand top, score hero (big % + ring), topic as plain text, score/time row,
  challenge CTA + test link bottom.
- System fonts only (canvas-safe, Hindi shaping intact). Markdown stripped
  from topic; topic clamped to 3 lines with ellipsis.
- Long-topic, Hindi, and dark-mode palettes handled with a single high-
  contrast theme (card is an exported image, not themed UI).
- Share via `navigator.share({ files })`, download fallback otherwise.
- Local-only tests (`review-…` ids) export the card without the link row.
- Locales mandatory: card button, challenge strings, win/lose/draw lines in
  `english.json` + `hindi.json`.

## 3. Edge cases + telemetry (approved)

- Missing/invalid `ch`/`by` params → no compare block, no error.
- Spoofed or absurd scores render as-is (friendly framing, no verification).
- Telemetry in the same commit as emit sites: `results:share-card`,
  `results:challenge-accept` (friend opened a `ch` link),
  `results:challenge-view` (compare block rendered).

## Out of scope

- Classroom leaderboards, referral bonuses, server-verified scores.
- Backlog from 2026-09-20 popularity brainstorm: adaptive Daily 5, mastery
  levels, countdown plan, weekly recap, PYQ pages, install nudge, checklists.
