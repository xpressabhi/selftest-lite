## Task 1: Pure personalize engine + unit tests
**Description:** Create `src/lib/server/personalize.js` with `buildPersonalizeQuestions(page)` and `derivePersonalize(page, judgments, context)` returning `{action, confidence, hide[], promote[]}` + `personalize.test.js`.
**Acceptance criteria:**
- [ ] Pure, no network/DB; confidence fallback `<0.5` returns current-UI default
- [ ] Covers home/history/results/practice + in-test/onboarding question sets
- [ ] Unit tests pass
**Verification:**
- [ ] Tests pass: `npm run test -- personalize`
- [ ] Build succeeds: `npm run check`
- [ ] Manual check: none (pure logic)
**Dependencies:** None
**Files likely touched:**
- `src/lib/server/personalize.js`
- `src/lib/server/personalize.test.js`
**Estimated scope:** Small: 1-2 files

## Task 2: `/api/personalize` route + telemetry allowlist
**Description:** Thin POST route: zod body, rateLimiter bucket `/api/personalize` (30/min), TypeSafeClient call with 5s timeout, logApiEvent, fail-open JSON.
**Acceptance criteria:**
- [ ] 429/400/500 shapes match parse-intent conventions
- [ ] `personalize:request/applied/fallback` in `telemetryEvents.js` with emit sites
- [ ] No secret leaks to client; data-saver bypass documented
**Verification:**
- [ ] Tests pass: `npm run test`
- [ ] Manual check: curl no-key → 500 JSON, over-limit → 429
**Dependencies:** Task 1
**Files likely touched:**
- `src/routes/api/personalize/+server.js`
- `src/lib/shared/telemetryEvents.js`
**Estimated scope:** Small: 1-2 files

## Checkpoint: After Tasks 1-2
- [ ] All tests pass
- [ ] Route fail-open verified
- [ ] Review with human before proceeding

## Task 3: Home primary-action + history rerank wiring
**Description:** Home calls personalize once on load (skip offline/data-saver); renders 1 primary CTA, collapses rest; history sorts by `resume_likelihood` showing top 2 + search.
**Acceptance criteria:**
- [ ] conf<0.5 shows today's layout unchanged
- [ ] Every hidden section has View-all path
- [ ] Telemetry `personalize:applied` fires once per load
**Verification:**
- [ ] Tests pass: `npm run test`
- [ ] Manual check: 360px mobile, slow-3G
**Dependencies:** Task 2
**Files likely touched:**
- `src/routes/+page.svelte`
- `src/routes/history/+page.svelte`
- `src/lib/client/personalize.js`
**Estimated scope:** Medium: 3-5 files

## Task 4: Results focus + practice promote wiring
**Description:** Results expands one focus panel per Jev; practice hub promotes 1-3 exam cards.
**Acceptance criteria:**
- [ ] No content deleted, only collapsed; print path unaffected
- [ ] Fallback shows all panels as today
**Verification:**
- [ ] Tests pass: `npm run test`
- [ ] Manual check: score 20% vs 95% layouts differ sensibly
**Dependencies:** Task 2
**Files likely touched:**
- `src/routes/results/+page.svelte`
- `src/routes/practice/+page.svelte`
**Estimated scope:** Medium: 3-5 files

## Checkpoint: After Tasks 3-4
- [ ] Central flow works end-to-end
- [ ] Clutter visibly reduced on home/results

## Task 5: In-test stuck/fatigue trigger
**Description:** Debounced client trigger (min 8s gap, max 3/test) sending dwell/skips to personalize; shows hint affordance / collapses chrome only.
**Acceptance criteria:**
- [ ] Never auto-submits or auto-advances
- [ ] Zero calls on data-saver/offline
**Verification:**
- [ ] Tests pass: `npm run test`
- [ ] Manual check: long dwell surfaces hint, no jank on low-end
**Dependencies:** Task 2
**Files likely touched:**
- `src/routes/test/+page.svelte`
- `src/lib/client/personalize.js`
**Estimated scope:** Small: 1-2 files

## Task 6: Onboarding infer via parse-intent
**Description:** Extend `intentParse.js` questions with class/exam/language infer; wizard autofills on >0.8, confirm chip 0.5-0.8.
**Acceptance criteria:**
- [ ] Explicit wizard edits always win over inference
- [ ] EN+HI strings for any new copy
**Verification:**
- [ ] Tests pass: `npm run test`
- [ ] Manual check: one-line input prefills wizard correctly
**Dependencies:** Tasks 1-2
**Files likely touched:**
- `src/lib/server/intentParse.js`
- `src/lib/client/ProfileWizard.svelte`
- `src/lib/locales/english.json`
- `src/lib/locales/hindi.json`
**Estimated scope:** Medium: 3-5 files

## Checkpoint: Complete
- [ ] All acceptance criteria met
- [ ] `npm run lint`, `npm run check`, `npm run test` pass
- [ ] Ready for review
