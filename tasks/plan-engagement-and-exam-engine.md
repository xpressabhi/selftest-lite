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

- [ ] Task 7 (S): `buildStreakGrid` pure helper (+ failure-mode unit tests first): Monday alignment, 8-week
  window, counts, empty days, month labels, today marker, empty history.
- [ ] Task 8 (M): `StreakHeatmap.svelte` with EN/HI explainer and empty state; locale keys.
- [ ] Task 9 (S): Home swap (replace returning card); results panel removal; `streak:view` telemetry kept.
- [ ] Task 10 (S): `tests/e2e/streak-home.e2e.js` — seeded streak renders; EN + HI copy; results panel gone.

### Checkpoint: B

- [ ] Grid fits 320px, no horizontal overflow; zero console errors
- [ ] Full suite green

### Phase C: Social stats + share fix (F1)

- [ ] Task 11 (S): E2E spec first — `tests/e2e/test-stats.e2e.js`: two contexts, view/start/submit counters,
  public score, owner-only breakdown, challenge params survive to `/results`.
- [ ] Task 12 (M): Schema v7 (`ai_test_visits`) + storage accessors (`recordTestVisit`, `markTestStarted`,
  `markTestSubmitted`, `getTestStats`) with pure helpers + unit tests.
- [ ] Task 13 (S): `POST /api/test/activity`, `GET /api/test/stats`; mark submitted in `/api/test/submit` and
  `/api/user/history`; rate limits; telemetry metadata.
- [ ] Task 14 (S): `reportTestActivity` client helper; test page view/start pings; challenge param carry-through.
- [ ] Task 15 (M): `TestStatsCard.svelte` on `/test` + `/results`; `/test/stats` page; noindex; locale keys.
- [ ] Task 16 (S): `npm run verify:vercel` (new route).

### Checkpoint: C

- [ ] Counters match seeded activity exactly; scores never leak answers/emails
- [ ] Full suite + vercel verification green

### Phase D: Full-exam engine (F3/F5/F6/F7)

- [ ] Task 17 (M): Schema v8 (`exam_patterns`, `ai_test.section_focus`, `premium_entitlements`) + accessors.
- [ ] Task 18 (M): `examPatternSchema` + `discoverExamPattern` + `getExamPattern` (TTL, stale-refresh,
  in-flight dedupe) + failure-mode unit tests.
- [ ] Task 19 (S): `GET /api/exam/pattern` (public, rate-limited).
- [ ] Task 20 (M): Paper `sections`/`examMeta` in `quizSchema.js`, prompt constraint block, server-side index
  ranges, generation wiring.
- [ ] Task 21 (M): Section headers/progress on `/test`, section breakdown on `/results`; legacy flat papers
  unchanged.
- [ ] Task 22 (M): `/exam-paper` page (board/named tabs, pattern confirmation, gate screen) + home card.
- [ ] Task 23 (S): `GET /api/premium/access`, `hasPremiumAccess`, `403 PREMIUM_REQUIRED` in `/api/generate`;
  admin `/api/admin/premium` + dashboard panel.
- [ ] Task 24 (M): Section chips in the exam flow (single-select v1) + `sectionFocus` generation.
- [ ] Task 25 (M): `resolveGenerationParams` precedence engine + `explicit` contract client-side + table-driven
  unit tests.
- [ ] Task 26 (S): E2E `tests/e2e/exam-paper.e2e.js` (mocked pattern/generation): section headers render,
  sectional chip generation, gate + 403, admin grant flow; `verify:vercel`.

### Checkpoint: D

- [ ] Free user cannot reach generation server-side; entitled user can
- [ ] Full suite + vercel verification green

## Verification Notes

### Phase A (2026-09-24)

- Tests failed first for the right reasons: unit suite on the missing module, e2e on
  `relation "question_explanations" does not exist`.
- Live check with the local key: first `POST /api/explain` missed and generated in 9.9 s
  (`cached: false`, row stored with `model = gemini-flash-lite-latest`, JSONB object); the next
  call hit in 0.3 s (`cached: true`, identical text); `use_count` advanced by exactly the number
  of hits.
- `lint`, `check`, `test` (532, +9), `test:e2e` (72, +1) all green.

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
