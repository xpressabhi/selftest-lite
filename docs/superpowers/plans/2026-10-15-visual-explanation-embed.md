# Visual Explanations Inline (embed, links, Jev fit gate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Review cards generate and embed the animated visual explainer inline (no navigation), explainers link back to their question and restore per-test across devices, and one shared Jev "visual-fit" judge gates the affordance on review cards and refuses unworthy playground topics before spending generation tokens.

**Architecture:** Two new SQL-backed modules (verdict cache, question links) mirror the existing explainer cache/library pair; a pure judge engine plus an injectable orchestrator wraps TypeSafe Jev with fail-open semantics. The playground POST gains a pre-generation judge gate and an optional `source` for link recording. Client-side, the results page owns visual state (links map, build/open handlers) and `ResultReviewItem` gains a `VisualExplainerSection`; the playground page gains a judging stage and a refusal panel.

**Tech Stack:** SvelteKit 3 + Svelte 5 runes, Tailwind + globals.css, Neon Postgres via `@neondatabase/serverless` (PGlite in tests), `@typesafe-ai/sdk` (`jev-latest`), Zod, vitest + PGlite db tests, Playwright E2E with the `/api/test/db` bridge.

**Spec:** `docs/superpowers/specs/2026-10-15-visual-explanation-embed-design.md`

## Global Constraints

- Every user-facing string ships in **both** `src/lib/locales/english.json` and `src/lib/locales/hindi.json` in the same commit (AGENTS.md). No hardcoded UI text.
- **No em dashes or emoji in user-facing copy** (`taste-pass.e2e.js` asserts this on public pages).
- Every `track()` name must be added to / removed from `src/lib/shared/telemetryEvents.js` **in the same commit as its emit site**; `telemetryEvents.test.js` fails on either mismatch.
- Changing the DDL block in `ensureStorageSchema` requires bumping `SCHEMA_VERSION` (storage.js, currently 15) **and** updating `DDL_FINGERPRINT` in `schemaMigrations.test.js` in the same change.
- Never modify, skip, or delete a pre-existing test to make a change pass. Recorded test changes for this plan: extend `tests/e2e/playground.e2e.js`; delete `src/lib/shared/playgroundLink.test.js` together with its now-unused helper (Task 13).
- E2E never calls model providers: judge paths are pinned by unit tests (fake client) and cache-seeded E2E rows; the test env's `TYPESAFE_API_KEY` presence is not controllable, so no E2E depends on the judge being invoked.
- Sandbox contract untouched: `ArtifactFrame` stays `sandbox="allow-scripts"`, `referrerpolicy="no-referrer"`, `srcdoc`.
- Archive-first: no `DELETE` against the new tables; upserts only.
- Rate limits: `/api/visual-fit` 20/min, `/api/playground/links` 30/min, `/api/playground` unchanged (5/min, generation only). Refusals do not consume generation quota.
- Semicolons required, single quotes, PascalCase components, camelCase modules. Server code in `src/lib/server/**`, browser-only code guarded for SSR.
- Every commit runs the repo's pre-commit hook (full E2E, ~2 min). Keep each commit green.

## Review Focus

- **Anonymous → signed-in identity for links.** A user who generated links before signing in must still see them (matching `user_explainers` semantics: `user_id = X OR (user_id IS NULL AND client_id = Y)`), and no identity may ever see another's links. Pinned by Task 5's db test (both branches + cross-identity invisibility).
- **Re-recording a link for the same test+question with a new cache key must replace, not duplicate.** Pinned by Task 5's db test (count stays 1, `cache_key`/`updated_at` change).
- **Every judge failure mode fails open and never persists a fake verdict** (no key, provider throw, 5 s timeout, malformed output, cache-read failure). Pinned by Task 4's unit tests; client-side fail-open (non-OK `/api/visual-fit` still shows the offer) by Task 10's stubbed E2E.
- **Embed lifecycle.** Collapsing a card unmounts the iframe; re-expanding remounts from retained HTML and issues **no** additional request. Pinned by Task 9's E2E stub call-count assertion.
- **A refused playground topic costs nothing on repeat** (verdict cached, no explainer row, no provider call) and never consumes generation quota. Pinned by Task 8's E2E double-post.

---

### Task 1: Intent record + storage schema

**Files:**
- Create: `.intent/changes/CHG-0025/proposal.md`
- Modify: `src/lib/server/storage.js` (DDL block inside `ensureStorageSchema`, `SCHEMA_VERSION` 15 → 16)
- Modify: `src/lib/server/schemaMigrations.test.js:28` (`DDL_FINGERPRINT`)

**Interfaces:**
- Consumes: nothing.
- Produces: tables `question_visual_fits` and `question_explainer_links` (all later tasks); `SCHEMA_VERSION = 16`.

- [ ] **Step 1: Open the change record**

Copy `.intent/changes/TEMPLATE/proposal.md` to `.intent/changes/CHG-0025/proposal.md`. Fill: `id: "CHG-0025"`, status `draft`, created_at now, a one-line `request` quoting the operator ("embed visual explanation in the review card, link it back to the question, judge worthiness with Jev before generating"), `scope.paths` covering every path this plan touches (`src/routes/api/playground/**`, `src/routes/api/visual-fit/**`, `src/lib/server/**`, `src/lib/client/**`, `src/lib/shared/**`, `src/lib/locales/**`, `tests/e2e/**`, `README.md`, `docs/architecture.md`, `docs/content-quality.md`), `links.related: ["CHG-0020", "CHG-0021", "CHG-0022", "CHG-0024"]`, and body sections Outcome / Scope / Preserved behavior / Test changes (the two recorded changes from Global Constraints) / Decisions and constraints (link the design doc with a `Design:` line) / Verification. Then run:

```bash
sh .intent/scripts/verify-change.sh --change .intent/changes/CHG-0025 --print-digest
```

Paste the printed digest into `proposal.digest`. Commit: `chore(intent): open CHG-0025 for inline visual explanations`.

- [ ] **Step 2: Write the failing fingerprint test run**

Run: `npx vitest run src/lib/server/schemaMigrations.test.js`
Expected: PASS (nothing changed yet) — this is the baseline.

- [ ] **Step 3: Add the DDL and bump `SCHEMA_VERSION`**

Inside the DDL block of `ensureStorageSchema()` in `src/lib/server/storage.js` (after the `user_explainers` statements, before the fingerprint end marker), add exactly:

```sql
CREATE TABLE IF NOT EXISTS question_visual_fits (
	id BIGSERIAL PRIMARY KEY,
	cache_key TEXT NOT NULL UNIQUE,
	language TEXT NOT NULL DEFAULT 'english',
	category TEXT NOT NULL,
	confidence REAL,
	model TEXT,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	last_used_at TIMESTAMPTZ DEFAULT NOW(),
	use_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_question_visual_fits_last_used
	ON question_visual_fits (last_used_at DESC);

CREATE TABLE IF NOT EXISTS question_explainer_links (
	id BIGSERIAL PRIMARY KEY,
	user_id BIGINT,
	client_id TEXT,
	test_id TEXT NOT NULL,
	question_index INTEGER NOT NULL,
	question_key TEXT NOT NULL,
	cache_key TEXT NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_question_explainer_links_user_test
	ON question_explainer_links (user_id, test_id, question_index) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_question_explainer_links_client_test
	ON question_explainer_links (client_id, test_id, question_index) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_question_explainer_links_user_lookup
	ON question_explainer_links (user_id, test_id);
CREATE INDEX IF NOT EXISTS idx_question_explainer_links_client_lookup
	ON question_explainer_links (client_id, test_id);
```

Change `const SCHEMA_VERSION = 15;` to `16`.

- [ ] **Step 4: Re-run the fingerprint test to get the new digest**

Run: `npx vitest run src/lib/server/schemaMigrations.test.js`
Expected: FAIL with the failure message printing `'<digest>:<version>'`. Copy that digest.

- [ ] **Step 5: Update `DDL_FINGERPRINT` and verify**

Set `DDL_FINGERPRINT` in `src/lib/server/schemaMigrations.test.js` to the printed `'<digest>:16'`. Run the same command. Expected: PASS (all three tests).

- [ ] **Step 6: Commit**

```bash
git add .intent/changes/CHG-0025 src/lib/server/storage.js src/lib/server/schemaMigrations.test.js
git commit -m "feat(storage): add visual-fit and question-link tables"
```

---

### Task 2: Pure judge engine

**Files:**
- Create: `src/lib/server/visualFit.js`
- Test: `src/lib/server/visualFit.test.js`

**Interfaces:**
- Consumes: nothing (pure, no imports).
- Produces: `VISUAL_FIT_KEY_VERSION = 'vf-v1'`, `VISUAL_FIT_MODEL = 'jev-latest'`, `VISUAL_FIT_MIN_PROBABILITY = 0.6`, `VISUAL_FIT_TIMEOUT_MS = 5000`, `buildVisualFitQuestions({ topic, question, answer })`, `deriveVisualFit(answers)`.

- [ ] **Step 1: Write the failing test**

`visualFit.test.js` (mirror the `intentParse.test.js` comment style; these are the exact assertions):

- `deriveVisualFit` with answer `{ type: 'choice', choice: 'worth_it', probabilities: { worth_it: 0.83, too_vague: 0.1, not_visual: 0.07 }, confidence: 0.9 }` → `{ category: 'worth_it', confidence: 0.83, suggested: true }`.
- Same with `worth_it: 0.59` → `suggested: false` (category still `worth_it`; threshold is `>= 0.6`, so also add a `0.6` case → `true`).
- `choice: 'too_vague', probabilities: { too_vague: 0.9, ... }` → `{ category: 'too_vague', suggested: false }`.
- `not_visual` 0.7 vs `too_vague` 0.4 → `not_visual`.
- Tie at 0.5 between `worth_it` and `too_vague` → `worth_it` (criteria order breaks ties), `suggested: false`.
- Missing `answers`, `answers.visual_fit` of a wrong `type`, and `choice: 'banana'` → `{ category: 'unknown', confidence: null, suggested: false }`.
- `buildVisualFitQuestions({ topic: 'X', question: 'Q?', answer: 'A' })` → object with exactly `visual_fit`; its `type` is `'choice'`; `Object.keys(criteria)` equals `['worth_it', 'too_vague', 'not_visual']`; each criterion is a non-empty string.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/visualFit.test.js`
Expected: FAIL ("Cannot find module './visualFit'" or undefined exports).

- [ ] **Step 3: Implement the engine**

Exports as listed above. `deriveVisualFit` reads `answers?.visual_fit`; returns `'unknown'` unless `type === 'choice'` and the choice is one of the three categories. `confidence` is `Number(answer.probabilities?.[choice])`, `null` when not finite. `suggested` is `category === 'worth_it' && confidence >= VISUAL_FIT_MIN_PROBABILITY`. Tie-break: iterate `['worth_it', 'too_vague', 'not_visual']` and keep the first strictly-highest probability (document the tie rule in a comment). The criteria strings (final wording, no em dashes): `worth_it`: "the answer turns on a process, mechanism, spatial arrangement, motion, change over time, or a quantity/geometry relationship that an animation would teach faster than prose"; `too_vague`: "the question and context are too thin or generic to visualize anything specific"; `not_visual`: "the topic is conceptual, definitional, factual, verbal, or list-like, where text is the right medium".

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/server/visualFit.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/visualFit.js src/lib/server/visualFit.test.js
git commit -m "feat(playground): add the pure visual-fit judge engine"
```

---

### Task 3: Verdict cache

**Files:**
- Create: `src/lib/server/visualFitCache.js`
- Test: `src/lib/server/visualFitCache.test.js`

**Interfaces:**
- Consumes: `VISUAL_FIT_KEY_VERSION` from `./visualFit.js`; `ensureStorageSchema`, `query` from `./storage.js`.
- Produces: `buildVisualFitCacheKey({ topic, question, answer, language })`; `getCachedVisualFit(cacheKey) → { category, confidence, language, model } | null`; `saveVisualFit({ cacheKey, language, category, confidence, model }) → boolean`; `touchVisualFit(cacheKey)`.

- [ ] **Step 1: Write the failing key test**

`visualFitCache.test.js` mirrors `explainerCache.test.js`: an independently computed `createHash('sha256').update(JSON.stringify(['vf-v1', normalize(language).toLowerCase() || 'english', normalize(topic), normalize(question ?? ''), normalize(answer ?? '')])).digest('hex')` must equal `buildVisualFitCacheKey(...)` for a full input. Then the same behaviors as the explainer test: whitespace collapse, NFC-insensitivity, case preservation, language default + lowercasing, missing context as empty strings, and topic/question/answer each separating the key.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/visualFitCache.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the module**

Key builder as pinned in the test (module-local `normalizeText` identical to `explanationCache.js`). `getCachedVisualFit` selects `category, confidence, language, model` by `cache_key` and returns the row or null. `saveVisualFit` inserts with `ON CONFLICT (cache_key) DO NOTHING` (category/language/model/confidence; store `confidence` as a number or null). `touchVisualFit` runs `UPDATE question_visual_fits SET use_count = use_count + 1, last_used_at = NOW() WHERE cache_key = $1`. All statements call `ensureStorageSchema()` first and take a bounded `cacheKey` guard (return early on falsy), mirroring `explanationCache.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/server/visualFitCache.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/visualFitCache.js src/lib/server/visualFitCache.test.js
git commit -m "feat(playground): cache visual-fit verdicts by content"
```

---

### Task 4: Judge orchestrator (fail-open)

**Files:**
- Create: `src/lib/server/visualFitJudge.js`
- Test: `src/lib/server/visualFitJudge.test.js`

**Interfaces:**
- Consumes: `buildVisualFitQuestions`, `deriveVisualFit`, `VISUAL_FIT_MODEL`, `VISUAL_FIT_TIMEOUT_MS` from `./visualFit.js`; `buildVisualFitCacheKey`, `getCachedVisualFit`, `saveVisualFit`, `touchVisualFit` from `./visualFitCache.js`.
- Produces: `judgeVisualFit({ topic, question, answer, language = 'english', client, cache }) → Promise<{ suggested, category, confidence, cached, degraded }>`. `cache` defaults to the real module functions `{ getCachedVisualFit, saveVisualFit, touchVisualFit }`; `client` is a System One client or `null`.

- [ ] **Step 1: Write the failing tests (fake client + fake cache, no DB, no network)**

Using a fake `cache` object with `vi.fn()`s and fake clients:

1. Cache hit (`getCachedVisualFit` resolves `{ category: 'worth_it', confidence: 0.9, ... }`) → `{ suggested: true, cached: true, degraded: false }`, `touchVisualFit` called, client never called.
2. Miss + client resolves `{ answers: { visual_fit: { type: 'choice', choice: 'worth_it', probabilities: { worth_it: 0.9 }, confidence: 0.9 } } }` → `suggested: true, cached: false, degraded: false`, `saveVisualFit` called with `category: 'worth_it'`.
3. Miss + client rejects → `{ suggested: true, category: 'unknown', cached: false, degraded: true }`, `saveVisualFit` NOT called.
4. Miss + `client: null` → degraded shape, `saveVisualFit` NOT called.
5. Miss + client resolves malformed (`{ answers: {} }`) → degraded shape, no save.
6. Miss + client that never resolves → with fake timers, advance 5000 ms → degraded shape.
7. `getCachedVisualFit` rejects → client still called; verdict returned (degraded flag follows the judge outcome).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/visualFitJudge.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the orchestrator**

Flow: `cacheKey = buildVisualFitCacheKey({ topic, question, answer, language })`; try cache read (on throw: `console.error` and continue). On hit: best-effort `touchVisualFit`; return `{ suggested: cached.category === 'worth_it' && cached.confidence >= VISUAL_FIT_MIN_PROBABILITY, category, confidence, cached: true, degraded: false }`. On miss: if `!client` return the degraded shape; else `withTimeout(client.systemOne({ state: { topic, question, answer }, questions: buildVisualFitQuestions({ topic, question, answer }), model: VISUAL_FIT_MODEL }), VISUAL_FIT_TIMEOUT_MS)` (module-local `withTimeout` copied from the personalize pattern); `deriveVisualFit(response.answers)`; if `category === 'unknown'` return degraded; else best-effort `saveVisualFit` (errors logged, never thrown) and return `{ suggested, category, confidence, cached: false, degraded: false }`. Catch-all returns the degraded shape `{ suggested: true, category: 'unknown', confidence: null, cached: false, degraded: true }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/visualFitJudge.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/visualFitJudge.js src/lib/server/visualFitJudge.test.js
git commit -m "feat(playground): orchestrate the visual-fit judge with fail-open"
```

---

### Task 5: Question↔explainer links module

**Files:**
- Create: `src/lib/server/questionExplainerLinks.js`
- Test: `src/lib/server/questionExplainerLinks.db.test.js`

**Interfaces:**
- Consumes: `ensureStorageSchema`, `normalizeAttemptIdentity`, `query` from `./storage.js`.
- Produces: `buildQuestionLinkKey(question, answer)` → `"<normalized question>::<normalized answer>"`; `UPSERT_USER_QUESTION_EXPLAINER_LINK_SQL`; `UPSERT_CLIENT_QUESTION_EXPLAINER_LINK_SQL`; `LIST_QUESTION_EXPLAINER_LINKS_SQL`; `recordQuestionExplainerLink(identity, { testId, questionIndex, questionKey, cacheKey }) → Promise<boolean>`; `listQuestionExplainerLinks(identity, testId) → Promise<Array<{ questionIndex, cacheKey, questionKey, createdAt, libraryId, title, slug }>>`.

- [ ] **Step 1: Write the failing db test**

`questionExplainerLinks.db.test.js` uses `new PGlite()` + `db.exec` (auth.db.test pattern) to create minimal `question_explainer_links`, `user_explainers`, `concept_explainers` tables **with the same partial unique indexes the real schema has** (both `(user_id|client_id, test_id, question_index)` indexes, `WHERE` clauses included), then runs the exported SQL constants. Assertions:

1. Client-branch upsert then list: item has `questionIndex`, `libraryId` (from seeded `user_explainers` row), `title`, `slug` (from seeded `concept_explainers` row).
2. Re-upsert the same `(test_id, question_index)` with a different `cache_key` → `COUNT(*)` for that pair is still 1 and `cache_key` changed.
3. Identity isolation: a row recorded for `client_id 'c-a'` is invisible with params `(testId, null, 'c-b')` and `(testId, 7, null)`; a row recorded with `user_id = 7` is invisible to the client branch and visible only to `(testId, 7, null)`.
4. Two different `question_index` values in one test both list back.
5. A link whose `cache_key` has no matching `user_explainers` row is dropped from the list (INNER JOIN).
6. `recordQuestionExplainerLink` with no identity or missing `testId`/`cacheKey` returns `false` and writes nothing.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/server/questionExplainerLinks.db.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement the module and pinned SQL**

Export the SQL constants exactly as the test runs them. Upserts (partial-index inference, same shape as `user_explainers`):

```sql
INSERT INTO question_explainer_links (user_id, client_id, test_id, question_index, question_key, cache_key)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (user_id, test_id, question_index) WHERE user_id IS NOT NULL
DO UPDATE SET cache_key = EXCLUDED.cache_key, question_key = EXCLUDED.question_key, updated_at = NOW()
```

(the client statement mirrors it with `client_id`/`user_id` swapped and `WHERE user_id IS NULL`).

```sql
SELECT l.question_index, l.cache_key, l.question_key, l.created_at,
       ue.id AS library_id, ue.title, c.slug
FROM question_explainer_links l
INNER JOIN user_explainers ue
  ON ue.cache_key = l.cache_key
 AND (ue.user_id = $2 OR (ue.user_id IS NULL AND ue.client_id = $3))
LEFT JOIN concept_explainers c ON c.cache_key = l.cache_key
WHERE l.test_id = $1
  AND (l.user_id = $2 OR (l.user_id IS NULL AND l.client_id = $3))
ORDER BY l.created_at DESC
```

`recordQuestionExplainerLink` normalizes identity with `normalizeAttemptIdentity`, calls `ensureStorageSchema`, picks the user branch when `userId` is set (passing `[userId, clientId ?? null, testId, questionIndex, questionKey, cacheKey]`) else the client branch, and returns whether a row was written. `listQuestionExplainerLinks` maps rows to the shape above (`Number(row.question_index)`, `libraryId: row.library_id`, `title: row.title`, `slug: row.slug ?? null`, `createdAt: row.created_at`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/server/questionExplainerLinks.db.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/questionExplainerLinks.js src/lib/server/questionExplainerLinks.db.test.js
git commit -m "feat(playground): record and list question-to-explainer links"
```

---

### Task 6: `POST /api/visual-fit`

**Files:**
- Create: `src/routes/api/visual-fit/+server.js`
- Test: `tests/e2e/visual-explanation.e2e.js` (new file; its first tests)

**Interfaces:**
- Consumes: `resolveRequestContext` (`#lib/server/apiContext.js`), `parseRequestBody`, `rateLimiter`, `logApiEvent`, `classifyApiError`, `judgeVisualFit`, limits from `#lib/server/quizConfig.js`, `TYPESAFE_API_KEY` from `$app/env/private`, `TypeSafeClient` from `@typesafe-ai/sdk`.
- Produces: the HTTP contract other tasks and the client rely on: 200 `{ suggested, category, confidence, cached, degraded }`; 400 `VISUAL_FIT_FIELDS_REQUIRED` / `VISUAL_FIT_FIELDS_TOO_LONG` / `INVALID_LANGUAGE`; 413 `REQUEST_TOO_LARGE`; 429 `API_LIMIT_ERROR_CODE`; 500 `VISUAL_FIT_FAILED`.

- [ ] **Step 1: Write the failing E2E**

In `tests/e2e/visual-explanation.e2e.js` (headers/imports copied from `playground.e2e.js`), add and run these three tests:

1. `POST /api/visual-fit` without a question → 400 `VISUAL_FIT_FIELDS_REQUIRED`.
2. With `question` over `MAX_QUESTION_TEXT_LENGTH` → 400 `VISUAL_FIT_FIELDS_TOO_LONG`; with `language: 'klingon'` → 400 `INVALID_LANGUAGE`.
3. Seeded cache verdict: compute the key independently (local `normalizeText` + `createHash('sha256')` over `['vf-v1', 'english', 'e2e-fit-topic', 'Q?', 'A']`), insert `question_visual_fits (cache_key, language, category, confidence, model)` through `sqlClient(request)`, then `POST /api/visual-fit { topic: 'e2e-fit-topic', question: 'Q?', answer: 'A' }` with `x-client-id` → 200 `{ cached: true, category: 'worth_it', suggested: true, degraded: false }` (deterministic: a cache hit never calls the provider).

Run: `npx playwright test tests/e2e/visual-explanation.e2e.js`
Expected: FAIL (404 route).

- [ ] **Step 2: Implement the route**

Mirror the `/api/explain` skeleton (resolve context → parse body → validate → rate limit → work → log → respond). Validation: `question` and `answer` required non-empty strings within `MAX_QUESTION_TEXT_LENGTH` / `MAX_ANSWER_TEXT_LENGTH`; `topic` optional ≤ `MAX_TOPIC_LENGTH`; `language` ∈ `VALID_LANGUAGES` (default `english`). Rate limit: `rateLimiter(request, { bucket: '/api/visual-fit', limit: 20 })`. Client: `TYPESAFE_API_KEY ? new TypeSafeClient({ apiKey: TYPESAFE_API_KEY, timeout: 5000, retry: { maxRetries: 0, apiTimeoutError: false } }) : null`. Call `judgeVisualFit({ topic, question, answer, language, client })`. `logApiEvent({ route: '/api/visual-fit', action: 'judge_visual_fit', clientKey, clientId, request, statusCode: 200, durationMs, metadata: { category, confidence, cached, degraded } })`. Errors via `classifyApiError` with fallback code `VISUAL_FIT_FAILED`.

- [ ] **Step 3: Run the E2E to verify it passes**

Run: `npx playwright test tests/e2e/visual-explanation.e2e.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/visual-fit/+server.js tests/e2e/visual-explanation.e2e.js
git commit -m "feat(playground): expose the visual-fit judgment endpoint"
```

---

### Task 7: `GET /api/playground/links`

**Files:**
- Create: `src/routes/api/playground/links/+server.js`
- Test: `tests/e2e/visual-explanation.e2e.js` (append)

**Interfaces:**
- Consumes: `resolveRequestContext`, `rateLimiter`, `logApiEvent`, `classifyApiError`, `listQuestionExplainerLinks`.
- Produces: GET contract: `{ items: [{ questionIndex, libraryId, slug, title, createdAt }] }` with `Cache-Control: no-store`; 400 `LINKS_TESTID_REQUIRED`; 429.

- [ ] **Step 1: Write the failing E2E**

Append to `tests/e2e/visual-explanation.e2e.js`:

1. Seed through `sqlClient(request)`: a `concept_explainers` row (reuse the seeded-explainer insert shape, computing the key with the real `pg-v2` tuple — copy `cacheKeyFor` from `playground.e2e.js`), a `user_explainers` row (`user_id NULL, client_id 'e2e-links-alpha'`, matching `cache_key`, `title 'Linked title'`), and a `question_explainer_links` row (`client_id` same, `test_id 'e2e-links-test'`, `question_index 2`, matching `cache_key`).
2. `GET /api/playground/links?testId=e2e-links-test` with `x-client-id: e2e-links-alpha` → 200, one item `{ questionIndex: 2, libraryId: <id>, slug: <slug>, title: 'Linked title' }`, `cache-control: no-store`.
3. Same read with `x-client-id: e2e-links-beta` → `{ items: [] }`.
4. `GET /api/playground/links` without `testId` → 400 `LINKS_TESTID_REQUIRED`; `testId` of 200 chars → 400.

Run: `npx playwright test tests/e2e/visual-explanation.e2e.js`
Expected: FAIL (404).

- [ ] **Step 2: Implement the route**

GET handler: resolve context → validate `testId` (string, trimmed, 1–128 chars) → rate limit (bucket `/api/playground/links`, limit 30) → `listQuestionExplainerLinks(identity, testId)` → `logApiEvent` (`action: 'read_links'`, metadata `{ count }`) → `Response.json({ items }, { headers: { 'Cache-Control': 'no-store' } })` mapping rows to `{ questionIndex, libraryId, slug, title, createdAt }`. Errors via `classifyApiError` fallback `LINKS_FAILED`.

- [ ] **Step 3: Run the E2E to verify it passes**

Run: `npx playwright test tests/e2e/visual-explanation.e2e.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/playground/links/+server.js tests/e2e/visual-explanation.e2e.js
git commit -m "feat(playground): list a test's question links for the caller"
```

---

### Task 8: Playground gate, `source`, link recording, library `source`

**Files:**
- Modify: `src/routes/api/playground/+server.js`
- Modify: `src/lib/server/explainerLibrary.js` (list query gains `source`)
- Modify: `src/routes/api/playground/library/+server.js` (`mapExplainerItem` gains `source`)
- Test: `tests/e2e/playground.e2e.js` (append)

**Interfaces:**
- Consumes: `judgeVisualFit`, `recordQuestionExplainerLink`, `buildQuestionLinkKey`, `TYPESAFE_API_KEY`.
- Produces: request field `source: { testId, questionIndex }`; refusal `200 { code: 'VISUAL_NOT_WORTHY', category }`; library list items gain `source: { testId, questionIndex } | null`.

- [ ] **Step 1: Write the failing E2E**

Append to `tests/e2e/playground.e2e.js` (helpers already present there):

1. **Refusal, cached verdict, no spend:** seed `question_visual_fits` with the independently computed `vf-v1` key for `{ topic: 'e2e-fit-refuse', question: '', answer: '' }` → category `not_visual`, confidence 0.9. `POST /api/playground { topic: 'e2e-fit-refuse', profile: { viewport: 'wide', budget: 'full' } }` with `x-client-id 'e2e-fit-client'` → 200 `{ code: 'VISUAL_NOT_WORTHY', category: 'not_visual' }`; assert `SELECT COUNT(*)` on `concept_explainers` for the independently computed explainer key is 0. Post again → identical response (second call is deterministic: cached verdict, still no row).
2. **Linked serve:** seed an explainer (`seedExplainer`) for topic `e2e-link-serve` then `POST /api/playground { topic, source: { testId: 'e2e-src-test', questionIndex: 4 }, ... }` with `x-client-id 'e2e-src-client'` → 200 `cached: true`; assert a `question_explainer_links` row exists with `test_id 'e2e-src-test'`, `question_index 4`, the explainer `cache_key`; `GET /api/playground/library` with the same client → the item has `source: { testId: 'e2e-src-test', questionIndex: 4 }`; `GET /api/playground/links?testId=e2e-src-test` → one item.
3. **Malformed source ignored:** `source: { testId: 123, questionIndex: 'x' }` → serve still 200 (no link row).
4. Attach evidence JSON via `testInfo.attach` in each (counts, codes).

Run: `npx playwright test tests/e2e/playground.e2e.js`
Expected: FAIL.

- [ ] **Step 2: Implement the route changes**

In `POST /api/playground`: add a local `normalizeSource(value)` returning `{ testId, questionIndex } | null` (string trim 1–128; integer 0–999). Build the judge client exactly as in Task 6 (`TYPESAFE_API_KEY ? new TypeSafeClient(...) : null`). Order on the request: validation → `getCachedExplainer` → **if cached**: touch, record library, backfill slug, `recordLink` (new best-effort try/catch helper calling `recordQuestionExplainerLink(identity, { testId, questionIndex, questionKey: buildQuestionLinkKey(question, answer), cacheKey })`), log, respond (unchanged body) → **on miss**: `judgeVisualFit({ topic, question, answer, language: effectiveLanguage, client })`; if `!verdict.suggested` → `logApiEvent` (metadata `{ topic, language, notWorthy: true, judgeCategory, judgeCached, judgeDegraded }`) and `return Response.json({ code: 'VISUAL_NOT_WORTHY', category: verdict.category })` **before** the rate limiter → then rate limit → generate → save → `recordLink` → log (metadata adds `judgeCategory`, `judgeCached`, `judgeDegraded`) → respond.

In `explainerLibrary.js` `listExplainersForIdentity`, add to the inner select:

```sql
(SELECT json_build_object('testId', l.test_id, 'questionIndex', l.question_index)
   FROM question_explainer_links l
  WHERE l.cache_key = ue.cache_key
    AND (l.user_id = $1 OR (l.user_id IS NULL AND l.client_id = $2))
  ORDER BY l.updated_at DESC
  LIMIT 1) AS source
```

In `mapExplainerItem` add `source: row.source ?? null`.

- [ ] **Step 3: Run the E2E to verify it passes**

Run: `npx playwright test tests/e2e/playground.e2e.js`
Expected: PASS (existing tests stay green: seeded-cache hits skip the judge by design).

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/playground/+server.js src/routes/api/playground/library/+server.js src/lib/server/explainerLibrary.js tests/e2e/playground.e2e.js
git commit -m "feat(playground): judge before generating and link served explainers to questions"
```

---

### Task 9: Review card visual section (build, embed, links restore, hash expand)

**Files:**
- Create: `src/lib/client/VisualExplainerSection.svelte`
- Modify: `src/lib/client/ResultReviewItem.svelte:179-194` (replace the `{#if topic}` playground link with the section)
- Modify: `src/lib/client/ResultReviewList.svelte` (props pass-through: `visual`, `onBuildVisual`, `onOpenVisual`)
- Modify: `src/routes/results/+page.svelte` (state + handlers below)
- Modify: `src/lib/shared/telemetryEvents.js` (add 3, remove 1)
- Modify: `src/lib/locales/english.json`, `src/lib/locales/hindi.json` (keys below)
- Test: `tests/e2e/visual-explanation.e2e.js` (append)

**Interfaces:**
- Consumes: `GET /api/playground/links`, `GET /api/playground/library?id=`, `POST /api/playground` (Task 8), `getClientHeaders`, `localizedApiError`, `questionTextFor`, `bucketClientProfile`, `normalizePlaygroundProfile` (server), `shareLink`, `track`, `localizedPath`.
- Produces: `VisualExplainerSection` props `{ status = 'hidden', artifact = null, error = '', onBuild, onShow }` with `status ∈ 'hidden' | 'offer' | 'available' | 'building' | 'ready' | 'error'`; results-page state `visualLinks`, `visualState`; handlers `loadVisualLinks`, `ensureVisual`, `buildVisual`, `openVisual`. Task 10 extends `ensureVisual`; Task 11 reuses nothing here.

- [ ] **Step 1: Add locale keys and telemetry entries**

English (Hindi mirrored in the same commit, wording may be refined): `visualExplainHeading: 'Visual explanation'`, `visualBuild: 'Build visual explanation'`, `visualShow: 'Show visual explanation'`, `visualOpenPage: 'Open full page'`, `visualBuildError: 'The visual explanation could not be built. Please retry.'`.
Telemetry: add `results:visual-build`, `results:visual-open`, `results:visual-share`; remove `playground:entry-from-review` (its emit site disappears in Step 3). Run `npx vitest run src/lib/shared/telemetryEvents.test.js` → PASS only after Step 3 lands.

- [ ] **Step 2: Write the failing E2E**

Append to `tests/e2e/visual-explanation.e2e.js` (seed pattern from `results-hero.e2e.js`: `selftest_history` via `addInitScript`, viewport 390×844):

1. **Available → open (real endpoints, no model calls):** seed DB rows (client `e2e-visual-alpha`): `concept_explainers` + `user_explainers` + `question_explainer_links` for `test_id 'e2e-visual-a'`, `question_index 0`; seed history with one question (`Q1`, options, answer `A1`) under id `e2e-visual-a`; `page.addInitScript` sets `selftest_client_id` to `e2e-visual-alpha`; `page.goto('/results?id=e2e-visual-a')`; expand the card; expect the heading `Visual explanation` and button `Show visual explanation`; click it; expect `iframe.artifact-frame` visible with the seeded marker, `sandbox === 'allow-scripts'`, and a link `Open full page` whose href is `/explain/<slug>`.
2. **Stubbed build lifecycle:** with `page.route('**/api/playground', ...)` returning `{ title, summary, slug, html: <marker doc> }`, expand a card (no link seeded) → click `Build visual explanation` → loading copy visible → iframe with marker; collapse the card → iframe count 0; expand again → iframe back with the marker and the stub was called **exactly once** (assert with a counter in the route handler).
3. **Stubbed error → retry:** route responds 429 `{ code, error: 'Rate limit exceeded. Please try again later.' }` → error text visible with a `Try again` button.

Run: `npx playwright test tests/e2e/visual-explanation.e2e.js`
Expected: FAIL.

- [ ] **Step 3: Implement the component, card, and results plumbing**

`VisualExplainerSection.svelte`: renders nothing for `hidden`; a bordered section with heading `visualExplainHeading` + `visualBuild` button for `offer`; `visualShow` button for `available`; thinking-dots + `playgroundPlanning` copy for `building`; for `ready`: `ExplainerHeader` (default card size) with `Share` (`shareLink({ title, text: summary, url })`, `track('results:visual-share', { method })`) and an `<a>` `Open full page` to `localizedPath('/explain/' + artifact.slug, $activeLanguage)`; `error` renders the message + `tryAgain` button calling `onBuild`; the whole section is `no-print` and the iframe is `ArtifactFrame`.

`ResultReviewItem.svelte`: replace lines ~179-194 (the `buildPlaygroundHref` link and its `track('playground:entry-from-review')`) with `<VisualExplainerSection status={visual?.status ?? 'hidden'} artifact={visual?.artifact ?? null} error={visual?.error ?? ''} onBuild={() => onBuildVisual(index, question)} onShow={() => onOpenVisual(index)} />`, placed after the explanation region. `ResultReviewList` passes the page's per-index object through: `visual={visualState[index]}` (with `visualState` the map defined next).

Results page: state maps `visualLinks = $state({})`, `visualState = $state({})`; `loadVisualLinks(testId)` fetches `/api/playground/links?testId=` once after the paper resolves (silent on failure) and applies `visualLinks[index] = item; visualState[index] = { status: 'available', artifact: null, error: '' }`. `ensureVisual(index, question)`: link exists → keep `available`; else → `{ status: 'offer' }` (Task 10 replaces this with the verdict call). `toggleExpanded` calls `void ensureVisual(...)` when opening. `buildVisual(index, question)`: `track('results:visual-build', { index })`; status `building`; POST `/api/playground` with `{ topic: questionPaper.topic, question: questionTextFor(question), answer: question.answer, language: questionPaper.requestParams?.language || 'english', theme, profile, source: { testId: questionPaper.id, questionIndex: index } }` (theme/profile as in `PlaygroundPage.generate`); on `code === 'VISUAL_NOT_WORTHY'` → `hidden`; on success `{ status: 'ready', artifact }`; else `{ status: 'error', error: localizedApiError(...) }`. `openVisual(index)`: `track('results:visual-open', { index })`; GET `/api/playground/library?id=${link.libraryId}&theme=` → `ready`. Add hash expand on mount: parse `#question-N`, set `expanded[N] = true`, after next tick `scrollIntoView` the `#question-N` article.

- [ ] **Step 4: Run the E2E to verify it passes**

Run: `npx playwright test tests/e2e/visual-explanation.e2e.js`
Expected: PASS. Also run `npx vitest run src/lib/shared/telemetryEvents.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/VisualExplainerSection.svelte src/lib/client/ResultReviewItem.svelte src/lib/client/ResultReviewList.svelte src/routes/results/+page.svelte src/lib/shared/telemetryEvents.js src/lib/locales/english.json src/lib/locales/hindi.json tests/e2e/visual-explanation.e2e.js
git commit -m "feat(results): build and embed visual explanations inside review cards"
```

---

### Task 10: Verdict gate on review cards (fail-open)

**Files:**
- Modify: `src/routes/results/+page.svelte` (`ensureVisual` + `visualFit` map)
- Test: `tests/e2e/visual-explanation.e2e.js` (append)

**Interfaces:**
- Consumes: `POST /api/visual-fit` (Task 6).
- Produces: per-index `visualFit` map `{ status: 'loading' | 'done', suggested: boolean, degraded: boolean }`; no new exports.

- [ ] **Step 1: Write the failing E2E**

Append three stubbed tests (`page.route('**/api/visual-fit', ...)`, history-seeded paper, no DB):

1. `{ suggested: true, category: 'worth_it', degraded: false }` → `Build visual explanation` visible after the card expands, and the route was called **exactly once** for that question (counter; collapsing and re-expanding does not refetch).
2. `{ suggested: false, category: 'not_visual', degraded: false }` → no build button, no section heading.
3. Route fulfills 429 → build button still visible (fail-open).

Run: `npx playwright test tests/e2e/visual-explanation.e2e.js`
Expected: FAIL (all three: no verdict fetch exists yet).

- [ ] **Step 2: Implement the gate**

`ensureVisual(index, question)`: if a link exists → `available`. Else if `visualFit[index]?.status === 'done'` → apply. Else mark `{ status: 'loading' }`, POST `/api/visual-fit` with `{ topic: questionPaper.topic, question: questionTextFor(question), answer: question.answer, language: questionPaper.requestParams?.language || 'english' }` + `getClientHeaders()`; on 2xx set `{ status: 'done', suggested: Boolean(payload.suggested), degraded: Boolean(payload.degraded) }`; on any non-OK or throw set `{ status: 'done', suggested: true, degraded: true }` (fail-open). Apply: `suggested || degraded` → `{ status: 'offer' }` else `{ status: 'hidden' }`. Never fetch twice per index (guard on existing map entry).

- [ ] **Step 3: Run the E2E to verify it passes**

Run: `npx playwright test tests/e2e/visual-explanation.e2e.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/results/+page.svelte tests/e2e/visual-explanation.e2e.js
git commit -m "feat(results): gate the visual affordance on the Jev visual-fit verdict"
```

---

### Task 11: Playground judging stage, refusal panel, provenance chip

**Files:**
- Modify: `src/lib/client/pages/PlaygroundPage.svelte`
- Modify: `src/lib/shared/telemetryEvents.js` (add `playground:judge-declined`)
- Modify: `src/lib/locales/english.json`, `hindi.json` (keys below)
- Test: `tests/e2e/playground.e2e.js` (append)

**Interfaces:**
- Consumes: refusal response `{ code: 'VISUAL_NOT_WORTHY', category }` (Task 8); library item `source` (Task 8).
- Produces: nothing downstream.

- [ ] **Step 1: Add locale keys and telemetry**

English (Hindi mirrored): `playgroundJudging: 'Checking if a visual helps...'`, `visualFitNotWorthyTitle: "A visual won't add much here"`, `visualFitVagueHint: 'Add what you want to see: the process, the change, or the relationship.'`, `visualFitTextFirstHint: 'This topic reads as text-first. Name the process or mechanism you have in mind and try again.'`, `playgroundFromYourTest: 'From your test'`. Telemetry: add `playground:judge-declined`.

- [ ] **Step 2: Write the failing E2E**

Append to `tests/e2e/playground.e2e.js`:

1. **Judging stage:** stub `**/api/playground` with a 1500 ms delayed 200; `page.goto('/playground')`; fill the topic; click Generate; expect `Checking if a visual helps...` visible, then the artifact title.
2. **Refusal panel:** stub returns `{ code: 'VISUAL_NOT_WORTHY', category: 'too_vague' }` with status 200; click Generate → expect the panel title + `visualFitVagueHint` text, no iframe; then change the stub to a normal 200, edit the topic, Generate → artifact visible (the input stayed editable).
3. **Provenance chip:** reuse the Task 8 seeding (explainer + `source` serve) through the API with `x-client-id 'e2e-prov-client'`; `page.addInitScript` sets that client id; `page.goto('/playground')` → the library item shows `From your test` with `href` containing `/results?id=e2e-src-test#question-4`.

Run: `npx playwright test tests/e2e/playground.e2e.js`
Expected: FAIL.

- [ ] **Step 3: Implement the page changes**

Stages: on `generate()` set `stage = 'judging'` and replace the single interval with two timeouts (`2000 → stage = 'planning'`, `7000 → stage = 'drawing'`), both cleared in `finally`. Render the button label with `$t(stage === 'judging' ? 'playgroundJudging' : stage === 'drawing' ? 'playgroundDrawing' : 'playgroundPlanning')`. Handle the refusal: after `const payload = await response.json()`, if `response.ok && payload.code === 'VISUAL_NOT_WORTHY'` → `status = 'refused'`, `refusalCategory = payload.category`, `track('playground:judge-declined', { category: payload.category })`, return (skip `playground:generate-result`). Render `{#if status === 'refused'}` a bordered guidance panel (title + category hint: `too_vague` → `visualFitVagueHint`; `not_visual` → `visualFitTextFirstHint`) above the form; the Generate button stays enabled and `reset()` clears the refusal. Library items: when `item.source`, render a chip `<a href={`/results?id=${encodeURIComponent(item.source.testId)}#question-${item.source.questionIndex}`}>{$t('playgroundFromYourTest')}</a>` inside `.playground-library-meta`.

- [ ] **Step 4: Run the E2E to verify it passes**

Run: `npx playwright test tests/e2e/playground.e2e.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/client/pages/PlaygroundPage.svelte src/lib/shared/telemetryEvents.js src/lib/locales/english.json src/lib/locales/hindi.json tests/e2e/playground.e2e.js
git commit -m "feat(playground): judge before generating and guide instead of refusing silently"
```

---

### Task 12: Public explainer page CTA

**Files:**
- Modify: `src/lib/client/pages/PublicExplainerPage.svelte` (actions slot)
- Modify: `src/lib/locales/english.json`, `hindi.json` (`explainCreateOwn`)
- Test: `tests/e2e/playground.e2e.js` (extend the slug test)

**Interfaces:**
- Consumes: `localizedPath`, `activeLanguage`.
- Produces: nothing downstream.

- [ ] **Step 1: Extend the slug E2E**

In the existing `publishes each explainer at a unique slug URL with a shareable page` test, after the page renders, expect a link `Create your own explainer` with `href` `/playground` (and, opening the `/hi/explain/<slug>` twin, `href` `/hi/playground`).

Run: `npx playwright test tests/e2e/playground.e2e.js --grep slug`
Expected: FAIL.

- [ ] **Step 2: Implement**

Add `explainCreateOwn: 'Create your own explainer'` (Hindi mirrored) and, inside `ExplainerHeader`'s children next to the Share button, `<a class="btn btn-sm btn-outline-secondary" href={localizedPath('/playground', $activeLanguage)}>{$t('explainCreateOwn')}</a>`.

- [ ] **Step 3: Run the E2E to verify it passes**

Run: `npx playwright test tests/e2e/playground.e2e.js --grep slug`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/client/pages/PublicExplainerPage.svelte src/lib/locales/english.json src/lib/locales/hindi.json tests/e2e/playground.e2e.js
git commit -m "feat(explain): point public explainer visitors at the playground"
```

---

### Task 13: Remove the dead deep-link helper; docs

**Files:**
- Delete: `src/lib/shared/playgroundLink.js`, `src/lib/shared/playgroundLink.test.js`
- Modify: `README.md`, `docs/architecture.md`, `docs/content-quality.md`
- Verify: no remaining references

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Verify nothing imports the helper**

Run: `grep -rn "playgroundLink\|buildPlaygroundHref" src tests` — Expected: only the two files being deleted. (The playground still reads `topic`/`question`/`answer` URL params directly; its deep-link E2E keeps passing because the contract itself is unchanged.)

- [ ] **Step 2: Delete and run the suites**

`git rm src/lib/shared/playgroundLink.js src/lib/shared/playgroundLink.test.js`, then run `npx vitest run src/lib/shared/` → PASS.

- [ ] **Step 3: Update docs**

README endpoint list: add `POST /api/visual-fit`, `GET /api/playground/links`, and the `source` field on `POST /api/playground`. `docs/architecture.md`: a paragraph on the review-card embed flow, the shared judge gate, and the link tables. `docs/content-quality.md`: note the judge is a token gate, not a quality gate (artifact quality stays `eval:artifact`).

- [ ] **Step 4: Commit**

```bash
git add -A src/lib/shared/playgroundLink.js src/lib/shared/playgroundLink.test.js README.md docs/architecture.md docs/content-quality.md
git commit -m "chore(playground): drop the dead deep-link helper and document the embed flow"
```

---

### Task 14: Conformance and full gates

**Files:**
- Create: `.intent/changes/CHG-0025/conformance.md`
- Modify: `.intent/changes/CHG-0025/proposal.md` (`status: complete`)

**Interfaces:**
- Consumes: everything.
- Produces: the completed change record.

- [ ] **Step 1: Run the full gates**

Run each, all must pass: `npm run lint`, `npm run check`, `npm run test`, `npm run test:e2e`, `npm run verify:vercel`. Record the actual outputs (counts) for the conformance file.

- [ ] **Step 2: Write `conformance.md`**

Use the template: outcome vs the design doc, deviations (none expected; if the stubbed-E2E choice for fail-open shifted anything, say so), decisions confirmed, verification results with the real command outcomes.

- [ ] **Step 3: Verify the record and commit**

Run: `sh .intent/scripts/verify-change.sh --change .intent/changes/CHG-0025` → passes. Set proposal `status: complete`. Commit:

```bash
git add .intent/changes/CHG-0025
git commit -m "chore(intent): complete CHG-0025 with conformance evidence"
```
