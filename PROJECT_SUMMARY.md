# Selftest-lite Project Summary

Selftest-lite is a SvelteKit application for generating AI-powered objective quizzes and Indian-exam practice papers. It supports English and Hindi, local-first history, PWA installation, Markdown/math content, and on-demand explanations.

## Stack

| Area | Technology |
| --- | --- |
| Framework | SvelteKit 2 with Vite |
| UI | Svelte 5 and Tailwind CSS 4 |
| AI | Google Gemini |
| Persistence | Neon PostgreSQL and browser local storage |
| PWA | vite-plugin-pwa |

## Source layout

- `src/routes/`: SvelteKit pages and server endpoints.
- `src/lib/client/`: browser-side state, storage, learning helpers, and renderers.
- `src/lib/server/`: prompt generation, validation, rate limiting, and database helpers.
- `src/lib/data/`, `src/lib/locales/`, `src/lib/shared/`: framework-neutral shared content.
- `src/lib/styles/globals.css`: Tailwind entry point, theme tokens, and shared UI primitives.

Run `npm run dev` for local development, `npm run lint` for static checks, and `npm run check` for the production SvelteKit build.
