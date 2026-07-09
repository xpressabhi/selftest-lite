# SvelteKit Migration Plan

Status: implementation started

Decision baseline:
- Full in-place rewrite.
- Vercel deployment.
- Bootstrap for quick migration and visual parity.
- JavaScript only.
- Preserve auth, localStorage, public URLs, API routes, SEO, PWA behavior, and database schema.
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
  - SvelteKit endpoints exist for `/api/generate`, `/api/explain`, `/api/test`, `/api/user/state`, `/api/auth/google`, `/api/auth/me`, and `/api/auth/logout`.
  - Existing DB schema, Gemini prompt logic, rate limiting, test persistence, and `selftest_session` cookie behavior are preserved.
- Core Svelte client foundation is implemented:
  - Auth store and session refresh/logout helpers.
  - Preference stores for language, theme, and data saver.
  - LocalStorage helpers preserving existing keys and JSON shapes.
  - User data sync component using `/api/user/state`.
  - Google sign-in component using the existing `/api/auth/google` endpoint.
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
  - `/api/auth/me` returns expected unauthenticated `401` and clears stale `selftest_session`.

### Partially Implemented

- PWA support is configured with `vite-plugin-pwa`, but full offline behavior, install prompt, cache policy parity, and slow-network QA are not complete.
- SEO metadata exists at the layout level, but page-specific metadata and dynamic blog SEO are not fully ported.
- Google sign-in is wired, but full browser verification with a real Google credential is still required.
- User-state sync is ported, but needs authenticated end-to-end QA across reloads, sign-out, and sign-in.
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
  - Google sign-in with real credentials.
  - Authenticated sync.
  - Quiz generation with production env values.
  - Explanation generation.
  - LocalStorage migration from an existing browser profile.
  - Mobile viewports at 320px, 375px, 414px, tablet, and desktop.
  - Slow 3G/data-saver behavior.
  - Offline/PWA behavior.
  - SEO output for sitemap, robots, canonical URLs, JSON-LD, and blog pages.

## Progress Checkpoints

- 2026-06-20: Created SvelteKit/Vercel scaffold, switched package scripts to Vite/SvelteKit, copied static assets into `static/`, ported server utilities and API endpoints, added route-compatible placeholder pages, configured PWA generation, and verified `npm run lint` plus `npm run build`.
- 2026-06-20: Added Svelte client stores/helpers for auth, preferences, localStorage, history, draft answers, Google sign-in, and user-state sync. Replaced `/`, `/test`, `/results`, and `/history` placeholders with functional Svelte flows. Added sanitized markdown + KaTeX rendering for question/review content. Re-verified `npm run lint` and `npm run build`.
- Remaining: replace remaining placeholder pages with full visual-parity Svelte components, finish Hindi/English localization wiring across new UI, add Mermaid/lazy diagram rendering, finish analytics/ad integrations, and complete full mobile/PWA/auth/localStorage parity QA.

## Summary

Rewrite the app in place from Next.js 16 App Router to SvelteKit, targeting Vercel with full production parity before cutover. Preserve public URLs, API routes, auth/session behavior, localStorage keys, database schema, SEO metadata, PWA behavior, Bootstrap-based visual design, Hindi/English localization, and low-end mobile performance.

Use JavaScript only. Do a direct replacement on a migration branch, using git as rollback. Do not intentionally redesign UI during migration; visual parity is the first target.

## Key Implementation Changes

- Replace Next dependencies and scripts with SvelteKit:
  - Use `@sveltejs/kit`, `@sveltejs/adapter-vercel`, `vite`, `svelte`, `eslint`, `vite-plugin-pwa`.
  - Keep `bootstrap`, `@google/genai`, `@neondatabase/serverless`, `zod`, `katex`, `mermaid`, `remark-gfm`, `remark-math`, `rehype-katex`.
  - Remove `next`, `react`, `react-dom`, `react-bootstrap`, `next-pwa`, Next analytics packages, and Next ESLint config.
- Recreate the app shell:
  - `src/routes/+layout.svelte` replaces the current root layout.
  - `src/app.html` owns viewport, PWA, AdSense, Bootstrap CDN, icons, theme-color, and base document markup.
  - Convert React Contexts to Svelte stores for auth, language, theme, data saver, network, toast, and user sync.
- Preserve route compatibility:
  - `/`, `/test`, `/results`, `/history`, `/bookmarks`, `/about`, `/contact`, `/privacy`, `/terms`, `/faq`, `/blog`, `/blog/[slug]`.
  - Keep `/robots.txt`, `/sitemap.xml`, `/manifest.json`, `/ads.txt`, and icon paths unchanged.
- Preserve API compatibility:
  - `/api/generate`, `/api/explain`, `/api/test`, `/api/user/state`, `/api/auth/google`, `/api/auth/me`, `/api/auth/logout`.
  - Response bodies, status codes, rate-limit headers, timeout codes, and request payloads must remain compatible.
  - Move server utilities into `src/lib/server/*`.
  - Replace `NextResponse.json` with SvelteKit `json`.
  - Replace Next request cookies with SvelteKit `cookies`.
- Preserve auth:
  - Keep cookie name `selftest_session`.
  - Keep 30-day TTL, SHA-256 token hashing, `httpOnly`, `sameSite: 'lax'`, `path: '/'`, production-only `secure`.
  - Keep DB tables and session refresh behavior.
  - Preserve existing env names: `GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `GEMINI_API_KEY`, `DATABASE_URL`.
  - Expose Google client ID to the client through SvelteKit server-loaded config, not by requiring a new public env var.
- Preserve local data:
  - Keep all current localStorage keys exactly, including `selftest_history`, `selftest_question_paper`, `selftest_user_answers`, `selftest_unsubmitted_test`, `selftest_language`, `selftest_theme`, `dataSaverMode`, and `soundEffectsEnabled`.
  - Port `UserDataSyncManager` behavior exactly: tracked key prefix, extra keys, debounce, remote hydrate, attempt merge, online/visibility sync.
- Preserve rendering fidelity:
  - Rebuild markdown rendering with `unified`, `remark-gfm`, `remark-math`, `rehype-katex`, sanitized HTML output, and lazy Mermaid rendering.
  - Do not render unsanitized model HTML.
  - Keep light renderer as default and heavy renderer lazy-loaded for math/diagram-heavy content.
- Preserve PWA:
  - Replace `next-pwa` with `vite-plugin-pwa`.
  - Do not reuse generated Next `public/sw.js`; regenerate SvelteKit-compatible Workbox output.
  - Keep offline/slow banners, install hint, manifest, safe-area CSS, and API/auth cache exclusions.
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
- Cookie name and session token format remain unchanged.
- LocalStorage key names and stored JSON shapes remain unchanged.
- Public routes and blog slugs remain unchanged.
- Environment variable names remain backward-compatible.

## Test Plan

- Run `npm run lint` and `npm run build`.
- API parity checks:
  - `/api/auth/me` unauthenticated returns `401` and clears stale cookie.
  - Google sign-in creates same DB user/session shape and sets `selftest_session`.
  - `/api/generate` validates inputs, respects timeouts, stores `ai_test`, and returns the same quiz shape.
  - `/api/explain` returns `{ explanation }` and preserves timeout/rate-limit behavior.
  - `/api/user/state` hydrates and syncs localStorage snapshots and attempts.
  - `/api/test?id=...` includes `myAttempt` when authenticated.
- Client flow checks:
  - Generate quiz in English and Hindi.
  - Take test, submit, view results, revisit from history.
  - Bookmark exams and quiz presets.
  - Sign in, sync data, reload, sign out, sign back in.
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
- Existing users must keep their sessions, local history, bookmarks, and synced account data.
