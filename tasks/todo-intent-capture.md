## Task 1: Parser failure modes + tests
**Description:** Add tests to `src/lib/server/intentParse.test.js` for the F1–F8 failure modes before implementing: hyphen token, fragment repair, config-word/number stop, punctuation stop, Devanagari, unchanged full span, cap fallback, candidate limits.
**Acceptance criteria:**
- [x] Tests written before code and initially failing
- [x] `python built-in data structures` yields the full phrase via repair
**Verification:**
- [x] `npm run test -- intentParse` (red before Task 2, green after)
**Dependencies:** None
**Files likely touched:** `src/lib/server/intentParse.test.js`
**Estimated scope:** XS

## Task 2: Tokenizer + repairTopicSpan
**Description:** Hyphen/apostrophe token chars in `intentLexicon.js`; pure `repairTopicSpan(intent, span)`; use it in `deriveIntentParams` when the topic came from an accepted `topic_span` (before exam suffix).
**Acceptance criteria:**
- [x] F1–F8 all pass
- [x] No candidate-count/order regression
**Verification:**
- [x] `npm run test -- intentParse`
**Dependencies:** Task 1
**Files likely touched:** `src/lib/shared/intentLexicon.js`, `src/lib/server/intentParse.js`
**Estimated scope:** Small

## Task 3: Sanitizer tests
**Description:** New `src/lib/server/intentCapture.test.js` covering S1–S13 before the module exists.
**Acceptance criteria:**
- [x] Bounds, stripping, and drop rules covered
**Verification:**
- [x] `npm run test -- intentCapture`
**Dependencies:** None
**Files likely touched:** `src/lib/server/intentCapture.test.js`
**Estimated scope:** XS

## Task 4: intentCapture module + storage
**Description:** `src/lib/server/intentCapture.js` (Zod schema + `sanitizeIntentCapture`), `ai_test_intent` DDL in `ensureStorageSchema`, `saveTestIntentRecord` in `storage.js`.
**Acceptance criteria:**
- [x] S1–S13 pass
- [x] Table created idempotently with the existing schema block
**Verification:**
- [x] `npm run test -- intentCapture`
**Dependencies:** Task 3
**Files likely touched:** `src/lib/server/intentCapture.js`, `src/lib/server/storage.js`
**Estimated scope:** Small

## Task 5: Prompt tests
**Description:** New `src/lib/server/prompt.test.js` covering P1–P4 before the prompt change.
**Acceptance criteria:**
- [x] Absent/empty/truncated/instruction cases covered
**Verification:**
- [x] `npm run test -- prompt`
**Dependencies:** None
**Files likely touched:** `src/lib/server/prompt.test.js`
**Estimated scope:** XS

## Task 6: Prompt block
**Description:** `generatePrompt` gains `originalRequest`, emits the qualifier-honoring block before TOPIC INFORMATION when present.
**Acceptance criteria:**
- [x] P1–P4 pass
**Verification:**
- [x] `npm run test -- prompt`
**Dependencies:** Task 5
**Files likely touched:** `src/lib/server/prompt.js`
**Estimated scope:** XS

## Task 7: API wiring
**Description:** `/api/generate` accepts optional `intentCapture`, sanitizes it, passes the thread into `generatePrompt`, and stores the row best-effort after `createTestRecord` (failure logs only).
**Acceptance criteria:**
- [x] Invalid capture never fails a generation
- [x] Stored row has thread/plan/provenance; no public endpoint returns it
**Verification:**
- [x] E2E contract (Task 9) + `npm run test`
**Dependencies:** Tasks 4, 6
**Files likely touched:** `src/routes/api/generate/+server.js`
**Estimated scope:** Small

## Task 8: Client capture
**Description:** HomePage keeps last `topicSource`/`fieldConfidence`/parse mode from preview or turn responses, builds `intentCapture` for planner generations, and sends it with `/api/generate`; quick starts send nothing.
**Acceptance criteria:**
- [x] Planner generation body carries thread + provenance
- [x] Daily 5 / preset quick starts omit capture
**Verification:**
- [x] E2E (Task 9)
**Dependencies:** Task 7
**Files likely touched:** `src/lib/client/pages/HomePage.svelte`
**Estimated scope:** Small

## Task 9: E2E contract tests
**Description:** `tests/e2e/smoke.e2e.js`: intercepted `/api/generate` asserts `intentCapture` for a planner generation (thread text + provenance) and absence for a quick start; evidence attaches to the artifact.
**Acceptance criteria:**
- [x] Both cases pass against mocked generate/parse endpoints
- [x] Evidence visible in `test-results/e2e-artifact.json`
**Verification:**
- [x] `npm run test:e2e`
**Dependencies:** Task 8
**Files likely touched:** `tests/e2e/smoke.e2e.js`
**Estimated scope:** Small

## Task 10: Artifact + full verification
**Description:** Run the full suite, confirm the artifact is byte-identical across two runs on a clean tree, and tick the plan.
**Acceptance criteria:**
- [x] lint/test/check/e2e pass
- [x] artifact repeatable
**Verification:**
- [x] `diff` of two artifact runs
**Dependencies:** Task 9
**Files likely touched:** `tasks/todo-intent-capture.md`, `tasks/plan-intent-capture.md`
**Estimated scope:** XS

### Checkpoint: Complete
- [x] All tasks checked; manual smoke of plan card topic edit
