# SvelteKit Migration Plan

Status: implementation started

## Authoritative scope decision

- Authentication, Google sign-in, session cookies, cloud user-state sync, and user-attempt persistence are intentionally removed.
- Do not add `app_user`, `app_user_session`, `app_user_state`, `app_user_test_attempt`, or `ai_test.created_by_user_id` to the runtime schema.
- Keep the product local-first: browser storage holds user-specific history, bookmarks, preferences, and attempts; Neon stores generated tests and operational telemetry only.

Decision baseline:
- Full in-place rewrite.
- Vercel deployment.
- Bootstrap for quick migration and visual parity.
- JavaScript only.
- Preserve localStorage, public URLs, public API routes, SEO, PWA behavior, and the account-free database schema.
- Full parity before production cutover.
- Minimize behavior changes during migration.

Use this document as the migration checklist and source of truth. Update it when migration decisions change.

## Implementation Ledger

### Implemented

- SvelteKit project scaffold is active:
  - `package.json` scripts now use Vite/SvelteKit.
  - `svelte.config.js` uses `@sveltejs/adapter-vercel` with `nodejs22.x`.
  - `vite.config.js` includes SvelteKit and `vite-plugin-pwa`.
  - `src/app.html` owns the base document shell, Bootstrap CDN, manifest, icons, mobile viewport, theme color, and AdSense account meta.
- Static assets are copied into SvelteKit's `static/` directory:
  - `ads.txt`, `manifest.json`, `robots.txt`, `sitemap.xml`, and app icons.
- Server/API migration baseline is implemented:
  - Server utilities are available under `src/lib/server/*`.
  - Shared API error helpers are available under `src/lib/shared/*`.
  - SvelteKit endpoints exist for `/api/generate`, `/api/explain`, and `/api/test`.
  - Gemini prompt logic, rate limiting, anonymous test persistence, and local-first state are preserved.
- Core Svelte client foundation is implemented:
  - Preference stores for language, theme, and data saver.
  - LocalStorage helpers preserving existing keys and JSON shapes.
- Functional route baseline is implemented:
  - `/` can generate a quiz through `/api/generate` and stores the result under existing localStorage/history keys.
  - `/test` can load a local or remote test, persist draft answers, navigate questions, and submit.
  - `/results` can read submitted history, show score/review, and fetch explanations through `/api/explain`.
  - `/history` can list, search, open, and clear local test history.
- Rendering baseline is implemented:
  - Sanitized markdown rendering through `unified`, `remark-gfm`, `remark-math`, `rehype-sanitize`, and `rehype-katex`.
  - KaTeX styles are loaded globally.
- Verification completed:
  - `npm run lint` passes.
  - `npm run build` passes.
  - Dev server checked at `http://127.0.0.1:5173/`.
  - `/` and `/history` return `200`.

### Partially Implemented

- PWA support is configured with `vite-plugin-pwa`, but full offline behavior, install prompt, cache policy parity, and slow-network QA are not complete.
- SEO metadata exists at the layout level, but page-specific metadata and dynamic blog SEO are not fully ported.
- Markdown and KaTeX rendering are available, but Mermaid/lazy diagram rendering is not implemented yet.
- Theme/language/data-saver state exists, but the new Svelte UI is not fully localized and does not yet consume the existing locale JSON files throughout.
- The active UI is functional but not yet full visual parity with the old React/Bootstrap implementation.

### Not Yet Implemented

- Full visual-parity Svelte replacements for the remaining placeholder pages:
  - `/bookmarks`
  - `/about`
  - `/contact`
  - `/privacy`
  - `/terms`
  - `/faq`
  - `/blog`
  - `/blog/[slug]`
- Full visual-parity versions of the complex existing UI components:
  - Mobile optimized layout details.
  - Top and bottom nav parity.
  - Offline/slow connection banners.
  - Pull-to-refresh.
  - PWA install hint.
  - Toast system.
  - Achievement/streak/stats/dashboard surfaces.
  - Bookmarks UI.
  - Print/share/export helpers.
- Existing English/Hindi localization files are not yet wired into all changed Svelte UI text.
- Mermaid/lazy diagram rendering is not yet added.
- AdSense script integration and any Vercel analytics/speed-insights replacement are not finished.
- Generated Next files and old React/Next source have not been removed yet; they remain as reference during migration.
- Full QA is not complete:
  - Quiz generation with production env values.
  - Explanation generation.
  - LocalStorage migration from an existing browser profile.
  - Mobile viewports at 320px, 375px, 414px, tablet, and desktop.
  - Slow 3G/data-saver behavior.
  - Offline/PWA behavior.
  - SEO output for sitemap, robots, canonical URLs, JSON-LD, and blog pages.

## Progress Checkpoints

- 2026-06-20: Created SvelteKit/Vercel scaffold, switched package scripts to Vite/SvelteKit, copied static assets into `static/`, ported server utilities and API endpoints, added route-compatible placeholder pages, configured PWA generation, and verified `npm run lint` plus `npm run build`.
- 2026-06-20: Added Svelte client stores/helpers for preferences, localStorage, history, and draft answers. Replaced `/`, `/test`, `/results`, and `/history` placeholders with functional Svelte flows. Added sanitized markdown + KaTeX rendering for question/review content. Re-verified `npm run lint` and `npm run build`.
- Remaining: replace remaining placeholder pages with full visual-parity Svelte components, finish Hindi/English localization wiring across new UI, add Mermaid/lazy diagram rendering, finish analytics/ad integrations, and complete full mobile/PWA/localStorage parity QA.

## Summary

Rewrite the app in place from Next.js 16 App Router to SvelteKit, targeting Vercel with full production parity before cutover. Preserve public URLs, public API routes, localStorage keys, the account-free database schema, SEO metadata, PWA behavior, Bootstrap-based visual design, Hindi/English localization, and low-end mobile performance.

Use JavaScript only. Do a direct replacement on a migration branch, using git as rollback. Do not intentionally redesign UI during migration; visual parity is the first target.

## Key Implementation Changes

- Replace Next dependencies and scripts with SvelteKit:
  - Use `@sveltejs/kit`, `@sveltejs/adapter-vercel`, `vite`, `svelte`, `eslint`, `vite-plugin-pwa`.
  - Keep `bootstrap`, `@google/genai`, `@neondatabase/serverless`, `zod`, `katex`, `mermaid`, `remark-gfm`, `remark-math`, `rehype-katex`.
  - Remove `next`, `react`, `react-dom`, `react-bootstrap`, `next-pwa`, Next analytics packages, and Next ESLint config.
- Recreate the app shell:
  - `src/routes/+layout.svelte` replaces the current root layout.
  - `src/app.html` owns viewport, PWA, AdSense, Bootstrap CDN, icons, theme-color, and base document markup.
  - Convert React Contexts to Svelte stores for language, theme, data saver, network, and toast.
- Preserve route compatibility:
  - `/`, `/test`, `/results`, `/history`, `/bookmarks`, `/about`, `/contact`, `/privacy`, `/terms`, `/faq`, `/blog`, `/blog/[slug]`.
  - Keep `/robots.txt`, `/sitemap.xml`, `/manifest.json`, `/ads.txt`, and icon paths unchanged.
- Preserve API compatibility:
  - `/api/generate`, `/api/explain`, `/api/test`.
  - Response bodies, status codes, rate-limit headers, timeout codes, and request payloads must remain compatible.
  - Move server utilities into `src/lib/server/*`.
  - Replace `NextResponse.json` with SvelteKit `json`.
  - Replace Next request cookies with SvelteKit `cookies`.
- Preserve the account-free scope:
  - Do not port authentication routes, session cookies, Google OAuth configuration, cloud user-state sync, or user-attempt persistence.
  - Keep only `GEMINI_API_KEY` and `DATABASE_URL` as application environment variables.
- Preserve local data:
  - Keep all current localStorage keys exactly, including `selftest_history`, `selftest_question_paper`, `selftest_user_answers`, `selftest_unsubmitted_test`, `selftest_language`, `selftest_theme`, `dataSaverMode`, and `soundEffectsEnabled`.
- Preserve rendering fidelity:
  - Rebuild markdown rendering with `unified`, `remark-gfm`, `remark-math`, `rehype-katex`, sanitized HTML output, and lazy Mermaid rendering.
  - Do not render unsanitized model HTML.
  - Keep light renderer as default and heavy renderer lazy-loaded for math/diagram-heavy content.
- Preserve PWA:
  - Replace `next-pwa` with `vite-plugin-pwa`.
  - Do not reuse generated Next `public/sw.js`; regenerate SvelteKit-compatible Workbox output.
  - Keep offline/slow banners, install hint, manifest, safe-area CSS, and API cache exclusions.
- Preserve UI parity:
  - Convert React Bootstrap components to equivalent Bootstrap HTML classes in Svelte.
  - Keep Bootstrap CDN loading unless a component requires npm CSS import.
  - Keep mobile-first layout, bottom nav, top nav, 44px tap targets, data-saver animation reductions, and existing CSS variables.
- Preserve SEO and ads:
  - Recreate page-level `<svelte:head>` metadata.
  - Preserve canonical URLs, OpenGraph/Twitter data, JSON-LD organization/website schema, AdSense account meta, robots, and sitemap output.

## Migration Order

1. Replace project scaffold and package scripts with SvelteKit + Vercel adapter.
2. Port server utilities and all API endpoints first; verify API parity before UI work.
3. Port global stores, layout, navigation, PWA registration, theme/language/data-saver behavior.
4. Port core flows: home generation, test taking, results, history, bookmarks.
5. Port static/content pages and blog with URL/metadata parity.
6. Port markdown/math/diagram rendering and print/share/export helpers.
7. Finish PWA, analytics/ads equivalents, SEO files, and production deployment config.
8. Run full parity QA before production cutover.

## Public Interfaces To Preserve

- API paths, methods, payloads, response shapes, error codes, and rate-limit headers remain unchanged.
- Database schema remains unchanged; no destructive migration.
- LocalStorage key names and stored JSON shapes remain unchanged.
- Public routes and blog slugs remain unchanged.
- Environment variable names remain backward-compatible.

## Test Plan

- Run `npm run lint` and `npm run build`.
- API parity checks:
  - `/api/generate` validates inputs, respects timeouts, stores `ai_test`, and returns the same quiz shape.
  - `/api/explain` returns `{ explanation }` and preserves timeout/rate-limit behavior.
- Client flow checks:
  - Generate quiz in English and Hindi.
  - Take test, submit, view results, revisit from history.
  - Bookmark exams and quiz presets.
  - Create a test, reload, and verify local history, bookmarks, preferences, and attempts remain available.
  - Recover unsubmitted test.
  - Switch theme and language.
- Rendering checks:
  - Markdown lists, emphasis, code blocks, Unicode science symbols, KaTeX math, and Mermaid diagrams.
  - Data-saver mode uses lighter rendering and reduced animations.
- Mobile/PWA checks:
  - 320px, 375px, 414px, tablet, desktop.
  - iOS safe areas.
  - Slow 3G/data-saver behavior.
  - Offline banner and cached app shell.
  - PWA install prompt.
- SEO checks:
  - `/robots.txt`, `/sitemap.xml`, metadata, JSON-LD, canonical URLs, manifest, icons, and `ads.txt`.

## Assumptions

- Migration happens on a dedicated branch, but directly replaces the Next app in this repo.
- Full parity is required before production cutover.
- UI improvements are deferred until after migration.
- Bootstrap remains the visual foundation.
- Vercel remains the deployment target.
- Existing production environment variable names must keep working.
- Existing users must keep their local history, bookmarks, and preferences.
