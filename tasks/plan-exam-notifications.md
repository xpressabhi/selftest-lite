# Implementation Plan: Exam Notification Tracker

Spec: `docs/superpowers/specs/2026-09-26-exam-notification-tracker-design.md`
Branch: `feat/exam-notification-tracker` (5 commits)
Status: **complete** — all phases built and verified; push/PR left to the human.

Daily GitHub Action gathers Indian government recruitment notifications from
curated official sources, validates them, stores them in Neon, and serves a
searchable `/exams` hub that deep-links into practice papers.

## Architecture Decisions (as shipped)

- Gemini parses; official links are the source of truth.
- Neon only; SSR page + CDN caching; no deploy needed for fresh data.
- Auto-publish validated rows; quarantine the rest (visible in run summary).
- Idempotent re-scan → missed schedules self-heal.
- English content, bilingual UI; discovery suggests sources, never auto-fetches.
- Live register (7 sources enabled): UPSC, SSC (its own JSON feed), IBPS
  (curl fallback for an incomplete TLS chain), RBI, RRB Chandigarh, UPPSC,
  BPSC (curl fallback). SBI, NCS and Employment News are registered but
  `enabled: false` — their lists need a rendering/PDF transport.
- Model calls retry transient Gemini 5xx/429 spikes; link checks fall back
  from HEAD to a body-cancelled GET (legacy .aspx servers).
- Model quota policy: `EXAM_SYNC_MODEL=gemini-flash-latest` (5 RPM / 20 RPD on
  this key's tier) is paced at one call per 15s with a per-run call budget
  (default 16, under the daily limit); if the primary is unavailable or
  quota-blocked twice in a run, the rest of the run goes straight to
  `gemini-flash-lite-latest` (set `EXAM_SYNC_FALLBACK_MODEL=` to disable).
  Verified live: 7/7 sources, 9 model calls, 7 fallbacks on a day the flash
  quota was already spent by testing.

## Task List

### Phase 0 — Docs

- [x] Task 0: Spec + this plan. `docs/superpowers/specs/2026-09-26-exam-notification-tracker-design.md`

### Phase 1 — Rules & registry (pure, no I/O)

- [x] Task 1: `src/lib/shared/examNotifications.js` — normalization, dedupe key,
      near-dupe similarity, URL/host validation, date plausibility, scope
      filter, exam-id allowlist (+ status/date primitives split into the
      client-safe `examNotificationStatus.js` so the browser never loads
      `node:crypto`).
- [x] Task 2: `src/lib/data/examSources.js` — source registry + integrity tests.
- [x] Task 3: `src/lib/server/htmlText.js` — HTML→text with numbered links.

### Phase 2 — Schema, store, archive

- [x] Task 4: `src/lib/shared/examNotificationSql.js` — schema, upsert, read,
      quarantine, run log, suggestions, archive targets (+ PGlite db tests).
- [x] Task 5: wired into `storage.js` (SCHEMA_VERSION 10) and the weekly
      `telemetry:archive` run.

### Phase 3 — Sync pipeline

- [x] Task 6: `src/lib/server/examSync.js` — per-source orchestration with
      injected deps; retries; report with quarantine reasons (+ tests).
- [x] Task 7: `scripts/sync-exam-notifications.mjs` CLI (`--source`,
      `--dry-run`, `--discover`, `--page-file`, `--extraction-file`,
      `--dump-extraction`, `EXAM_SYNC_MODEL`).
- [x] Task 8: workflows `exam-notifications.yml` (daily) and
      `exam-source-discovery.yml` (weekly).
- [x] Task 9: live dry runs hardened the registry (SSC JSON feed found, curl
      fallback for IBPS/BPSC, RBI added, three sources disabled).

### Phase 4 — Public hub

- [x] Task 10: `ExamsHubPage.svelte` + `/exams` + `/hi/exams` (SSR load,
      search, filters, status pills, practice CTA, last-updated/stale/empty
      states) + 43 EN/HI strings + 5 allowlisted telemetry events.
- [x] Task 11: SEO registration (`sitemap.js`, `verify-vercel.mjs` SSR_PATHS,
      `llms.js`), practice-hub banner, README/AGENTS/architecture notes.
- [x] Task 12: E2E spec (rendering, quarantine hiding, filters, link
      attributes, Hindi tree) + `/exams` added to the design-consistency
      route list.

## Verified (on this branch)

- `npm run lint` clean; `npm run test` 729 passing.
- `npm run check` production build clean.
- `npm run test:e2e` 123 passing; artifact byte-identical across two runs.
- `npm run verify:vercel` OK — `/exams` + `/hi/exams` resolve to the SSR
  function with correct canonical/hreflang/lang.
- Live dry run: 7/7 sources OK, 34 notifications extracted, 1 out-of-scope
  dropped, 0 quarantined.
- Visual check in Search at 390×844 and 1280×800 against a PGlite dev server.

## To run it for real

1. Add repository secrets `GEMINI_API_KEY` (and confirm `DATABASE_URL`) in
   GitHub → Settings → Secrets and variables → Actions. The daily workflow
   skips quietly until they exist.
2. Trigger **Exam notifications sync** once via `workflow_dispatch` (it
   creates the tables through the shared schema statements).
3. The repository variable `EXAM_SYNC_MODEL` is set to `gemini-flash-latest`,
   which has a 5 RPM / 20 RPD quota — the pipeline paces calls and falls back
   to flash-lite when it is blocked, so leave it alone unless you upgrade the
   quota.

## Deliberately deferred (backlog)

PDF date enrichment for PDF-only notices (SSC deadlines), ItemList JSON-LD,
public JSON API, admin quarantine view, deadline push reminders, rendering
transport for SBI/NCS/Employment News, Jev calibrated verifier.
