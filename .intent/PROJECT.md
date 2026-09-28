# Repository context outcomes

Project context is useful when an agent can reach the following facts without guessing. A `TODO` marks context that is not yet established.

## Purpose

Selftest-lite is a private SvelteKit web app (English/Hindi, installable PWA) that generates and grades AI-powered multiple-choice quizzes and Indian-exam practice papers. Its users are learners preparing for Indian exams (UPSC, SSC, RRB, IBPS, RBI, state PSCs) and general practice. It provides: a conversational test planner, generation of MCQ/true-false/coding/speed/match-the-columns/assertion-reasoning papers, instant server-side scoring with answer review, on-demand explanations, a daily-synced exam-notification hub that links into practice, a learner profile with weak-topic detection, and local-first history with optional server persistence.

## Architecture

SvelteKit 2 (Svelte 5, Vite 8, Tailwind CSS 4) deployed on Vercel; Google Gemini generates papers; TypeSafe Jev turns the home-page conversation into a structured test plan; Neon PostgreSQL stores papers; the browser caches history.

- `src/routes/` — pages and server endpoints (`/api/*`).
- `src/lib/server/` — server-only logic: prompts, Zod validation, rate limiting, storage, admin auth, exam sync.
- `src/lib/client/` — browser-only state, storage, renderers, planner state.
- `src/lib/shared/` — framework-neutral logic shared by server and client (lexicons, SEO, exam rules).
- `src/lib/locales/`, `src/lib/data/`, `src/lib/styles/` — UI strings, curated registries, theme.

Flow: home conversation → `/api/parse-intent` (stateless turns against client-held planner state) → `/api/generate` (validate, rate-limit, prompt, Gemini JSON output in ≤25-question batches with per-batch validation/repair) → paper stored in `ai_test`, answer key stripped (`stripAnswerKey`) before it leaves the server → client renders markdown + KaTeX → `/api/test/submit` grades server-side against the stored key and stores attempts in `ai_test_attempts` → `/api/explain` for explanations. The storage schema is auto-created (`ensureStorageSchema`); rate limiting is fail-open via `api_rate_limit_events`. Module table and key decisions: `docs/architecture.md`.

## Constraints

- Compatibility: mobile-first from 320px; iOS safe-area insets; ≥44×44px tap targets; low-end Android on slow networks is the optimization baseline; Node 22.x (`engines`).
- Security/privacy: model output is sanitized (`rehype-sanitize`) before rendering; answer keys never leave the server and grading is server-side; secrets live in `src/lib/server/` via `$env/dynamic/private`; do not break Google Adsense or PWA behavior.
- Localization: all user-facing UI text needs English and Hindi entries in `src/lib/locales/`; `/admin` and `/api/admin/*` are English-only by exception.
- Telemetry: every tracked event must be allowlisted in `src/lib/shared/telemetryEvents.js`; telemetry rows are archived, never deleted; `docs/telemetry.md` is the runbook.
- Content quality: generation shuffle/validation/dedupe/verification steps must not be bypassed (`docs/content-quality.md`); content changes run `npm run eval:content -- --strict`.
- Performance: math/diagram rendering degrades gracefully (lazy, deferred work); avoid duplicate client fetches.

## Build and verification

Setup: Node 22.x + npm; `npm install`; `cp .env.example .env.local`, then set `GEMINI_API_KEY` and `TYPESAFE_API_KEY` (required). `DATABASE_URL` is required for persistence, rate limiting, and admin stats; without it the app runs but stores nothing.

Commands (run from the repository root; all expected to pass):
- `npm run dev` — dev server at http://localhost:5173.
- `npm run lint` — ESLint static checks pass.
- `npm run check` — SvelteKit sync + production build + build-mode check succeed.
- `npm run test` — vitest unit tests pass (`*.test.js` beside source).
- `npm run test:e2e` — Playwright e2e passes; runs on port 5174 against `TEST_DATABASE_URL` (in-memory PGlite by default; never `DATABASE_URL`); writes `test-results/e2e-artifact.json`.
- `npm run smoke` — lint + unit + e2e; the pre-submit gate (`CONTRIBUTING.md`) and the pre-commit hook (`npm run hooks:install`).
- `npm run verify:vercel` — build + validate the Vercel output; required when touching SEO, prerender, routes, or i18n.

## Repository conventions

- `AGENTS.md` is the technical guide and overrides generic habits; `README.md` covers setup and endpoints; `docs/architecture.md` covers data flow.
- Naming: PascalCase components, camelCase otherwise; semicolons required; single quotes preferred (ESLint enforces).
- Boundaries: server-only code in `src/lib/server/` and `+server.js`; browser-only code in `src/lib/client/`, guarded for SSR; shared pure logic in `src/lib/shared/`.
- Workflow: private repo — coordinate with the maintainer before large changes; branch from `main`; keep PRs small and focused; observed commit style is conventional commits (`feat(scope): …`, `chore(repo): …`).
- Testing: E2E is the default testing mechanism; if a system must be tested in isolation, enumerate the ways it could fail before writing the code; never write unit tests after the code. Never modify, skip, or delete a pre-existing test to make it pass — repository policy also protects test paths.
