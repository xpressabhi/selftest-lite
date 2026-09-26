# Exam Notification Tracker — Design

Date: 2026-09-26
Status: approved (brainstorm; all sections reviewed)
Scope: daily tracking of Indian government recruitment notifications from official
sources, stored in Neon, surfaced on a searchable /exams hub that deep-links into
practice papers. No per-notification pages, no push reminders, no results/admit
cards, no private-sector jobs in v1. In-app notification delivery is owned by
the nudge engine (`2026-09-26-nudge-engine-design.md`).

## 1. Decisions

- **Scope v1:** recruitment notifications belonging to the exam families already in
  the practice registry (~109 exams). Lifecycle events (results, admit cards,
  answer keys) are filtered out by keyword; corrigenda are kept.
- **Sources:** curated official listing pages. Gemini is only the parser; every
  record cites an official URL whose host must be on the source's allowlist.
- **Storage:** Neon only (no committed JSONL). The page is SSR with CDN caching;
  new notifications appear without a deploy.
- **Publishing:** strict validation, then auto-publish. Failures are quarantined
  (hidden, with reason and raw extraction) and surfaced in the workflow run
  summary. Nothing unvalidated reaches users; nothing is silently dropped.
- **Surface:** `/exams` + `/hi/exams`, searchable/filterable hub, link-out to the
  official notice and apply page, "Practice for this exam" CTA when the
  notification maps to a registry exam. No per-notification detail pages.
- **Language:** English notification content as published; all UI chrome in EN+HI.
- **Discovery:** curated sources + official aggregators (Employment News, NCS) +
  a weekly grounded-AI pass that only *proposes* new official portals
  (`exam_source_suggestion`); a source is fetched only after it is added to the
  registry by a human.
- **Model:** `EXAM_SYNC_MODEL` env knob, default `gemini-flash-lite-latest`; a
  stronger Gemini tier can be tried without code changes.
- **Secrets:** `DATABASE_URL` + `GEMINI_API_KEY` as GitHub Action secrets. No
  OpenCode/subscription keys in CI; Jev is reserved for a future calibrated
  verifier if run summaries show systematic misclassification.

## 2. Pipeline

`scripts/sync-exam-notifications.mjs` (plain Node, `neon()` directly, like the
archive/reminder scripts) runs daily via GitHub Actions:

1. **Fetch** each source's listing page(s): plain fetch, 15s timeout, polite
   delay, identifying User-Agent, page-size cap. **PDF enrichment** for sources
   whose notices are PDFs: download linked notices (capped per run), extract
   text, and ask the model only for the date/eligibility fields. PDF failures
   never block the item — dates simply stay null.
2. **Extract** one Gemini call per source: page text plus a numbered link list in,
   strict JSON out (`responseJsonSchema`, Zod-mirrored schema): title, notice/apply
   URLs, published/apply-start/apply-end/exam dates, vacancies, qualification,
   category/state, `examId` suggestion, per-item confidence.
3. **Validate** (`src/lib/shared/examNotifications.js`, pure):
   - link host must be in the source's `allowedHosts` (final URL after redirects);
   - reachability check for new candidates only, capped per run;
   - dates must be ISO, plausible and internally consistent — an invalid date
     becomes null, it does not break the card;
   - `examId` must exist in the registry (`OBJECTIVE_ONLY_EXAMS`), else null;
   - confidence below threshold → quarantine;
   - scope keyword filter drops results/admit cards/answer keys/cut-offs.
4. **Dedupe:** exact key `sha256(sourceId + normalized title)` upserts. Near
   duplicates (token overlap ≥ 0.85 within a source) are quarantined as
   `possible_duplicate` — never auto-merged, never published.
5. **Persist** (idempotent, self-healing):
   - upsert: dates update only when the new value is non-null; a previously
     quarantined row that now validates is promoted to published;
   - quarantine inserts never clobber a published row;
   - one `exam_sync_run` row per run (counts, per-source errors, status).
6. **Report:** stdout JSON report uploaded as a workflow artifact; `$GITHUB_STEP_
   SUMMARY` shows counts, per-source health and the top quarantined items. The
   job fails only when zero sources succeed; partial runs are recorded `partial`.

Weekly (`--discover`, separate workflow): one Gemini call with Google Search
grounding proposes official recruitment portals. Candidates must be reachable and
on an official domain (.gov.in/.nic.in or a known official host), are deduped into
`exam_source_suggestion`, and are never fetched automatically.

## 3. Data model & lifecycle

Tables are created by `CREATE TABLE IF NOT EXISTS` statements shared between
`ensureStorageSchema()` and the sync script (`examNotificationSql.js`), following
the `dataArchive.js` pattern. No migrations.

**`exam_notification`** — identity (`dedupe_key` unique, `source_id`, `org`,
`title`), classification (`category`, `state`, `exam_id` nullable), content
(`notification_url`, `apply_url`, `published_at`, `apply_start`, `apply_end`,
`exam_date`, `vacancies`, `qualification`), review (`review_status`
published/quarantined, `failure_reason`, `confidence`, `raw_json` quarantine
only), lifecycle (`first_seen_at`, `last_seen_at`, `updated_at`). Partial index on
`(apply_end, published_at) WHERE review_status = 'published'`.

**`exam_sync_run`** — counts, per-source failures, status ok/partial/failed; the
page's "last updated" stamp reads the latest non-failed run.

**`exam_source_suggestion`** — weekly discovery candidates, deduped by URL, status
pending/added/ignored; flips to `added` when the registry contains the host.

Status is **derived at read time** vs IST today: `upcoming` (announced, no dates) →
`open` → `closing_soon` (≤7 days) → `closed`. Pure function, unit-tested.

Nothing is deleted: rows older than 180 days and unseen for 90 days move to
`exam_notification_archive` via a statement added to the weekly
`telemetry:archive` run (DELETE…RETURNING → INSERT in one statement).

## 4. Page, SEO, i18n, telemetry

- `/exams` + `/hi/exams`: first SSR route in the repo — `+page.server.js` reads
  published rows (last 12 months, bounded, active-first) through
  `listExamNotifications()` in `storage.js`, sets
  `Cache-Control: public, s-maxage=600, stale-while-revalidate=3600`. If the DB
  read fails the page renders its empty state with a soft note instead of 500ing.
- Shared `ExamsHubPage.svelte` (both languages): header with last-updated +
  "verify on the official notice" line, search box, category/state/status
  filters, closing-soon-first order, status pills (`New` ≤7 days, `Open`,
  `Closing soon`, `Closed`), cards with dates/vacancies and links (official
  notice, apply, practice CTA via `localizedPath`), empty states. Client-side
  filtering only; mobile-first, 44px targets, data-saver friendly.
- SEO: `/exams` joins `STATIC_PATHS` in `sitemap.js` (bilingual + hreflang),
  `SSR_PATHS` in `scripts/verify-vercel.mjs`, and `CORE_PAGES` in `llms.js`.
  SeoHead carries EN/HI title + description. `ItemList` JSON-LD is backlog.
- i18n: every new string in `english.json` + `hindi.json`; content stays as
  published.
- Telemetry allowlist gains `exams:view`, `exams:search`, `exams:filter`,
  `exams:notice-open`, `exams:practice-click`, emitted from the hub only.
- Entry points: banner on `/practice` plus footer link; bottom nav unchanged v1.
  Offline: existing NetworkFirst `pages` runtime cache covers `/exams`.

## 5. Ops

- `.github/workflows/exam-notifications.yml` — daily cron ~07:45 IST +
  `workflow_dispatch` (`dry-run`, `sources` inputs), concurrency lock,
  `contents: read`, ~20 min timeout, secrets `DATABASE_URL` + `GEMINI_API_KEY`.
- `.github/workflows/exam-source-discovery.yml` — weekly Monday, writes
  suggestions only.
- Missed schedules self-heal: every run re-scans listing pages and upserts
  idempotently. Staleness: the page shows the last successful run and a soft
  warning after 48h without one.
- Cost: ~150–200 Actions minutes/month, a few dozen Gemini Flash Lite calls/day,
  cents/day; Vercel SSR responses are CDN-cached.

## 6. Tests

- **E2E first** (`tests/e2e/exam-notifications.e2e.js`): visit `/exams` (schema
  creation + empty state), seed through the dev-only `/api/test/db` bridge, then
  assert published rendering, quarantined invisibility, search, filters, closing
  order, practice CTA presence/absence, `/hi/exams` chrome + localized link,
  external link attributes, last-updated stamp; attach evidence; artifact stays
  byte-stable on a clean tree.
- **Unit** for pure modules, failure lists first: validation/rules
  (host allowlist, tracking params, date plausibility + null-never-clobbers,
  dedupe + near-dupe, IST status boundaries, scope filter, examId allowlist),
  registry integrity (ids unique, URLs https, hosts valid, every `examId` exists
  in `indianExams`), HTML→text extraction, extraction normalization.
- **PGlite DB tests** (`*.db.test.js`): upsert idempotency, null dates don't
  clobber, quarantine→published promotion, quarantine never clobbers published,
  read window/filter, archive move preserves rows.
- **Fixture pipeline test:** saved listing HTML + fake model + fake store, whole
  fetch→extract→validate→persist path offline, including a failing source
  (isolation) and junk model output.
- Checklist: `lint`, `check`, `test`, `test:e2e`, `verify:vercel`.

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Official sites block CI IPs / need JS | Per-source health in the run report; sources fail in isolation; rendering fallback is a later option; source removal is one registry line. |
| Model date errors | Strict validation + quarantine + link-first UI + "verify on the official notice". |
| Near-duplicate noise across runs | Exact-key upsert + near-dupe quarantine for review. |
| Repo/DB growth | Hot table bounded by archive sweep; page capped to 12 months. |
| Scheduled workflow delays | Idempotent re-scan; workflow_dispatch fallback; stale warning on the page. |

## Out of scope / backlog

ItemList JSON-LD (the public JSON API is now built for the nudge engine's in-app
notifications — see `2026-09-26-nudge-engine-design.md`), admin quarantine view,
deadline push reminders, offline SW tuning for /exams, Jev calibrated verifier,
auto-added sources.
