# Implementation Plan: Engagement & Exam Engine

## Overview

Ship the approved design in `docs/superpowers/specs/2026-09-24-engagement-and-exam-engine-design.md` in four
independently shippable phases:

- **A (F2):** reusable explanations — DB cache keyed by question+answer+language, served before the rate limiter.
- **B (F4):** GitHub-style streak on home; streak panel removed from results.
- **C (F1):** test visitor/start/submit stats, public scores, `/test/stats` dashboard, and the `?ch=&by=` carry-through fix.
- **D (F3+F5+F6+F7):** cached exam-pattern discovery, sectioned papers, `/exam-paper` behind an admin/entitlement gate, section picker, strict generation precedence.

Each phase ends with `lint` + `check` + `test` + `test:e2e`; C and D also run `verify:vercel`.

## Architecture Decisions

- Explanation cache keys are content-exact, versioned (`ex-v1`), NFC-normalized, whitespace-collapsed, case-preserved.
- Cache hits skip the rate limiter (hash + indexed read only); misses keep the existing limiter and Gemini path.
- Visitor identity is always derived server-side (`u:<id>` / `c:<client_id>`); bodies never carry identity.
- Submissions are marked from existing write paths (`/api/test/submit`, `/api/user/history`), so the client only pings `view`/`start`.
- Public surfaces expose names, scores, totals, dates and counters; answers and breakdowns stay owner-only.
- Exam patterns are discovered once per key via a generic research prompt, cached ~45 days, stale-served while refreshing; generation treats the cached pattern as authoritative.
- Section index ranges are assigned server-side from the batch plan, never by the model.
- Generation precedence is explicit-first: user choice → exam/pattern/section → profile → defaults; profile may annotate, never override.
- Premium gating is server-enforced (`PREMIUM_REQUIRED`) behind admin sessions or `premium_entitlements`; payments are a later seam.

## Dependency Graph

```
A explanations ──────────────> (independent)
B streak ────────────────────> (independent)
C stats ─────────────────────> C2 UI ─> C3 e2e
D1 pattern cache ─> D2 sections ─> D3 /exam-paper + gate ─> D4 section picker ─> D5 precedence ─> D6 e2e
```

## Task List

### Phase A: Reusable explanations (F2)

- [x] Task 1 (S): E2E spec first — `tests/e2e/explanation-cache.e2e.js`: seed schema, seed a row via the
  documented key formula, POST twice, assert `cached: true` both times, payload equality, `use_count` +2.
  Skips without `DATABASE_URL`. Expected to fail only on the missing table/`cached` flag.
- [x] Task 2 (S): Failure-mode-first unit tests — `src/lib/server/explanationCache.test.js`: whitespace
  variants → same key; NFC variants → same key; case change → different key; answer/language change →
  different key; blank language → english; version tag changes key.
- [x] Task 3 (S): Schema v6 in `src/lib/server/storage.js` (`question_explanations` + index).
- [x] Task 4 (S): `src/lib/server/explanationCache.js` — key builder, get/save/touch, `ensureStorageSchema`.
- [x] Task 5 (M): `/api/explain/+server.js` — cache lookup before rate limit, `cached` flag, best-effort
  save, `explanationCached` in API-event metadata.
- [x] Task 6 (S): Manual live check with the local key: miss (`cached:false`, row created) then hit
  (`cached:true`, no second generation).

### Checkpoint: A

- [x] New unit + e2e specs fail for the right reason before implementation, then pass
- [x] `npm run lint && npm run check && npm run test && npm run test:e2e` green

### Phase B: Streak on home (F4)

- [x] Task 7 (S): `buildStreakGrid` pure helper (+ failure-mode unit tests first): Monday alignment, 8-week
  window, counts, empty days, month labels, today marker, empty history.
- [x] Task 8 (M): `StreakHeatmap.svelte` with EN/HI explainer and empty state; locale keys.
- [x] Task 9 (S): Home swap (replace returning card); results panel removal; `streak:view` telemetry kept.
- [x] Task 10 (S): `tests/e2e/streak-home.e2e.js` — seeded streak renders; EN + HI copy; results panel gone.

### Checkpoint: B

- [x] Grid fits 320px, no horizontal overflow; zero console errors
- [x] Full suite green

### Phase C: Social stats + share fix (F1)

- [x] Task 11 (S): E2E spec first — `tests/e2e/test-stats.e2e.js`: two contexts, view/start/submit counters,
  public score, owner-only breakdown, challenge params survive to `/results`.
- [x] Task 12 (M): Schema v7 (`ai_test_visits`) + storage accessors (`recordTestVisit`, `markTestStarted`,
  `markTestSubmitted`, `getTestStats`) with pure helpers + unit tests.
- [x] Task 13 (S): `POST /api/test/activity`, `GET /api/test/stats`; mark submitted in `/api/test/submit` and
  `/api/user/history`; rate limits; telemetry metadata.
- [x] Task 14 (S): `reportTestActivity` client helper; test page view/start pings; challenge param carry-through.
- [x] Task 15 (M): `TestStatsCard.svelte` on `/test` + `/results`; `/test/stats` page; noindex; locale keys.
- [x] Task 16 (S): `npm run verify:vercel` (new route).

### Checkpoint: C

- [x] Counters match seeded activity exactly; scores never leak answers/emails
- [x] Full suite + vercel verification green

### Phase D: Full-exam engine (F3/F5/F6/F7)

- [x] Task 17 (M): Schema v8 (`exam_patterns`, `ai_test.section_focus`, `premium_entitlements`) + accessors.
- [x] Task 18 (M): `examPatternSchema` + `discoverExamPattern` + `getExamPattern` (TTL, stale-refresh,
  in-flight dedupe) + failure-mode unit tests.
- [x] Task 19 (S): `GET /api/exam/pattern` (public, rate-limited).
- [x] Task 20 (M): Paper `sections`/`examMeta` in `quizSchema.js`, prompt constraint block, server-side index
  ranges, generation wiring.
- [x] Task 21 (M): Section headers/progress on `/test`, section breakdown on `/results`; legacy flat papers
  unchanged.
- [x] Task 22 (M): `/exam-paper` page (board/named tabs, pattern confirmation, gate screen) + home card.
- [x] Task 23 (S): `GET /api/premium/access`, `hasPremiumAccess`, `403 PREMIUM_REQUIRED` in `/api/generate`;
  admin `/api/admin/premium` + dashboard panel.
- [x] Task 24 (M): Section picker on `/exam-paper` (single-select: full paper or one section) driving
  `sectionFocus` generation. Note: the free exam flow's "sectional" link still preselects the home
  composer; reusing the same picker there is a follow-up.
- [x] Task 25 (M): `resolveGenerationParams` precedence engine + `explicit` contract + table-driven unit tests.
- [x] Task 26 (S): E2E `tests/e2e/exam-engine.e2e.js` — pattern cache, section rendering, anonymous gate
  (UI + 403 + admin 401). Admin grant and signed-in generation flows need a Google session and stay
  manually verifiable.

### Checkpoint: D

- [x] Free user cannot reach premium generation server-side (`PREMIUM_REQUIRED`); admin API closed anonymously
- [x] Full suite + vercel verification green

## Verification Notes

### Phase A (2026-09-24)

- Tests failed first for the right reasons: unit suite on the missing module, e2e on
  `relation "question_explanations" does not exist`.
- Live check with the local key: first `POST /api/explain` missed and generated in 9.9 s
  (`cached: false`, row stored with `model = gemini-flash-lite-latest`, JSONB object); the next
  call hit in 0.3 s (`cached: true`, identical text); `use_count` advanced by exactly the number
  of hits.
- `lint`, `check`, `test` (532, +9), `test:e2e` (72, +1) all green.

### Phase B (2026-09-24)

- Tests failed first for the right reasons: unit suite on the missing `buildStreakGrid`, e2e on the
  missing `.streak-card` and the still-present results `.week-strip`.
- Home shows the grid (56 cells, 2 active, 1 today), current streak, best/freezes/practice-days meta,
  and the plain-language explainer; `/hi` renders the Hindi explainer with the same numbers.
- Results page no longer renders the streak panel (`week-strip` and "Day Streak" absent), achievements
  and `recordStreakActivity` untouched.
- 320px viewport: zero horizontal overflow, zero console errors.
- `lint`, `test` (539, +7), `test:e2e` (75, +3) all green.

### Phase C (2026-09-24)

- Tests failed first for the right reasons: unit suite on the missing `testStats` module, e2e on the
  missing stats endpoints and card.
- Two integration bugs found and fixed while making the e2e deterministic:
  - The stats fetch itself records the visit server-side, so the viewer's own count is never racing the
    separate `view` ping.
  - The submit flow pushed every attempt to `/api/user/history` even when the server had already stored
    it, double-counting submissions; the push now only covers locally-graded papers (matching its comment).
- E2E (real DB): first visitor sees no card; second visitor sees visitors=2, in-progress=1 after
  answering, then submissions=1, score 1/2, `isMine` for the taker; the first visitor sees the other
  score with no own-score chip; `/test/stats` renders; challenge `?ch=1&by=Ravi` survives submission and
  names the public score "Ravi".
- `lint`, `check`, `test` (552, +13), `test:e2e` (77, +2), `verify:vercel` all green.

### Phase D, part 1 — pattern cache + sections (2026-09-24)

- Unit suites written first: `examPattern.test.js` (schema, slug normalization, keys, expiry,
  section assignment, focused sections) — 14 tests.
- E2E `exam-engine.e2e.js`: a seeded pattern is served with `stale: false` and the cache key
  `exam:e2e-pattern-probe`; a DB paper with two sections renders "Section 1 of 2", the section name,
  instructions and marks chip, switches to Section B on advance, and the results page shows
  `1/1` / `0/1` per section.
- Standard exam generation resolves a cached pattern opportunistically (`discover: false`); sectional
  requests discover synchronously; section index ranges are assigned server-side from the batch order;
  `section_focus` is stored for reuse keying.
- `lint`, `check`, `test` (566, +14), `test:e2e` (79, +2) all green.

### Phase D, part 2 — premium gate, section picker, precedence (2026-09-24)

- `/exam-paper`: access check, early-access gate (Google sign-in when signed out), board/named-paper
  forms, pattern preview with provenance, full-paper/section chips, SSE generation into `/test`.
- Entitlements: `premium_entitlements` (grants by email, revocations flip `status`), `GET /api/premium/access`,
  admin `GET/POST /api/admin/premium`, admin dashboard "Premium" tab. `/api/generate` returns
  `403 PREMIUM_REQUIRED` for full-exam requests without an exam id unless admin/entitled.
- Precedence: `resolveGenerationParams` (explicit → constraint → profile → request) wired into
  `/api/generate`; the client explicit contract now also accepts the `explicit` field list alongside
  the legacy `difficultyExplicit` flag.
- Live discovery check with the real key exposed and fixed a real bug: a bare `?examId=` sent no
  human-readable name, the model invented an exam (JEE Advanced for `ssc-cgl`), and the wrong pattern
  was cached. The endpoint now resolves the name from the exam registry and the prompt **fails
  closed** without a name; refresh overwrote the bad row and returned the real SSC CGL Tier-I pattern
  (4 sections × 25 questions × 2 marks, 60 min, 200 marks). Unknown ids now return 502 instead of
  caching a hallucination.
- E2E adds the anonymous gate (UI, 403, admin 401); pattern cache and section rendering were already
  covered. Admin grant and signed-in generation need a Google session and are manually verifiable.
- `lint`, `check`, `test` (574, +8), `test:e2e` (80, +3), `verify:vercel` all green.

### Follow-up pass (2026-09-24)

- 9 new e2e coverage points across the batch: `exam-engine` now runs 5 specs (cached sections + request
  payload, gate, admin grant/revoke, cached pattern, section/marks/school rendering); `test-stats` kept.
- Three flake classes were root-caused and fixed rather than retried: aborted activity pings (challenge
  name is now captured server-side at submit), Google GSI console noise (filtered as environmental), and
  background auth/state sync exhausting its 120/min limits under a full suite (limits raised to 900/300).
  Three consecutive full e2e runs pass after the fix.
- Unit suites: `marks`, `userState` (streak merge) added; `examPattern` extended — totals 590 unit tests.

### Sanity pass (2026-09-25)

- Live validation in Search against the dev server found one real gap: the streak card was gated to
  returning users, so a brand-new visitor saw nothing. It now renders for everyone with the empty-state
  explainer ("Practice today to start your streak"); a fresh-visitor e2e covers it.
- Live evidence per feature: stats card and dashboard (visitors 2 / in progress 0 / submitted 1,
  "Ravi 1/2"), section banner ("Section 1 of 2 · 2 marks each · ~15 min"), premium gate, cached section
  chips ("Full paper / Section A / Section B"), explanation cache hit (`cached: true`, 0.5 s), cached
  SSC CGL pattern (4 sections, not stale).

## Follow-up work (2026-09-24, second pass)

Shipped after the four phases, addressing the "remaining things" list:

- **Pattern refresh gating** — `refresh=1` is admin-only and a 6 h cooldown applies even to admins;
  `discover=0` lets clients read the cache without triggering discovery. `shouldHonorRefresh` is unit-tested.
- **Paper header name** — the school/college name flows from `/exam-paper` into `examMeta.schoolName`
  and renders on the test summary and results; `examMeta` also renders on results.
- **Admin Exam Patterns panel** — lists cached patterns (key, exam, year, sections, fetched/expires) and
  refreshes any pattern from its stored `target` (schema v9 adds `exam_patterns.target`).
- **Streak cross-device** — `selftest_streak` rides the existing state sync with a two-writer merge
  (`mergeStreak`: newer activity wins, longest/total/history only grow, history deduped by day).
- **Visit-history backfill** — `npm run telemetry:backfill-visits [-- --apply]` rebuilds visits from
  `test:start`/`results:view` (archive-aware, upsert-only). Applied: 364 rows upserted.
- **Section-aware generation** — pattern papers with multiple sections generate each section in parallel
  with its own count/format, then ranges are assigned from actual output sizes (no mislabelled sections).
- **Marks-aware scoring** — `computeAttemptMarks` (shared by server grading and local grading) stores
  `marks`/`total_marks` on attempts; results show a marks pill; negative marking applies per section.
- **Section time budget** — each section banner shows marks per question and a proportional minutes hint.
- **Free-flow section picker (F6)** — cached sections appear as chips after selecting an exam; a "Find
  sections" action discovers on demand; the request carries `sectionFocus`.
- **Admin grant e2e** — seeds a user + session, logs in as admin, grants, verifies `/api/premium/access`,
  revokes.
- **Grounded research seam** — `buildPatternResearchPrompt`/`discoverExamPattern` accept verified research
  notes; wiring a search provider only requires fetching notes before discovery (no provider key is
  configured yet).
- **Rate-limit headroom** — `/api/auth/me` and `/api/user/state` raised for background sync; stats/activity
  limits raised; consecutive full e2e runs are now stable.

Still open, by decision: payment-provider integration (seam ready), activating grounded research (needs a
search API key + budget), per-section timing enforcement (budget is displayed only), fuzzy explanation
matching, and exact section ordering under model drift.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Model misremembers an exam pattern | High | Pattern shown for confirmation; provenance stored; admin refresh; authoritative constraint keeps output consistent |
| E2E stats tests depend on DB state | Med | Seed explicitly per test, assert deltas not absolutes; skip cleanly without `DATABASE_URL` |
| Cache hit before limiter opens cheap spam | Low | Hits require exact cached content; misses still limited; log every hit |
| Precedence regression breaks personalization | Med | `explicit` is additive; table-driven tests pin every combination; `difficultyExplicit` stays a back-compat alias |
| Streak confusion (word unknown) | Low | Plain-language EN/HI explainer ships with the grid |
| Section index drift between batch plan and paper | Med | Server assigns ranges; contract test asserts coverage |

## Open Questions

- None blocking. Payment provider is deliberately deferred behind `premium_entitlements`.

## Files Likely Touched

`src/lib/server/{storage,explanationCache,examPattern,generationParams,quizSchema,prompt,quizValidation}.js`,
`src/routes/api/{explain,generate,test/submit,user/history}/+server.js`,
`src/routes/api/{test/activity,test/stats,exam/pattern,premium/access,admin/premium}/+server.js` (new),
`src/lib/client/{StreakHeatmap.svelte,TestStatsCard.svelte}` (new), `src/lib/client/{storage,learning}.js`,
`src/lib/client/pages/{HomePage,ExamPage}.svelte`, `src/lib/client/PreviewCard.svelte`,
`src/routes/{test,results,exam-paper,admin}/+page.svelte`, `src/routes/test/stats/+page.svelte` (new),
`src/lib/shared/{seo,telemetryEvents}.js`, `src/lib/locales/{english,hindi}.json`,
`tests/e2e/{explanation-cache,streak-home,test-stats,exam-paper}.e2e.js` (new), plus unit tests alongside sources.
