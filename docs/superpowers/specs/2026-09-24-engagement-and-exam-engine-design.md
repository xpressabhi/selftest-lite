# Engagement & Exam Engine — Design

Date: 2026-09-24
Status: Approved (brainstorm), phased implementation
Bundles seven requested features into four independently shippable phases:

- **Phase A (F2):** reusable question explanations — generate once, reuse for everyone.
- **Phase B (F4):** streak on the home page, GitHub-style.
- **Phase C (F1):** social test stats (visitors / in progress / submitted / scores) and the challenge-link fix.
- **Phase D (F3+F5+F6+F7):** full-exam engine — premium gate, real exam patterns discovered and cached, section selection, preference precedence.

Phasing was approved as A → B → C → D. The exam engine is one workstream because the seven features interlock through the exam-pattern concept.

**Baseline fact:** visitor and submission stats only start recording when Phase C ships. Views were never tracked, so existing tests show zero history; nothing can be backfilled.

## Cross-cutting rules applied to every phase

- **Localization:** every new user-facing string ships in both `src/lib/locales/english.json` and `hindi.json`. Hindi copy is written for meaning, not literal translation. Admin dashboard stays English-only.
- **Never delete data:** new tables receive inserts/updates only. Revocations are status updates. Any future pruning must archive first, per `AGENTS.md`.
- **Rate limits and body validation** on every new public endpoint, using `src/lib/server/rateLimiter.js` and `quizValidation.js` helpers.
- **Schema versions:** `SCHEMA_VERSION` in `src/lib/server/storage.js` goes 5 → 6 (Phase A) → 7 (Phase C) → 8 (Phase D); all DDL stays idempotent.
- **Telemetry allowlist** (`src/lib/shared/telemetryEvents.js`) is updated in the same commit as any new event; `npm run test` enforces it.
- **Verification per phase:** `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e` (artifact written by `tests/e2e/artifactReporter.js`); Phases C and D additionally run `npm run verify:vercel` because they add routes.

---

## Phase A — Reusable explanations (F2)

### Goal

An explanation for a given question is generated once and served to every later user from the database. Today every request calls Gemini and caches only in the requester's localStorage.

### Identity of a cached explanation

`cache_key = sha256(JSON.stringify(['ex-v1', language, question, answer]))` where:

- `question` and `answer` are the exact strings the request sends (the results page sends the composed stem from `questionTextFor`).
- Normalization: `String.prototype.normalize('NFC')`, trim, collapse internal whitespace to single spaces. Case is preserved (math/physics notation is case-sensitive).
- `language` is lowercased; missing/blank falls back to `'english'` (the model prompt's effective default).
- The `ex-v1` version tag lets key semantics change later without colliding with old rows.

### Data (schema v6)

```sql
question_explanations (
  id BIGSERIAL PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL DEFAULT 'english',
  explanation JSONB NOT NULL,          -- the validated explanationSchema payload
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  use_count INTEGER NOT NULL DEFAULT 0
)
+ index on (last_used_at DESC) for future retention work
```

No archive table is needed while rows are only ever inserted/updated.

### Module

New `src/lib/server/explanationCache.js` (pure key builder + DB accessors, mirroring the `storage.js` conventions):

- `buildExplanationCacheKey({ question, answer, language })` — pure, deterministic; used by the endpoint and by tests.
- `getCachedExplanation(cacheKey)` → `{ explanation, language, model } | null`; calls `ensureStorageSchema()` like every storage accessor.
- `saveExplanation({ cacheKey, language, explanation, model })` — `INSERT ... ON CONFLICT (cache_key) DO NOTHING`; never overwrites or deletes.
- `touchExplanation(cacheKey)` — increments `use_count`, sets `last_used_at`; best-effort.

### Endpoint flow (`src/routes/api/explain/+server.js`)

1. Parse and validate the body (unchanged).
2. Build the cache key; look it up.
3. **Hit:** touch the row, log the API event with `metadata.explanationCached: true`, return `{ ...explanation, cached: true }`. Cache hits are served **before** the rate limiter so repeated explanations stay instant and free — the lookup only costs a hash and an indexed read, and misses still pass through the limiter.
4. **Miss:** existing rate limit → Gemini path → validated `parsed`; then best-effort `saveExplanation` (failures are logged, never fail the request); log with `metadata.explanationCached: false`; return `{ ...parsed, cached: false }`.

The client needs no change: it already skips questions that have `explanation` locally and reads `data.explanation`.

### Testing plan

- **Failure modes written first** (repo rule): key stability across whitespace/Unicode variants, language separation, case sensitivity, answer separation, versioning. Then `explanationCache.test.js`.
- **E2E** `tests/e2e/explanation-cache.e2e.js` (real dev server + local DB; skipped when `DATABASE_URL` is absent): trigger schema creation, seed a row via `@neondatabase/serverless` with the documented key formula, call `POST /api/explain` twice, and assert both responses carry `cached: true`, the explanation matches the seeded payload, and `use_count` advanced by exactly 2. Evidence is deterministic (no timestamps), keeping the e2e artifact byte-identical across runs.
- **Manual live check** during implementation: one real miss (`cached: false`, row created with the model output) followed by a hit (`cached: true`, no generation) — verified with the local `GEMINI_API_KEY`, not committed as a test.

### Risks

| Risk | Mitigation |
|---|---|
| Near-duplicate questions miss the exact-text cache | Accepted v1; the key is content-exact by design. Version tag allows a future fuzzy layer |
| Cache growth | Indexed `last_used_at`; future archive-first retention is out of scope |
| Explanation quality varies by model version | `model` stored per row for auditing; rows are immutable |

---

## Phase B — Streak on home (F4)

### Goal

Make the daily streak a home-page motivator, understandable at a glance, in English and Hindi. The word "streak" is not self-evident, so the card explains it in plain language.

### Data

Unchanged: `src/lib/client/learning.js` keeps `selftest_streak` in localStorage with `currentStreak`, `longestStreak`, `lastActiveDate`, `freezesRemaining`, `streakHistory` (90 days of `{ date, quizCount }`), `totalQuizDays`.

Known limitation, stated not solved: the streak is per device; signing in does not sync it.

### Component

New `src/lib/client/StreakHeatmap.svelte` (presentational, props in / no side effects) plus a pure helper `buildStreakGrid(streak, weeks = 8)` exported from the component's module (or `learning.js`) for unit testing:

- GitHub-style grid: 8 weeks × Mon–Sun, columns are weeks, shade by `quizCount` (0 / 1 / 2 / 3+), month labels, today outlined, cell title = localized date + count.
- Header: current streak, longest streak, freezes remaining, total practice days.
- Explainer line, because "streak" needs defining:
  - EN: "A streak counts days you practice in a row. Miss a day and it starts over — freezes protect it."
  - HI: "स्ट्रीक का मतलब है लगातार अभ्यास के दिन। एक दिन छूटा तो गिनती फिर शुरू हो जाती है — फ़्रीज़ उसे बचाते हैं।"
- Empty state: "Practice today to start your streak." / "आज अभ्यास करके अपनी स्ट्रीक शुरू करें।"

### Placement

- **Home** (`src/lib/client/pages/HomePage.svelte`): replaces the compact returning card (~lines 1479–1497) with the streak card, in the same slot after the unsubmitted-test banner. Keeps the existing `streak:view` telemetry event.
- **Results** (`src/routes/results/+page.svelte`): the streak panel (~lines 1148–1174) and its refresh wiring are **removed**. `recordStreakActivity()` on submit and the streak achievements (`streak_3`, `streak_7`) stay; unlocks happen silently.

### Testing plan

- Unit: `buildStreakGrid` — week alignment (Monday start), 8-week window, quiz counts, empty days, month labeling, today marker, empty history.
- E2E `tests/e2e/streak-home.e2e.js`: seed `selftest_streak` in localStorage; assert the home card shows current streak, the grid cell count, and the explainer in English; override to Hindi (`selftest_language`) and assert the Hindi explainer; assert `results` no longer renders the streak panel.

---

## Phase C — Social test stats + share fix (F1)

### Goal

Every test becomes a small social surface: how many people opened it, how many started, how many submitted, and the public scores — visible on the test start page and the result page, with a full dashboard page as activity grows. Anyone can see anyone's score; only the attempt owner ever sees their own full breakdown.

### The three counters, defined exactly

| Counter | Definition |
|---|---|
| Visitors | Unique identities with a visit row — anyone who opened the test, even if they never started |
| In progress | Started (answered at least one question) and no attempt recorded yet |
| Submitted | Number of attempt rows for the test (repeat takers count once per submission) |

### Data (schema v7)

```sql
ai_test_visits (
  id BIGSERIAL PRIMARY KEY,
  test_id BIGINT NOT NULL REFERENCES ai_test(id) ON DELETE CASCADE,
  identity_key TEXT NOT NULL,          -- 'u:<user_id>' | 'c:<client_id>'
  user_id BIGINT,
  client_id TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  display_name TEXT,                   -- challenge "by" name, captured at first visit
  UNIQUE (test_id, identity_key)
)
+ index on (test_id)
```

Submissions and scores stay in `ai_test_attempts` (already stores score, total, time, identity).

### Server

- `recordTestVisit({ testId, identity, displayName })` — upsert `first_seen_at`/`last_seen_at`; fill `display_name` only when it is still null (never overwrite).
- `markTestStarted({ testId, identity })` — set `started_at` when null.
- `markTestSubmitted({ testId, identity })` — set `submitted_at` when null. Called server-side from `/api/test/submit` **and** the `POST /api/user/history` upsert (covers locally-graded papers). No extra client call.
- Identity is always derived server-side from the session (`user_id`) or the `x-client-id` header; bodies never carry identity.
- `GET /api/test/stats?id=` — public, rate-limited, `Cache-Control: no-store`. Returns:
  - `{ visitors, inProgress, submissions }`
  - `scores[]`: latest attempt per identity, `{ name, score, total, createdAt }`, sorted by score then recency, capped at 50 (the inline card uses the top 5)
  - `myScore` / `viewer: { hasVisited, hasAttempted }` / `isOwner` (from `ai_test.created_by_user_id`)
  - Name resolution: profile name → challenge name → localized anonymous label. Never email, never answers, never another user's breakdown.
  - Displayed scores are clamped to `0..total`; unusable rows (total ≤ 0) are ignored.
- `POST /api/test/activity` — `{ testId, event: 'view' | 'start' }`, rate-limited (30/min bucket), returns only success. `submit` is not a client event.

### Client / UI

- `reportTestActivity(testId, event)` in `src/lib/client/storage.js`: fire-and-forget, failures ignored, deduped per test per tab session.
- Test page: `view` when the test record resolves; `start` on the first answer selection.
- `TestStatsCard.svelte` on `/test` (start area) and `/results`:
  - the three counters; the viewer's own score when they have one (both pages, per the requirement); top-5 score list (name, score, relative date); "Details →".
  - Visibility rule (approved): render only once at least one external visitor/attempt exists (`visitors ≥ 2` or `submissions ≥ 1` when the viewer is the owner; `visitors ≥ 1` for non-owners). Owners see "opened by others" wording; nobody sees a "0 visitors" card on a fresh private test.
- New route `/test/stats?id=` (noindex via `src/lib/shared/seo.js` `NOINDEX_PREFIXES`): full dashboard — the three counters, top-50 scores, last-14-day activity, test meta (topic, question count, created date). The inline card always links here; the link becomes prominent once submissions exceed 5 (the "more than 5 people" threshold from the request).
- Attempt owner's full result page stays unchanged and owner-only, as today via `myAttempt`.

### Challenge-link fix (part of this phase)

Today `?ch=&by=` is parsed only on `/results`; a recipient who opens `/test?id=…&ch=…&by=…` and submits loses both params at the redirect. Fix:

- `/test` parses challenge params via `parseChallengeParams` and carries them through to `/results?id=&ch=&by=`.
- The `by` name is captured into the visit row at first arrival (`display_name`), so public scores can show the challenger's chosen name.
- Verify the compare block renders end-to-end for a recipient.

### Privacy and abuse posture

- Public: display name, score, totals, dates, counters. Private: answers, email, breakdown.
- Names are trimmed and capped (40 chars) and rejected if blank after normalization; anonymous fallback is localized.
- Self-reported scores from the locally-graded path can be inflated within `0..total`; clamped, accepted as fun-first, documented.

### Testing plan

- Unit: identity key building, name resolution fallbacks, score clamping/dedupe (pure helpers extracted for testability).
- E2E `tests/e2e/test-stats.e2e.js` (real server + DB, skipped without `DATABASE_URL`): context A creates a mocked-paper test directly in the DB; context B opens `/test` (visitor), answers one question (in progress), submits (submitted + score); A sees counts and B's score on `/test` and `/results`; B sees only their own score; challenge link `?ch=&by=` survives `/test` → `/results` and renders the compare block.

---

## Phase D — Full-exam engine (F3 + F5 + F6 + F7)

### D1 — Exam pattern discovery + cache (F5 core)

**Goal:** stop hardcoding exam formats. A generic pattern-research prompt forces the model to determine the actual current structure; the result is cached with a freshness date and reused.

**Data (schema v8):**

```sql
exam_patterns (
  id BIGSERIAL PRIMARY KEY,
  pattern_key TEXT NOT NULL UNIQUE,   -- 'exam:<id>' | 'board:<board>:<class>:<subject>' | 'paper:<slug>'
  source TEXT NOT NULL,               -- 'exam' | 'board' | 'paper'
  payload JSONB NOT NULL,
  model TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
)
```

**Zod `examPatternSchema`:** `{ examName, board?, classLevel?, subject?, patternYear, durationMinutes, totalMarks?, negativeMarking?, sections: [{ id, name, subject?, questionTypes[], questionCount, marksPerQuestion, negativeMarks, instructions }], generalInstructions[] }`.

**`src/lib/server/examPattern.js`:**

- `discoverExamPattern(target, { language })` — one Gemini JSON-mode call, 45 s deadline, one retry (same shape as explain/generate). Prompt: act as an exam-pattern researcher; use the most recent verified knowledge of the official current pattern; output sections, question types, counts, marks, negative marking, duration, instructions, and the year/session being modelled; prefer the most recent session.
- `getExamPattern(patternKey, { maxAgeMs = 45 days, refresh })` — cache read; stale → serve stale and refresh in the background; missing → synchronous discovery. Concurrent misses in one server instance share a single in-flight promise (cross-instance duplicates accepted).

**API:** `GET /api/exam/pattern?examId=… | ?board=&class=&subject=&paper=` — public, rate-limited; returns the pattern plus `fetchedAt` and `stale`.

**Generation:** `/api/generate` full-exam paths resolve the pattern before building the prompt and pass it as an authoritative constraint block.

### D2 — Sections in the paper (F5 delivery)

- Paper JSON gains optional `sections[]` (`{ id, name, subject?, instructions?, marksPerQuestion, negativeMarks, questionIndexes[], questionCount }`) and `examMeta` (`{ examName, board?, classLevel?, durationMinutes, totalMarks?, patternCheckedAt, patternSource, sectionOnly? }`).
- The server assigns `questionIndexes` from the batch plan — the model never invents ranges.
- Quiz-practice and legacy papers render exactly as today (components activate only when `sections` exist).
- Test page: section header + instructions before each section, "Section 2 of 4" progress. Results: per-section score breakdown, count-based, plus section headings in review.
- Redaction is unchanged: answer keys stripped; sections/examMeta are safe to send.
- Reuse: `ai_test` gains `section_focus TEXT`; full-paper reuse continues keyed on `(test_mode, exam_id, language)`, sectional papers are keyed separately so reuse never returns the wrong paper.

### D3 — `/exam-paper` page + premium gate (F3)

- Home gains a "Full Exam Paper" card → new `/exam-paper` page (noindex).
- Gate: `GET /api/premium/access` → `{ allowed, reason }`. Allowed when an active admin session exists or the signed-in user holds an active entitlement. Otherwise the page shows an early-access gate with a sign-in prompt; no payment copy yet.
- Form: two tabs —
  - **Board paper:** board (CBSE/ICSE/state), class 6–12, subject, optional school/college name (paper header), duration override.
  - **Named paper:** free text (e.g. "SSC CGL Tier 1 2026"), optional school/college name.
- Flow: fetch pattern → show discovered sections/marks/duration for confirmation (count/duration editable) → section picker (D4) → generate through the existing SSE pipeline.
- Entitlements: `premium_entitlements (id, user_id → app_user, feature, granted_by, granted_at, expires_at NULL, notes, status)` with unique active `(user_id, feature)`. Helper `hasPremiumAccess(request, feature)`.
- `/api/generate` rejects premium requests with `403 PREMIUM_REQUIRED` unless admin or entitled — enforced server-side, not just in the UI.
- Admin dashboard gains a Premium access panel: list grants, add by email, extend/revoke (revoke = status update, never delete). `/api/admin/premium` is admin-gated and English-only.

### D4 — Section/short paper selection (F6)

- The pattern's sections render as chips: "Full paper" or one section (single-select v1). The selection sets `sectionFocus`; the generation prompt uses only that section's question types, count, marks, and instructions — a real sectional paper, not a slice.
- Defaults for count come from the pattern section (visible and editable).
- Available from `/exam-paper` and from the existing exam flow (`ExamPage.svelte`'s "sectional" link opens the section picker instead of preselecting the home composer).

### D5 — Preference precedence (F7)

Current behaviour lets exam defaults and profile adaptation blur together. New explicit contract:

- Client sends `explicit: ['difficulty','numQuestions','testType','language', ...]` — only fields the user personally touched (existing `difficultyExplicit` kept as a back-compat alias).
- New pure `resolveGenerationParams({ request, exam, pattern, section, profile, signals })` in `src/lib/server/generationParams.js`, strict precedence:
  1. Explicit user field
  2. Selected exam / pattern / section constraint (count, format, duration, marks)
  3. Profile adaptation (adaptive difficulty, warm-up, topic focus)
  4. Defaults
- Profile/tailored context may annotate but never override an explicit exam, subject, or format. Table-driven unit tests cover every combination.

### Phase D testing / ops

- Unit: pattern schema validation, cache TTL/stale logic, section-to-index mapping, precedence matrix.
- E2E: pattern discovery output (route-mocked for the deterministic path), full paper renders section headers, sectional paper generated from a chip, free user sees the gate/403, admin grants via dashboard, entitled user generates.
- `npm run verify:vercel` (new routes, sitemap/noindex), telemetry events for pattern fetch/section select/gate view added to the allowlist in the same commit.

### Risks

| Risk | Mitigation |
|---|---|
| Model misremembers a pattern | Pattern shown for confirmation before generating; provenance (`patternYear`, `model`, `fetched_at`); admin can refresh; generation treats the cached pattern as authoritative so output is internally consistent |
| Pattern cost | One discovery per key, cached ~45 days; stale served while refreshing |
| Self-reported exam scores | Same posture as Phase C: clamped, fun-first |
| In-flight work conflicts | Phase D touches `quizSchema.js` / `prompt.js`; starts only after the formats work merged (it is, as of b45fd59) |

---

## Out of scope

- Payments / pricing screens (entitlements are the seam for a later provider integration)
- Server-side streak sync across devices
- Anti-cheat for self-reported scores
- Interactive matching, partial credit, five-pair matching
- Fuzzy/near-duplicate explanation matching
- Retention/pruning jobs for the new cache tables

## Files touched (by phase)

- **A:** `src/lib/server/storage.js`, `src/lib/server/explanationCache.js` (new), `src/routes/api/explain/+server.js`, `src/lib/server/explanationCache.test.js` (new), `tests/e2e/explanation-cache.e2e.js` (new)
- **B:** `src/lib/client/StreakHeatmap.svelte` (new), `src/lib/client/learning.js` (grid helper), `src/lib/client/pages/HomePage.svelte`, `src/routes/results/+page.svelte`, locales
- **C:** `src/lib/server/storage.js`, `src/routes/api/test/activity/+server.js` (new), `src/routes/api/test/stats/+server.js` (new), `src/routes/api/test/submit/+server.js`, `src/routes/api/user/history/+server.js`, `src/lib/client/storage.js`, `src/lib/client/TestStatsCard.svelte` (new), `src/routes/test/+page.svelte`, `src/routes/test/stats/+page.svelte` (new), `src/routes/results/+page.svelte`, `src/lib/shared/seo.js`, `src/lib/shared/telemetryEvents.js`, locales, e2e
- **D:** `src/lib/server/storage.js`, `src/lib/server/examPattern.js` (new), `src/lib/server/generationParams.js` (new), `src/lib/server/quizSchema.js`, `src/lib/server/prompt.js`, `src/routes/api/generate/+server.js`, `src/routes/api/exam/pattern/+server.js` (new), `src/routes/api/premium/access/+server.js` (new), `src/routes/api/admin/premium/+server.js` (new), `src/routes/exam-paper/+page.svelte` (new), `src/lib/client/pages/HomePage.svelte`, `src/lib/client/PreviewCard.svelte`, `src/lib/client/pages/ExamPage.svelte`, `src/routes/test/+page.svelte`, `src/routes/results/+page.svelte`, `src/routes/admin/+page.svelte`, locales, e2e
