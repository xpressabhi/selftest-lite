# Implementation Plan: Nudge Engine

Spec: `docs/superpowers/specs/2026-09-26-nudge-engine-design.md`
Status: complete (phases 1-6 built and verified)

One fail-open policy layer decides when to prompt a learner: in-page share/push
nudges, and in-app notifications for new and relevant exam updates. Jev judges
moments in the existing `/api/personalize` call; code owns eligibility, caps,
copy, placement, and the holdout. Everything ships dark behind `NUDGE_ENABLED`.

## Architecture Decisions (planned)

- Pure `src/lib/server/nudges.js` owns thresholds, eligibility filtering,
  question building, derivation and the holdout hash; the route only composes.
- Nudge state is a validated, clamped slice of the existing personalize `state`
  body; no new endpoint until coupling hurts.
- Client ledger (localStorage) owns cooldowns, dismiss backoff and the shared
  interrupt budget; seen keys are `notificationId + event`.
- Feed API promotes the tracker's backlogged public JSON API and mirrors the
  `/exams` loader contract (cache header, empty-not-500, `first_seen_at`).
- Ranking stays on TypeSafe Jev; Gemini quota belongs to the sync.

## Task List

### Phase 1 — Pure engine + route field

- [x] Task 1 (M): `src/lib/server/nudges.js` + failure-list tests first:
      kinds/pages eligibility, criteria filtering, thresholds, `wait`/`nothing`,
      clamped state, holdout determinism, notification candidate caps,
      quarantine/closed never ranked, `first_seen_at` seen keys.
      Verify: `npm run test`.
- [x] Task 2 (S): wire `/api/personalize` — zod nudge slice, `NUDGE_ENABLED`,
      question merge, `nudge` field, `metadata.nudgeHoldout`.
      Verify: `npm run test`; route fails open with flag off.

### Checkpoint A
- [x] `npm run lint`, `npm run test` clean.

### Phase 2 — Client ledger + results share nudge

- [x] Task 3 (S): `src/lib/client/nudge.js` + tests: ledger read/write,
      cooldowns, dismiss escalation, session/interrupt budget, state builder,
      decision application. Verify: `npm run test`.
- [x] Task 4 (S): telemetry allowlist entries + `NudgeCard.svelte` + EN/HI keys.
      Verify: `npm run test` (allowlist test), `npm run lint`.
- [x] Task 5 (M): results page integration (share/challenge kinds, dwell gate,
      `source: 'nudge'` props) + `tests/e2e/nudges.e2e.js` with stubbed
      `/api/personalize`.
      Verify: `npm run test:e2e`.

### Checkpoint B
- [x] Share nudge show → click → dismiss → backoff all covered by e2e.

### Phase 3 — Home share/push nudge

- [x] Task 6 (M): home integration (`share_streak`, `enable_reminders`), push
      CTA calls `enableReminders()` with outcome telemetry, denied → off.
      Verify: `npm run test`; e2e extension.
- [x] Task 7 (S): e2e coverage for suppression rules (caps, denied, holdout
      response) and the interrupt budget.

### Checkpoint C
- [x] Full nudge poll e2e green; artifact byte-stable.

### Phase 4 — Feed API + notification inbox

- [x] Task 8 (S): `GET /api/exam-notifications` mirroring the `/exams` loader
      (cache header, empty-not-500, `firstSeenAt`/`publishedAt`, bounded).
      Verify: e2e seed via `/api/test/db` returns rows.
- [x] Task 9 (M): `src/lib/client/notifications.js` + tests: interest matching
      (tier 0 bookmarked/practiced, soft), seen ledger keys, `closing_soon`
      transition once, badge count. Verify: `npm run test`.
- [x] Task 10 (M): `NotificationsBell.svelte` + `NotificationsPanel.svelte` +
      header wiring + EN/HI keys + telemetry events.
      Verify: `npm run test`, `npm run test:e2e`.

### Checkpoint D
- [x] Badge → panel → item open → seen suppression covered by e2e.

### Phase 5 — Jev relevance + interrupt toast

- [x] Task 11 (M): notification questions + derivation in `nudges.js`
      (`nudge_notify_item`, `nudge_relevance_<id>` gates) with tests.
- [x] Task 12 (M): client ranking piggyback + `showToastWithAction` interrupt,
      shared budget with `NudgeCard`, quiet hours. Verify: `npm run test`.
- [x] Task 13 (M): `tests/e2e/notifications.e2e.js` full contract (ranking
      stubbed, suppress/apply paths, HI chrome).
      Verify: `npm run test:e2e`.

### Checkpoint E
- [x] `npm run test:e2e` artifact byte-identical across two runs.

### Phase 6 — Docs and verification

- [x] Task 14 (S): README feature/endpoint notes, `docs/architecture.md` rows,
      AGENTS command table if a script was added.
- [x] Task 15 (S): `npm run verify:vercel`; full checklist `lint` / `check` /
      `test` / `test:e2e`.

## Verification (per task and at checkpoints)

- Failure lists written before implementation (repo testing rule).
- E2E artifact from `tests/e2e/artifactReporter.js`; no `DATABASE_URL` use.
- Telemetry allowlist updated in the same commit as emit sites.
- All user-facing strings in `english.json` + `hindi.json`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Permission burn | High | Return gate; denied → never; CTA gesture only |
| Nagging | Medium | Session/interrupt budget, cooldowns, dismiss backoff, quiet hours |
| Stale badge | Medium | `first_seen_at` + per-event seen keys; never `last_seen_at` |
| Route coupling | Low | Pure module; extraction to `/api/nudge` mechanical |
| i18n drift | Low | EN+HI same commit; e2e asserts Hindi chrome |
| Holdout trust | Low | Server-side hash logged on the API event |

## Open Questions

- None blocking; thresholds start at spec values and tune from telemetry.
