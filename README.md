# Selftest-lite

Selftest-lite is a SvelteKit web app for generating and taking AI-powered multiple-choice quizzes and Indian-exam practice papers, with English and Hindi support.

## Features

- **Dynamic test generation**: describe the test you want and Gemini generates it (MCQ papers, full-length exam mock papers, objective-only papers).
- **Multiple-choice quizzes**: take tests with instant scoring and answer review.
- **Explanations**: per-question explanations on demand.
- **Exam support**: syllabus-focused practice for Indian exams, with reusable full-exam papers to avoid repetition.
- **Local-first history**: tests and answers cached in the browser; generated papers persisted to PostgreSQL.
- **Markdown + math rendering**: KaTeX math, physics/chemistry symbols (Ω, μ, CO₂), and diagrams.
- **PWA**: installable, offline-capable, with slow-connection data-saver mode.
- **Admin dashboard**: usage analytics behind a password-protected admin area.

## Tech Stack

| Area | Technology |
| --- | --- |
| Framework | SvelteKit 2 + Vite 8 |
| UI | Svelte 5 + Tailwind CSS 4 |
| AI | Google Gemini (`/api/generate`), Gemini Flash Lite (`/api/explain`) |
| Database | Neon PostgreSQL (`@neondatabase/serverless`) |
| PWA | `vite-plugin-pwa` |
| Validation | Zod + structured JSON output |

## Prerequisites

- **Node.js 20.19+ or 22.12+** (required by Vite 8)
- **npm**
- A [Google AI Studio](https://aistudio.google.com/) API key
- (Optional) A Neon PostgreSQL database

## Getting Started

```bash
# 1. Clone and install
git clone <repository-url>
cd selftest-lite
npm install

# 2. Configure environment
cp .env.example .env.local
# then edit .env.local and set GEMINI_API_KEY (and DATABASE_URL if you want persistence)

# 3. Run the dev server
npm run dev
```

Open the URL printed by Vite (normally <http://localhost:5173>).

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | Google AI Studio API key for quiz generation |
| `DATABASE_URL` | No* | Neon PostgreSQL connection string. *Required for persistence, rate limiting, and admin stats. Without it the app still runs but nothing is stored and admin features are disabled. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | No | Enable the admin dashboard (`/admin`) and API stats |
| `ADMIN_SESSION_SECRET` | No | Stable secret for admin sessions; if unset, sessions are derived from the admin credentials |

## Scripts

```bash
npm run dev      # start the dev server
npm run build    # production build (via `vite build`)
npm run preview  # preview the production build
npm run lint     # ESLint static checks
npm run check    # SvelteKit sync + production build (use before pushing)
npm run test     # vitest unit tests
```

## API Endpoints

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/generate` | POST | Generate a quiz/exam paper from topic, difficulty, language, etc. |
| `/api/explain` | POST | Generate an explanation for a question/answer |
| `/api/test?id=` | GET | Fetch a stored test paper |
| `/api/test/submit` | POST | Submit answers and store an attempt |
| `/api/admin/login` / `/api/admin/logout` | POST | Admin session management |
| `/api/admin/stats` | GET | Usage analytics (admin only) |

All endpoints are rate-limited. See `src/lib/server/rateLimiter.js`.

## Project Structure

- `src/routes/` — pages and server endpoints
- `src/lib/client/` — browser-side state, storage, learning helpers, markdown renderers
- `src/lib/server/` — prompt generation, validation, rate limiting, database helpers, admin auth
- `src/lib/locales/` — English/Hindi UI strings
- `src/lib/styles/` — Tailwind entry point and theme tokens

See [AGENTS.md](AGENTS.md) for the full technical guide and [docs/architecture.md](docs/architecture.md) for architecture notes.

## Contributing

Private repository — see [CONTRIBUTING.md](CONTRIBUTING.md) for development conventions. This project is not open source.
