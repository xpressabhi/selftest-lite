# Architecture Notes

## Overview

Selftest-lite is a SvelteKit 2 application (Svelte 5, Vite 8, Tailwind CSS 4) deployed on Vercel. The Gemini API generates quiz papers; TypeSafe Jev turns the home-page conversation into a structured test plan; Neon PostgreSQL stores papers; the browser caches history locally.

## Data Flow: Generate → Take → Results

0. **Plan**: The home page is a conversation. Each user message is a stateless turn against `/api/parse-intent`: the client sends the message plus the current plan, explicit field locks, and clarification history; TypeSafe Jev answers typed questions (`src/lib/server/intentParse.js`) over the accumulated state. Code merges the answers, protects user-edited fields, and may return one clarification question (top candidate spans or exams). The plan card stays editable throughout; the draft lives in `localStorage`. While the user types, a live preview fills the card from the shared lexicon (`src/lib/shared/intentLexicon.js`) and only calls `/api/parse-intent` with `mode: "preview"` when the local read is incomplete — those calls skip recent messages/student context, carry only the mentioned field questions, and are not logged to `api_request_events` on success.
1. **Generate**: The client POSTs a topic/difficulty/language/etc. to `/api/generate`. The server validates the request (Zod), checks the rate limiter, builds a prompt (`src/lib/server/prompt.js`), and calls Gemini with structured JSON output (`responseJsonSchema`). Papers over 25 questions are generated in batches, each validated before the next batch starts. The paper (including answer key) is stored in the `ai_test` table; the client receives the paper **without** the answer key (`stripAnswerKey` in `src/lib/server/paperRedaction.js`).
2. **Take**: The client renders questions locally (markdown + KaTeX via `src/lib/client/markdownRenderer.js`). Answers are kept client-side.
3. **Submit**: `/api/test/submit` sends answers; scoring happens server-side against the stored answer key. Attempts are stored in `ai_test_attempts`.
4. **Explain**: `/api/explain` sends a question + chosen answer and returns a generated explanation.

## Key Modules

| Module                             | Responsibility                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/prompt.js`         | Builds the Gemini generation prompts (language-aware, dedup-aware)                                              |
| `src/lib/server/quizSchema.js`     | Zod schema for generated papers                                                                                 |
| `src/lib/server/quizValidation.js` | Request validation, paper repair/validation, LaTeX syntax checks                                                |
| `src/lib/server/paperRedaction.js` | Strips answer keys before papers leave the server                                                               |
| `src/lib/server/storage.js`        | Neon pool + schema auto-creation (`ai_test`, `ai_test_attempts`, `api_request_events`, `api_rate_limit_events`) |
| `src/lib/server/rateLimiter.js`    | Sliding-window rate limiting via `api_rate_limit_events` (fail-open)                                            |
| `src/lib/server/intentParse.js`    | Conversational intent engine: Jev questions, plan merge, clarification policy                                   |
| `src/lib/shared/intentLexicon.js`  | Shared pure lexicon: question counts, mentions, topic spans, value detectors (server + live preview)            |
| `src/lib/client/livePreview.js`    | Live plan preview: instant local tier + when to ask Jev (`mode: "preview"`)                                     |
| `src/lib/client/plannerState.js`   | Home planner draft state machine (messages, locks, clarifications) + persistence                                |
| `src/lib/server/adminAuth.js`      | HMAC-signed admin session tokens, timing-safe credential checks                                                 |
| `src/lib/client/storage.js`        | `localStorage` history/paper caching                                                                            |
| `src/lib/client/preferences.js`    | Language, theme, and data-saver detection/stores                                                                |
| `src/lib/locales/*.json`           | English/Hindi UI strings                                                                                        |
| `src/lib/shared/latex.js`          | LaTeX normalization used by both server and client                                                              |
| `src/lib/server/examSync.js`       | Exam notification pipeline: fetch → Gemini extraction → validation → upsert/quarantine (injected deps, offline-testable) |
| `src/lib/shared/examNotifications.js` | Notification rules: normalization, dedupe keys, URL/date validation, scope filter, registry allowlists |
| `src/lib/shared/examNotificationStatus.js` | Client-safe date/status primitives shared by the store and the `/exams` hub |
| `src/lib/shared/examNotificationSql.js` | Tracker schema and queries shared by `ensureStorageSchema`, the archive run and the sync script (PGlite-pinned) |
| `src/lib/data/examSources.js`      | Curated official source registry: listing URLs, allowed hosts, exam mappings, transports |
| `scripts/sync-exam-notifications.mjs` | CLI the daily/weekly Actions run (Neon + Gemini + per-source curl fallback) |
| `src/lib/server/nudges.js`         | Pure nudge policy engine: eligibility, Jev question builders, deterministic derivation, holdout hash |
| `src/lib/shared/nudgePolicy.js`    | Client-safe nudge constants and eligibility shared by the engine and the browser pre-filter |
| `src/lib/client/nudge.js`          | Browser ledger: cooldowns, dismiss backoff, session/interrupt budgets, state slices |
| `src/lib/client/notifications.js`  | Exam update feed matching: interest tiers, badge classification, Jev candidate payload |
| `src/routes/api/exam-notifications/+server.js` | Public CDN-cached feed for the in-app notification bell |

## Key Decisions

- **Answer keys never leave the server**: grading is server-side, so a fetched paper cannot leak answers to the client.
- **Auto-created schema**: `ensureStorageSchema` runs idempotent `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` on first use, so no migration tooling is needed.
- **Fail-open rate limiting**: if rate-limit storage fails, requests are allowed rather than dropping traffic.
- **Batch generation**: caps each Gemini call at 25 questions to keep responses reliable, with per-batch validation and up to 3 repair attempts.
- **Confidence-gated clarifications**: the planner asks at most two questions per conversation, and only when TypeSafe's probabilities leave a decision genuinely open; explicit chip edits always win over inference.
- **PWA caching**: route chunks are cached at runtime after first use (see `vite.config.js`), keeping the install-time cache small on slow networks.
- **Admin session secret**: if `ADMIN_SESSION_SECRET` is unset, sessions are derived from the credentials so rotating the password invalidates all sessions.
- **Notifications are link-first and quarantine-gated**: the daily GitHub Action extracts facts with Gemini from official listing pages, publishes only rows that pass host/date/dedupe/link validation, and quarantines the rest for review; `/exams` is SSR with short CDN caching, and every card links to its official notice (and to practice when the row maps to a registry exam).
- **Nudges are fail-open and code-capped**: Jev judges the moment (and soft notification relevance) inside the existing `/api/personalize` call; deterministic code owns cohort gates, cooldowns, dismiss backoff, quiet hours, the shared interrupt budget, and a server-side 10% holdout. `NUDGE_ENABLED` must be `true` for questions to be built; anything uncertain means silence, never a broken prompt. The in-app inbox badges only fresh, unseen, relevant updates (`first_seen_at`-keyed, never `last_seen_at`).

## Testing

Vitest unit tests live next to source as `*.test.js` and cover pure server/shared logic (validation, redaction, LaTeX normalization, admin auth). Run with `npm run test`.
