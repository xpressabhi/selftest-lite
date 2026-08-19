# Architecture Notes

## Overview

Selftest-lite is a SvelteKit 2 application (Svelte 5, Vite 8, Tailwind CSS 4) deployed on Vercel. The Gemini API generates quiz papers; Neon PostgreSQL stores them; the browser caches history locally.

## Data Flow: Generate → Take → Results

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
| `src/lib/server/adminAuth.js`      | HMAC-signed admin session tokens, timing-safe credential checks                                                 |
| `src/lib/client/storage.js`        | `localStorage` history/paper caching                                                                            |
| `src/lib/client/preferences.js`    | Language, theme, and data-saver detection/stores                                                                |
| `src/lib/locales/*.json`           | English/Hindi UI strings                                                                                        |
| `src/lib/shared/latex.js`          | LaTeX normalization used by both server and client                                                              |

## Key Decisions

- **Answer keys never leave the server**: grading is server-side, so a fetched paper cannot leak answers to the client.
- **Auto-created schema**: `ensureStorageSchema` runs idempotent `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` on first use, so no migration tooling is needed.
- **Fail-open rate limiting**: if rate-limit storage fails, requests are allowed rather than dropping traffic.
- **Batch generation**: caps each Gemini call at 25 questions to keep responses reliable, with per-batch validation and up to 3 repair attempts.
- **PWA caching**: route chunks are cached at runtime after first use (see `vite.config.js`), keeping the install-time cache small on slow networks.
- **Admin session secret**: if `ADMIN_SESSION_SECRET` is unset, sessions are derived from the credentials so rotating the password invalidates all sessions.

## Testing

Vitest unit tests live next to source as `*.test.js` and cover pure server/shared logic (validation, redaction, LaTeX normalization, admin auth). Run with `npm run test`.
