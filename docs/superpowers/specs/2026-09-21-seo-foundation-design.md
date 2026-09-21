# SEO Foundation — Design

Date: 2026-09-21
Status: implemented — see `tasks/plan-seo.md` for task status and verification
Scope: crawling/indexing hygiene, Hindi URL space, measurement, AI search visibility, prerender + caching. No new page types (see Out of scope).

## Implementation notes (deviations from the draft design)

1. **URL-driven language lives in the root universal load**, not a layout store
   sync: `+layout.js` derives `lang` from the URL, registers the Hindi
   dictionary before render (it used to be client-lazy only, so SSR never saw
   Hindi) and sets the `activeLanguage` store. A store derived from
   `$app/stores` was tried first and leaked across SSR requests because
   module-level store subscriptions are never torn down during SSR.
2. **The home page title is rendered at route level.** Svelte 5 drops `<title>`
   tags emitted by nested components during streamed SSR, and the home is the
   only indexable page served that way (everything else prerenders).
   `SeoHead`'s `title` prop is therefore optional.
3. `+layout.server.js` is unchanged; the language travels through the universal
   layout load instead.

## Context

selftest.in currently ships 96 indexable URLs (home, practice hub, 80 exam pages, blog index + 8 posts, about, FAQ, contact, legal) with per-page metadata, canonical, OG/Twitter tags, JSON-LD, sitemap and RSS. Known gaps this workstream fixes:

- Blog and static pages are SSR, not prerendered; sitemap `lastmod` is one hardcoded date.
- Hindi is a client-side store: one URL per page, SSR always English, `lang="en"`, no Hindi hreflang. Google has never seen the Hindi content.
- Canonical/OG tags are emitted on `noindex` app pages; RSS has no discovery `<link>`; no `llms.txt`; Workbox serves HTML `StaleWhileRevalidate`.
- No Search Console access, so there is no measurement baseline.

Goal: make everything already built reliably crawlable, give Hindi its own indexable URLs, and set up measurement — before adding any new page types.

## 1. Architecture (approved)

Parallel `/hi` route tree over shared page components. English route tree is untouched (zero regression risk to 96 live URLs).

- **Indexable surface gets a `/hi` twin:** `/hi`, `/hi/practice`, `/hi/practice/[examId]` (80), `/hi/blog`, `/hi/blog/[slug]` (8), `/hi/about`, `/hi/faq`, `/hi/contact`, `/hi/privacy`, `/hi/terms`.
- **App shell stays single-URL:** `/test`, `/results`, `/history`, `/bookmarks`, `/profile`, `/admin` remain `noindex` with no Hindi twin.
- **Body components are extracted** from each indexable page into `src/lib/client/pages/*.svelte` (body only, `$t()`-driven). Both language routes are thin wrappers: `<svelte:head>` via `seo.js` + the shared component.
- **Language comes from the URL** on indexable pages: `+layout.server.js` returns `lang` derived from the pathname (`/hi/*` → `hindi`); the root layout synchronously sets the existing `language` store so SSR/prerender renders the right language and the app continues in it after navigation. On indexable pages the URL wins over the stored preference. App pages keep today's preference behavior.
- **Language toggle navigates** between twins on indexable pages (`/practice/x` ↔ `/hi/practice/x`); it flips the store only on app pages. No Accept-Language auto-redirects.
- `<html lang>` is server-rendered via a new `src/hooks.server.js` (`transformPageChunk` replacing a placeholder in `app.html`); the existing pre-paint script keeps handling app pages.

## 2. SEO head layer

New `src/lib/shared/seo.js` is the single source for head data:

- `buildSeo({ path, lang, title, description, type })` → canonical, hreflang alternates (`en-IN` → English URL, `hi-IN` → `/hi` URL, reciprocal; `x-default` → English URL), OG (`og:url`, `og:locale`, `og:locale:alternate`), Twitter, robots.
- `languageHref(pathname, lang)` → twin URL or `null` when no twin exists.
- Origin (`https://www.selftest.in`) and twin mapping live here; pages stop hardcoding them.
- **No canonical/`og:url` on `noindex` pages** (test/history/results/bookmarks/profile/admin/error).
- JSON-LD `url`/`inLanguage` become language-aware. Existing schema types unchanged.

## 3. Hindi content layer

Syllabus units and `stream` values get Hindi strings (11 shared syllabus templates, ~40 unique units + streams) via an overlay in `src/lib/data/indianExams.js` (e.g. `syllabusHi`, `streamHi`). Exam acronyms (SSC CGL, IBPS PO) stay Latin — standard for Hindi-medium content. Titles/descriptions/body copy come from the existing locale dictionaries; missing keys fall back to English (already the `translate()` behavior).

## 4. Crawl & index hygiene

- **Prerender:** blog index + posts, about/FAQ/contact/privacy/terms, practice hub, and all `/hi` equivalents (via `entries()`), in addition to the already-prerendered exam pages (now ×2 languages). Home stays SSR (app-dynamic).
- **Sitemap:** both languages, `xhtml:link` hreflang alternates, `lastmod` only where real (blog `post.modified || post.date`); drop the hardcoded static date.
- **RSS:** add `<link rel="alternate" type="application/rss+xml">` to the layout head.
- **robots.txt:** keep existing disallows; add explicit `Allow` groups for GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended (citations wanted, not blocks).
- **`/llms.txt`:** prerendered route generated from the registries — summary, core pages, exam list, blog list, FAQ link, with `/hi` alternates noted.

## 5. Caching

`vite.config.js` Workbox: the `pages` runtime rule (currently `StaleWhileRevalidate`) moves to `NetworkFirst` with `networkTimeoutSeconds` (mirroring the `/api/` rule) and cache fallback so offline still works. Prerendered landing pages must not be served stale after a deploy.

## 6. Measurement

- `GOOGLE_SITE_VERIFICATION` set in the Vercel production build env (prerendered pages bake it at build time — requires a rebuild). The Google-account side (property + sitemap submission) is a documented checklist for the repo owner.
- `docs/seo-baseline.md`: what to record day 0 / day 14 (indexed vs excluded counts, top queries/pages, impressions), so the next workstream is data-driven.

## 7. Phases (each independently shippable)

- **Phase 0 — hygiene + measurement:** robots AI-crawler allows, `/llms.txt` (English), RSS discovery link, sitemap `lastmod` cleanup, noindex canonical removal, Workbox NetworkFirst, GSC env + baseline doc. No rendering or URL changes.
- **Phase 1 — prerender + head layer:** `seo.js` introduced and English indexable pages refactored onto it; English blog/static/hub prerendered. No URL changes.
- **Phase 2 — Hindi URL space:** `/hi` wrappers + component extraction for all indexable pages, URL-driven language plumbing, Hindi data layer, bilingual sitemap hreflang alternates, `/llms.txt` `/hi` entries, and prerendering of `/hi` routes.

## 8. Tests

- **Unit (vitest):** `seo.js` (canonical + reciprocal hreflang per lang, `languageHref`, noindex emits no canonical); sitemap/llms contain both languages for every registry entry; `/hi` ↔ English parity (every indexable route definition has a twin).
- **E2E (existing smoke suite):** per page type (home, hub, exam, blog index/post, FAQ + `/hi` twins) assert title, description, canonical, hreflang links, `html lang`, JSON-LD presence; Hindi pages contain Hindi text; `noindex` pages have no canonical.

## Risks / notes

- Prerendering with `$env/dynamic/private` bakes values at build time (already true for exam pages today); verification tag requires the env var at build.
- Store sync during SSR is deterministic because every route's load supplies `lang` before render; a test guards it.
- Extracting body components touches existing pages; the e2e smoke suite runs before/after as the safety net.
- Installed service workers may serve stale HTML from the old Workbox config until the new SW activates (cache TTL 24h, entries capped at 32).

## Out of scope

New programmatic page types (exam × subject, glossary, tools/converters, comparison and stat pages), per-page/dynamic OG images, `SearchAction` sitelinks searchbox, Hindi RSS, IndexNow, Accept-Language redirects, Hindi URLs for the app shell, analytics dashboards.
