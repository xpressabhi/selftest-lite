# Implementation Plan: Exam Notification Tracker

Spec: `docs/superpowers/specs/2026-09-26-exam-notification-tracker-design.md`

Daily GitHub Action gathers Indian government recruitment notifications from
curated official sources, validates them, stores them in Neon, and serves a
searchable `/exams` hub that deep-links into practice papers.

## Architecture Decisions (from spec)

- Gemini parses; official links are the source of truth.
- Neon only; SSR page + CDN caching; no deploy needed for fresh data.
- Auto-publish validated rows; quarantine the rest (visible in run summary).
- Idempotent re-scan → missed schedules self-heal.
- English content, bilingual UI; discovery suggests sources, never auto-fetches.

## Task List

### Phase 0 — Docs

- [x] Task 0 (S): Write spec + this plan. Commit.

### Phase 1 — Rules & registry (pure, no I/O)

- [ ] Task 1 (M): `src/lib/shared/examNotifications.js` — normalization, dedupe
      key, near-dupe similarity, URL/host validation, date plausibility, IST
      status derivation, scope filter, exam-id allowlist. Unit tests written from
      the failure list.
      Verify: `npm run test`.
- [ ] Task 2 (S): `src/lib/data/examSources.js` — seed registry (start with
      high-confidence sources; grow after the first live dry run) + integrity
      test against the practice registry.
      Verify: `npm run test`.
- [ ] Task 3 (S): `src/lib/server/htmlText.js` — HTML→text with numbered links +
      tests.
      Verify: `npm run test`.

### Checkpoint A
- [ ] `npm run lint`, `npm run test` clean; no app behavior changed.

### Phase 2 — Schema, store, archive

- [ ] Task 4 (M): `src/lib/shared/examNotificationSql.js` — schema statements,
      upsert/read/quarantine/run-log/suggestion SQL, row mapper, archive targets.
      PGlite db tests for every invariant (idempotent upsert, null dates don't
      clobber, promotion, quarantine isolation, read window, archive move).
- [ ] Task 5 (S): wire schema into `storage.js` (SCHEMA_VERSION bump +
      `listExamNotifications()`, `getLatestExamSyncRun()`); archive DDL + moves
      into `dataArchive.js` / `scripts/archive-telemetry.mjs`.
      Verify: `npm run test`; `npm run telemetry:archive` dry run still works.

### Checkpoint B
- [ ] `npm run lint`, `npm run test`, `npm run check` clean.

### Phase 3 — Sync pipeline

- [ ] Task 6 (M): `src/lib/server/examSync.js` — per-source orchestration
      (fetch → extract → validate → persist → report) with injected deps;
      fixture + fake-based tests (failing source isolation, junk output, near
      dupe, quarantine, discovery reconciliation).
- [ ] Task 7 (S): `scripts/sync-exam-notifications.mjs` CLI (`--source`,
      `--dry-run`, `--discover`, `--page-file`, `--extraction-file`,
      `EXAM_SYNC_MODEL`) + `package.json` scripts.
- [ ] Task 8 (S): workflows `.github/workflows/exam-notifications.yml` (daily)
      and `exam-source-discovery.yml` (weekly).
- [ ] Task 9 (S): live `--dry-run` against real sources; fix or drop
      unreachable sources from the registry.
      Verify: report shows ≥1 source with extracted items; no DB writes.

### Checkpoint C
- [ ] `--dry-run` report reviewed with the human; source list final for v1.

### Phase 4 — Public hub

- [ ] Task 10 (M): `ExamsHubPage.svelte` + `/exams`, `/hi/exams` routes with
      shared server load, SEO, i18n keys, telemetry events.
- [ ] Task 11 (S): SEO registration (`sitemap.js`, `verify-vercel.mjs` SSR_PATHS,
      `llms.js`), `/practice` entry banner, README/architecture notes.
- [ ] Task 12 (S): E2E spec with bridge seeding; evidence artifact.
      Verify: `npm run test:e2e` (focused spec first, then full).

### Checkpoint D
- [ ] `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e` clean.
- [ ] `npm run verify:vercel` passes with `/exams` as an SSR sitemap URL.
- [ ] Human review of the page at 390px and desktop.

## Risks / notes

- Source URLs are the least predictable part; the live dry run decides the v1
  registry.
- PDF enrichment ships in the pipeline but is flag-gated per source; sources
  without it publish with null dates.
- Commits on `feat/exam-notification-tracker`; push/PR left to the human.
