# AGENTS.md - Agent Onboarding & Technical Guide

Welcome, Agent! This guide is designed to help you quickly understand the **Selftest-lite** codebase and contribute effectively.

## 🚀 Project Overview
**Selftest-lite** is an AI-powered quiz generation platform built with SvelteKit, leveraging the Google Gemini API for content generation and Neon PostgreSQL for persistence. It supports English and Hindi, PWA installation, Markdown/math content, and on-demand explanations.

### Tech Stack Highlights:
- **Framework**: SvelteKit 2 (Vite 8, Svelte 5)
- **AI**: Gemini for paper generation (`/api/generate`) + Gemini Flash Lite for explanations (`/api/explain`)
- **Database**: Neon PostgreSQL (via `@neondatabase/serverless`)
- **UI**: Tailwind CSS 4 + Custom CSS (Mobile-first)
- **PWA**: `vite-plugin-pwa` with custom runtime caching (config in `vite.config.js`)
- **Validation**: Zod schemas (`src/lib/server/quizSchema.js`)

## ⚡ Common Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Start the development server (http://localhost:5173) |
| `npm run lint` | ESLint static checks |
| `npm run check` | SvelteKit sync + production build |
| `npm run test` | Run vitest unit tests |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `gh pr view` | View or create pull requests with GitHub CLI |

## 📁 Source Layout

- `src/routes/`: SvelteKit pages and server endpoints.
- `src/lib/client/`: browser-side state, storage, learning helpers, and renderers.
- `src/lib/server/`: prompt generation, validation, rate limiting, and database helpers.
- `src/lib/data/`, `src/lib/locales/`, `src/lib/shared/`: framework-neutral shared content.
- `src/lib/styles/globals.css`: Tailwind entry point, theme tokens, and shared UI primitives.

For user-facing setup instructions, env vars, and the API endpoint list, see [README.md](README.md). For deeper architecture notes, see [docs/architecture.md](docs/architecture.md).

---

## 🏗 Architecture & Key Patterns

### 1. The "Mobile-First" Layout
The entire app is wrapped in `src/routes/+layout.svelte`.
- **TopNav**: Static desktop-style nav.
- **BottomNav**: Mobile bottom-tab navigation.
- **PWA Features**: Service worker registration and offline/slow-connection banners.
- **Toasts**: A global toast system managed in the layout.

### 2. AI Quiz Generation (`/api/generate`)
Quizzes are generated via complex prompts in `src/lib/server/prompt.js`.
- **Pattern**: The prompt uses structured output (JSON mode with `responseJsonSchema`) with Zod validation.
- **Thinking**: We use Gemini's `thinkingConfig` (minimal level) to ensure high-quality, non-repetitive questions.
- **Batching**: Papers larger than 25 questions are generated in batches, each validated before the next batch starts (see `generatePaper` in `src/routes/api/generate/+server.js`).
- **Deduplication**: We pass `previousQuestions` to the prompt to avoid duplicate questions for a user.

### 3. Data Persistence
- **Remote**: Every generated test is stored in the `ai_test` table in Neon PostgreSQL (schema is auto-created via `ensureStorageSchema` in `src/lib/server/storage.js`).
- **Local**: Test history and user answers are cached in `localStorage` via `src/lib/client/storage.js` (`getHistory`, `saveHistory`, `readJson`/`writeJson`).

### 4. Styling System
- **Tailwind**: Generated through the SvelteKit PostCSS pipeline.
- **Custom CSS**: Shared variables and Tailwind component primitives live in `src/lib/styles/globals.css`.
- **Animations**: Prefer subtle transforms and transitions for a "premium" feel. The `.data-saver` / `.reduce-motion` classes on `document.documentElement` disable heavy animations on low-end devices (managed by `src/lib/client/preferences.js`).

---

## 📱 Performance & Device Support Principles

### 1. Mobile-First, Desktop-Ready
- **Always** design for mobile screens (320px+) first.
- Use `src/routes/+layout.svelte` for mobile and desktop navigation.
- Ensure all interactive elements have a minimum tap target of **44x44px**.

### 2. High-End vs. Low-End Devices
- **High-End (iPhone/Pixel)**: Use fluid selection animations and respect iOS safe-area-insets in CSS.
- **Low-End (Budget Android)**:
  - Minimize heavy JS execution.
  - Use lightweight skeletons/placeholders instead of complex spinners.
  - Respect the `.data-saver` class on `document.documentElement` to disable heavy animations.
  - **Default optimization target**: Assume low-end Android is the baseline device for all new features and refactors.

### 3. Network Resilience (Slow Internet)
- `src/lib/client/preferences.js` detects slow connections (`navigator.connection.saveData` / `effectiveType`) and exposes the `isDataSaverActive` store.
- **Optimization Strategy**:
  - Reduce the default number of questions if data saver is active.
  - Prefer the lighter `src/lib/client/markdownRenderer.js` path; heavy diagram/math rendering must degrade gracefully in data-saver mode.
  - Avoid unnecessary client fetches and duplicate API calls; prefer cached/local-first UX when safe.
- **Image Handling**: Always use `loading="lazy"` for non-critical images.

### 4. Output Rendering Fidelity (Generate/Explain APIs)
- **Always** render the full range of output returned by `/api/generate` and `/api/explain` without breaking low-end performance.
- Required support includes:
  - Markdown (lists, emphasis, code blocks)
  - Math/science notation via KaTeX (`remark-math` + `rehype-katex`)
  - Physics/chemistry symbols and unicode characters (Ω, μ, θ, CO₂, H₂SO₄)
- Security rule: do not render unsanitized raw HTML from model output (`rehype-sanitize` is applied before rendering).
- Performance rule: math/diagram rendering must degrade gracefully in data-saver mode and on slow devices.

---

## 🛠 Coding Standards for Agents

- **File Naming**: PascalCase for components (`MyComponent.svelte`), camelCase for everything else.
- **Semicolons**: **Required**. Use `npm run lint` to verify.
- **Single Quotes**: Preferred.
- **Client/Server Boundary**:
  - Server-only code (DB, API keys, secrets) lives in `src/lib/server/` and `src/routes/**/+server.js`, reading secrets via `$env/dynamic/private`.
  - Browser-only code (localStorage, `window`/`navigator`) lives in `src/lib/client/` and `+page.svelte` files; always guard with `typeof window !== 'undefined'` or `typeof navigator !== 'undefined'` for SSR safety.
- **CSS-in-JS**: Use scoped `<style>` blocks within components for component-specific styles when `globals.css` isn't enough.
- **Localization (Mandatory)**:
  - Any new or changed user-facing UI text must be provided in **both English and Hindi**.
  - Store UI strings in `src/lib/locales/english.json` and `src/lib/locales/hindi.json`; look them up via `translate()`/`t` from `src/lib/client/i18n.js`. Do not hardcode text in components.

---

## 📝 Common Tasks

### Adding a New Page:
1. Create a folder in `src/routes/[pagename]/+page.svelte`.
2. Use the shared Tailwind container utilities for consistent padding.
3. Update the route list in `README.md` if the page is significant.

### Modifying the Prompt:
1. Edit `src/lib/server/prompt.js`.
2. Ensure any schema changes are also reflected in `src/lib/server/quizSchema.js` and `src/routes/api/generate/+server.js`.

### Adding a Component:
1. Place shared components in `src/lib/client/`.
2. Use native SVG or a local Svelte component for icons.
3. Use Svelte runes or stores for state.

### Adding Unit Tests:
1. Put tests next to the source as `*.test.js` (vitest is configured; `npm run test`).
2. Prefer testing pure server logic (`src/lib/server/*`, `src/lib/shared/*`) — parse/validation/redaction code has no network or DB dependencies in the tested functions.

---

## 🔐 Environment Variables
Required for local development (see `.env.example`):
- `GEMINI_API_KEY`: For quiz generation.
- `DATABASE_URL`: Neon PostgreSQL connection string.

Optional:
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_SESSION_SECRET`: Enable the admin dashboard and `/api/admin/*` stats.

---

## 🚦 Verification Checklist
Before submitting a change:
1. [ ] Run `npm run lint`.
2. [ ] Run `npm run check` (SvelteKit sync + production build).
3. [ ] Run `npm run test` (vitest unit tests).
4. [ ] Verify mobile responsiveness (check Safari/Chrome mobile view).
5. [ ] Test with "Slow 3G" throttling in DevTools to ensure data-saver mode triggers.
6. [ ] Verify safe areas on iOS (no content hidden behind notches or home indicators).
7. [ ] If adding an API, check rate limiting in `src/lib/server/rateLimiter.js`.
8. [ ] Ensure Google Adsense (`ADSENSE.md`) or PWA features aren't broken.
9. [ ] Validate quiz/explanation rendering for markdown + math/symbol-heavy content.
10. [ ] Validate behavior on low-end Android profile + slow internet (no blocking jank).

---

## 📚 Related Documents

- [README.md](README.md) — user-facing setup, env vars, API endpoints.
- [docs/architecture.md](docs/architecture.md) — data flow, key modules, design decisions.
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution workflow.
- [ADSENSE.md](ADSENSE.md) — Google Adsense requirements (don't break them).

---

*Last updated: Aug 2026*
