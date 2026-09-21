# Implementation Plan: Intent Capture

## Overview
From `docs/superpowers/specs/2026-09-21-intent-capture-design.md`: store the
user's planner thread + plan provenance with each generated test
(`ai_test_intent`), fix lossy topic extraction (hyphen-aware tokenizer +
`repairTopicSpan`), and pass the original request into `generatePrompt`.
Order follows the AGENTS.md testing rules: failure modes first, then tests,
then code; E2E for the contract with an artifact.

## Failure modes (written before any code)

Parser (F1–F8, spec §5):
1. Hyphenated compound split (`built-in` → `built` + `in`).
2. Fragment choice drops adjacent content tokens (`data structures`).
3. Expansion must not cross config words or numbers (`10 physics questions on optics`).
4. Expansion must not cross punctuation, newlines, or non-whitespace gaps.
5. Devanagari spans behave like Latin spans.
6. A span already covering all adjacent content tokens is unchanged.
7. Expansion cap (8 tokens / 120 chars) falls back to the chosen span.
8. Candidate count/order stay within `MAX_TOPIC_CANDIDATES` and existing tests.

Sanitizer (`sanitizeIntentCapture`):
1. Non-object/null input → null.
2. `thread` not an array → no messages.
3. Non-string/empty message text dropped.
4. Message >1000 chars sliced.
5. >8 messages → keep the last 8.
6. Total thread >4000 chars → drop oldest until within.
7. Invisible/control chars stripped (`sanitizeInputText`).
8. Unknown provenance keys dropped.
9. Provenance strings bounded; `answers`/`explicit` ≤24 keys, values ≤64 chars.
10. Non-finite or out-of-range `fieldConfidence` entries dropped.
11. Invalid `explicit`/`answers` value types dropped.
12. `plan` normalized via `normalizePlan` (bad enums fall back).
13. Empty thread → null (nothing worth storing; quick starts skip client-side).

Prompt (`generatePrompt` `originalRequest`):
1. Absent/null → no block.
2. Empty/whitespace → no block.
3. >1000 chars → truncated.
4. Block carries the "honor qualifiers" instruction and sits before topic info.

## Task List

### Phase 1: Parser
- [x] Task 1: failure modes (above) + tests in `intentParse.test.js`
- [x] Task 2: tokenizer + `repairTopicSpan` + wiring in `deriveIntentParams`

### Checkpoint: Parser
- [x] `npm run test` passes; `python built-in data structures` case covered

### Phase 2: Capture module + storage
- [x] Task 3: sanitizer tests (`intentCapture.test.js`)
- [x] Task 4: `src/lib/server/intentCapture.js` + `ai_test_intent` DDL + `saveTestIntentRecord`

### Phase 3: API + prompt
- [x] Task 5: prompt tests (`prompt.test.js`)
- [x] Task 6: `generatePrompt({ originalRequest })` block
- [x] Task 7: `/api/generate` accepts, sanitizes, passes, stores best-effort

### Phase 4: Client
- [x] Task 8: HomePage keeps last parse provenance and sends `intentCapture`

### Phase 5: E2E + artifact
- [x] Task 9: smoke tests (planner capture present, quick start absent) + evidence
- [x] Task 10: artifact repeatability check

### Checkpoint: Complete
- [x] `npm run lint`, `npm run test`, `npm run check`, `npm run test:e2e`
- [x] `test-results/e2e-artifact.json` byte-identical across two runs
- [ ] Manual check: plan card still edits topic; no visible UI change

## Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| Repair over-extends | F3/F4/F7 tests |
| Jev criteria shift | Existing intent tests + F8 |
| Prompt context biases generation | Bounded 1000 chars, omitted when absent |
| PII retention | Server-only table; `/privacy` follow-up |

## Open Questions
- None; spec approved 2026-09-21.
