# Implementation Plan: Device & Network Telemetry

## Overview

Ship the approved design in `docs/superpowers/specs/2026-09-24-device-network-telemetry-design.md`:
one anonymous `device:profile` event per session (tier, RAM/core buckets, model, Android version,
screen class, first network snapshot), capped `net:change` events when connection quality moves,
report correlation by `session_id`, a supported-floor line, an admin card, privacy copy in both
languages, and a coverage quality gate. No DB schema change beyond one idempotent index; no new
dependencies.

## Architecture Decisions

- Collector lives in `src/lib/client/deviceProfile.js`: pure bucket/classify/normalize functions
  exported separately from `startDeviceProfileTracking(emit = track)` so tests spy on `emit`
  without touching the network (localhost telemetry is a no-op by design).
- Flat props on both events, identical network field names (`type`, `down`, `rtt`, `save`, `wifi`)
  so the report's lateral join reads whichever row is nearest in the session.
- Tier is RAM-primary (`<=2` low, `4` mid, `8` high; cores only when RAM is unknown) — documented
  in the spec because budget SoCs report 8 cores.
- UA-CH (`getHighEntropyValues(['model','platformVersion'])`) raced against a 400 ms timeout;
  UA-string parse is the fallback because Chrome's UA reduction replaces the model with `"K"`.
- Correlation queries use `LEFT JOIN LATERAL` on `(session_id, created_at <=)`; a new
  `idx_feature_events_session` index keeps them cheap. All casts of client props are regex-guarded
  (`elapsedSeconds`), so malformed props can never fail the report.
- The coverage gate passes vacuously when the window has no `page:view` sessions.

## Task List

### Phase 1: Specs first (repo rule)

- [x] Task 1 (M): `tests/e2e/device-profile.e2e.js` — stub `deviceMemory`/`hardwareConcurrency`/
  `connection` via `addInitScript`, import the collector from the dev server, assert exact buckets
  (`tier low`, `type 3g`, `down 05-1`, `rtt 200-400`); spy `emit` asserts one `device:profile` and
  one `net:change` after a flip; home loads clean with the stub. Expected to fail only on the
  missing module.
- [x] Task 2 (M): `src/lib/client/deviceProfile.test.js` — failure modes first (spec §9):
  missing APIs, RAM/cores boundaries + tier table, downlink/RTT boundaries, hostile UA strings,
  rejected/hung UA-CH, lifecycle (once per start, unchanged tuple silent, changed tuple emits,
  debounce collapses flaps, cap removes listeners).

### Checkpoint: Specs

- [x] Both suites fail for the right reason (missing module/behaviour), no harness errors;
  existing 55 e2e tests still green.

### Phase 2: Collector module

- [x] Task 3 (M): `src/lib/client/deviceProfile.js` — pure functions + `collectDeviceProfile()`
  + `collectNetworkSnapshot()`; unit suite green.
- [x] Task 4 (S): `startDeviceProfileTracking(emit = track)` — enrichment race, onchange +
  visibility listeners, debounce, tuple compare, cap; lifecycle tests green.

### Checkpoint: Collector

- [x] `npm run test` green; E2E bucket assertions green.

### Phase 3: Wiring

- [x] Task 5 (XS): allowlist `device:profile`, `net:change` in `telemetryEvents.js` (same change
  as the emit sites); call `startDeviceProfileTracking()` in `+layout.svelte` next to
  `startTelemetry()`.
- [x] Task 6 (S): E2E green end-to-end; artifact updated.

### Checkpoint: Emitting

- [ ] `npm run test:e2e` green; allowlist scan test green (emit site ↔ allowlist parity).

### Phase 4: Report

- [x] Task 7 (M): `scripts/telemetry-report.mjs` — "Device & network" section: device mix per
  identity, top low-tier models, network mix per session (type/down/rtt, worst observed),
  generate outcomes by downlink bucket, supported-floor line; coverage gate in the quality-gates
  table; `docs/telemetry.md` gates table + events + weekly checklist item.

### Checkpoint: Report

- [x] `npm run telemetry:report -- --days=30` renders the section against the real DB (empty
  tables + vacuous gate before deploy; no SQL errors).

### Phase 5: Admin

- [x] Task 8 (M): `ensureStorageSchema` session index; `getDeviceNetworkStats({ days })` in
  `storage.js` (regex-guarded casts, `days` capped 90).
- [x] Task 9 (S): `GET /api/admin/device-network` (admin auth + rate limit, mirrors
  feature-usage) and the `/admin` card (English-only).

### Checkpoint: Admin

- [x] Endpoint returns 401 unauthenticated, JSON stats when authenticated; card renders without
  console errors.

### Phase 6: Privacy

- [x] Task 10 (XS): `privacyItemAnalyticsBody` in `english.json` + `hindi.json` mentions
  anonymous device-capability and connection-quality data; locale parity test green.

### Phase 7: Verification

- [x] Task 11 (S): `npm run lint`, `npm run test`, `npm run check`, `npm run test:e2e`;
  conventional commits; spec checkboxes updated.

### Checkpoint: Complete

- [x] All acceptance criteria from spec §1 met; artifact written with the new suite's evidence
  (60/60 passed, `test-results/e2e-artifact.json`).
- [x] `npm run verify:vercel` OK (192 sitemap URLs, 190 prerendered pages, SSR function present).
- [x] Report verified read-only against the real DB: section renders, coverage gate correctly
  fails at 0% until the client ships, endpoint returns 401 unauthenticated and valid JSON when
  authenticated, admin card renders with zero console errors.

## Risks and Mitigations

| Risk                                                     | Impact | Mitigation                                                          |
| -------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| UA-CH absent in Capacitor WebView / Firefox              | Low    | UA fallback, `unknown` fields, coverage gate catches breakage       |
| E2E dynamic import of source module needs dev server     | Low    | Playwright webServer already runs `npm run dev`; assert import path |
| Lateral join slow once feature_events grows              | Med    | Windowed filters + new session index (idempotent `CREATE INDEX`)    |
| Malformed client props break report/admin queries        | Med    | Regex-guarded numeric casts; props capped at 2 KB server-side       |
| Pre-commit hook runs full smoke on every commit (~25 s)  | Low    | Batch work into focused commits; hook already exists                |
| Privacy copy drift between en/hi                         | Low    | Same-change edits; locale parity test in `npm run test`             |

## Open Questions

None — bucket rules, floor definition, and gate thresholds are fixed in the spec.
