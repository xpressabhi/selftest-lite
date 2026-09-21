# Intent Capture — Design

Date: 2026-09-21
Status: approved
Scope: store the user's planner input with the generated test, fix lossy topic
extraction, and pass the original request into generation. Regeneration is
data-ready but not shipped.

## 1. Problem (approved)

Example: the user typed `python built in data structures`; the plan and the
stored `topic` became a fragment (`built data structures`), losing `python`
and `built-in`. Root cause: the topic is a Jev Choice over candidate spans
built by `buildTopicCandidates()` (`src/lib/shared/intentLexicon.js`), which
splits hyphenated compounds and ranks content-only fragments above the full
phrase; the chosen span is then used for generation and persisted.

Today `ai_test` stores the parsed topic and request params, but never the
original input. Truncated copies exist only in telemetry (`intent` at 200
chars in `api_request_events`, 64 chars in `feature_events`).

Purposes: parser quality, regenerate-from-original (data only), and better
generation context.

## 2. Capture scope (approved)

- Full thread of user planner messages: ≤ 8 messages, ≤ 1000 chars each
  (`MAX_INTENT_CHARS`), ≤ 4000 chars total, sanitized.
- Final plan: topic, testType, difficulty, numQuestions, examId, isFullExam,
  language.
- Provenance: `topicSource`, `parseMode` (`preview` | `turn`), `fieldConfidence`,
  `explicit`, `answers`, `askedFields`, `skippedFields`, `round`. Local-tier
  previews record `topicSource: 'local'` so fully local plans are attributable.
- Quick starts (daily 5, presets, exam quick start) have no thread and skip
  capture.
- Retention: raw input is kept as long as the test row. No TTL.

## 3. Data model (approved)

New table, created by `ensureStorageSchema` in `src/lib/server/storage.js`:

```sql
CREATE TABLE IF NOT EXISTS ai_test_intent (
  test_id BIGINT PRIMARY KEY REFERENCES ai_test(id) ON DELETE CASCADE,
  thread JSONB NOT NULL DEFAULT '[]'::jsonb,
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- Server-only: never selected by `/api/test`, the list endpoint, or the admin
  stats payload.
- New storage function `saveTestIntentRecord({ testId, thread, plan, provenance })`.

## 4. Capture flow (approved)

- `HomePage.svelte` keeps `lastTopicSource` and `lastFieldConfidence` from the
  last non-preview parse, and builds `intentCapture` at generation time from
  `plannerDraft` (thread = user-role messages).
- `POST /api/generate` accepts optional `intentCapture`; a new
  `src/lib/server/intentCapture.js` owns the Zod schema plus pure
  `sanitizeIntentCapture()` that re-bounds and re-sanitizes everything server
  side (never trust the client).
- Invalid or oversized capture is dropped with a log; it never fails the
  request. The row is written best-effort after `createTestRecord`; a failed
  insert logs and the test still succeeds.

## 5. Parser fix (approved)

Failure modes to write down before any code (AGENTS.md rule):

1. Hyphenated compound split (`built-in` → `built` + `in`).
2. Chosen span is a fragment of a contiguous phrase and drops content tokens.
3. Expansion must not cross config words (`questions`, `quiz`, difficulty
   words) or numbers.
4. Expansion must not cross punctuation (`.`, `,`, `?`, `:`), newlines, or
   anything other than a single whitespace gap.
5. Devanagari spans behave like Latin spans (marks stay inside tokens).
6. A chosen span that already covers all adjacent content tokens is returned
   unchanged.
7. Expansion cap (8 tokens / 120 chars) falls back to the chosen span.
8. Candidate ordering and count stay within existing limits
   (`MAX_TOPIC_CANDIDATES`).

Fix in `src/lib/shared/intentLexicon.js`:

- Tokenizer accepts internal hyphens/apostrophes:
  `[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*`. A hyphenated input
  (`python built-in data structures`) is then resolved by the local preview
  tier without a model call.
- New pure `repairTopicSpan(intent, span)`: locate the span in the message and
  expand it left/right across a single stopword when the next token is content
  and the gap is whitespace only. Used by `deriveIntentParams` only when the
  topic came from an accepted `topic_span` choice. Expansion also stops at
  exam-name tokens (`jee`, `main`, `upsc`, `prelims`, ...) so an exam mention
  is never absorbed into the subject phrase.

## 6. Generation context (approved)

`generatePrompt()` gains `originalRequest` (≤ 1000 chars, sanitized thread
join) and a prompt block telling the model to honor qualifiers the topic
omits. `/api/generate` passes the same capture it stores; when capture is
absent, the block is omitted.

## 7. Privacy (approved)

- Raw input lives only in `ai_test_intent`, server-side. The public
  `/api/test?id=` payload and list results are unchanged.
- No TTL; deletion follows the test row (tests are not deleted today).
- Follow-up outside this change: mention stored request text in `/privacy`.

## 8. Testing (per AGENTS.md testing rules)

- E2E first: `tests/e2e/smoke.e2e.js` intercepts `POST /api/generate` and
  asserts the body carries `intentCapture` (thread + provenance) for a planner
  generation and omits it for a quick start. Evidence attaches to
  `test-results/e2e-artifact.json`.
- Isolated tests only where E2E cannot reach: `repairTopicSpan` / tokenizer
  failure modes (listed in section 5), `sanitizeIntentCapture` bounds, and the
  prompt block. Order: write the failure-mode list, then tests, then code.
- No after-the-fact unit tests.

## Out of scope

- Regeneration endpoint/UI (data model enables it later).
- Displaying the original input in history or results.
- Analytics queries over captured threads.
- Backfilling existing tests.
- Quick-start capture.

## Risks

| Risk | Mitigation |
|------|------------|
| Repair over-extends spans | Bounded rules + failure modes 3, 4, 7 |
| Jev criteria shift after tokenizer change | Existing intent tests plus new failure modes |
| Prompt context biases generation | Bounded to 1000 chars, explicit wording, omitted when absent |
| Raw text retention (PII) | Server-only, documented follow-up for `/privacy` |
