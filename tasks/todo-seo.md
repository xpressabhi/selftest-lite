## Task 1: `seo.js` base + noindex canonical suppression
**Description:** Create `src/lib/shared/seo.js` with `SITE_ORIGIN`, `NOINDEX_PREFIXES`, `isNoindexPath(pathname)`; root layout stops emitting canonical/`og:url`/`x-default` on noindex paths and non-200 pages. Unit tests.
**Acceptance criteria:**
- [ ] `/test`, `/results`, `/history`, `/bookmarks`, `/profile`, `/admin` produce no canonical and no `og:url`
- [ ] Indexable pages unchanged (self-canonical + x-default still present)
- [ ] Tests cover prefix matching and query strings
**Verification:**
- [ ] Tests pass: `npm run test -- seo`
- [ ] Manual check: preview HTML of `/test` and `/about`
**Dependencies:** None
**Files likely touched:** `src/lib/shared/seo.js`, `src/lib/shared/seo.test.js`, `src/routes/+layout.svelte`
**Estimated scope:** Small: 1-2 files

## Task 2: robots.txt AI-crawler allows
**Description:** Explicit allow groups for GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended; keep existing disallows and sitemap line.
**Acceptance criteria:**
- [ ] Named bots allowed, app paths still disallowed for `*`
- [ ] File stays valid robots.txt
**Verification:**
- [ ] Manual check: `curl` preview `/robots.txt`
**Dependencies:** None
**Files likely touched:** `static/robots.txt`
**Estimated scope:** XS

## Task 3: `/llms.txt`
**Description:** Pure builder `src/lib/shared/llms.js` (summary, core pages, exams, blog, FAQ, `/hi` noted later) + prerendered route `src/routes/llms.txt/+server.js` + tests asserting every registry entry appears once.
**Acceptance criteria:**
- [ ] 80 exams + 8 posts + core pages listed with absolute URLs
- [ ] Route prerenders; builder has no SvelteKit imports
**Verification:**
- [ ] Tests pass: `npm run test -- llms`
**Dependencies:** None
**Files likely touched:** `src/lib/shared/llms.js`, `src/lib/shared/llms.test.js`, `src/routes/llms.txt/+server.js`
**Estimated scope:** Small: 1-2 files

## Task 4: sitemap lastmod cleanup
**Description:** Drop `STATIC_LASTMOD`; static/hub/exam entries carry no `lastmod`, blog keeps `post.modified || post.date`. Keep XML valid and cache headers.
**Acceptance criteria:**
- [ ] No fabricated dates; blog dates real
- [ ] URL count unchanged (96)
**Verification:**
- [ ] Tests pass: `npm run test`
- [ ] Manual check: preview `/sitemap.xml`
**Dependencies:** None
**Files likely touched:** `src/routes/sitemap.xml/+server.js`
**Estimated scope:** XS

## Task 5: RSS discovery link
**Description:** Add `<link rel="alternate" type="application/rss+xml" title="selftest.in blog" href="/rss.xml">` to the layout head.
**Acceptance criteria:**
- [ ] Present on all pages; absolute or root-relative valid
**Verification:**
- [ ] Manual check: preview head of `/` and `/blog`
**Dependencies:** None
**Files likely touched:** `src/routes/+layout.svelte`
**Estimated scope:** XS

## Task 6: Workbox pages NetworkFirst
**Description:** `pages` runtime rule moves from `StaleWhileRevalidate` to `NetworkFirst` with `networkTimeoutSeconds: 3`, cache fallback for offline.
**Acceptance criteria:**
- [ ] HTML navigations prefer network; offline still serves cached page
- [ ] No other cache rules changed
**Verification:**
- [ ] `npm run check`; manual check offline toggle in preview
**Dependencies:** None
**Files likely touched:** `vite.config.js`
**Estimated scope:** XS

## Task 7: Measurement docs
**Description:** `.env.example` note that `GOOGLE_SITE_VERIFICATION` must be set at Vercel build time; new `docs/seo-baseline.md` with GSC verification + sitemap submission checklist and day-0/day-14 recording template.
**Acceptance criteria:**
- [ ] Checklist is actionable by a non-engineer
- [ ] No secrets in docs
**Verification:**
- [ ] Manual read-through
**Dependencies:** None
**Files likely touched:** `.env.example`, `docs/seo-baseline.md`
**Estimated scope:** Small: 1-2 files

## Checkpoint: After Tasks 1-7
- [ ] `npm run lint`, `npm run test`, `npm run smoke` pass
- [ ] Review with human before Phase 2

## Task 8: `seo.js` full head layer
**Description:** `buildSeo({ path, lang, title, description, type })` returning canonical, reciprocal hreflang (en-IN, hi-IN, x-default), og:url/og:locale/alternates, twitter; `languageHref(pathname, lang)` returning the twin URL or null. Pure + tests.
**Acceptance criteria:**
- [ ] hreflang pairs reciprocal for every twin route
- [ ] App paths produce `languageHref === null`
- [ ] No page hardcodes the origin after this phase
**Verification:**
- [ ] Tests pass: `npm run test -- seo`
**Dependencies:** Task 1
**Files likely touched:** `src/lib/shared/seo.js`, `src/lib/shared/seo.test.js`
**Estimated scope:** Small

## Task 9: refactor heads group A (home, hub, exam)
**Description:** Replace hand-rolled head blocks with `buildSeo` data; keep titles/descriptions identical.
**Acceptance criteria:**
- [ ] Rendered head byte-equal except ordered/duplicate tags
- [ ] No behaviour change in JSON-LD types
**Verification:**
- [ ] `npm run test`, `npm run check`
**Dependencies:** Task 8
**Files likely touched:** `src/routes/+page.svelte`, `src/routes/practice/+page.svelte`, `src/routes/practice/[examId]/+page.svelte`
**Estimated scope:** Medium

## Task 10: refactor heads group B (blog index, post)
**Description:** Same as Task 9 for blog routes; post keeps `og:type=article` + BlogPosting JSON-LD.
**Acceptance criteria:**
- [ ] Blog JSON-LD intact
**Verification:**
- [ ] `npm run test`, `npm run check`
**Dependencies:** Task 8
**Files likely touched:** `src/routes/blog/+page.svelte`, `src/routes/blog/[slug]/+page.svelte`
**Estimated scope:** Small

## Task 11: refactor heads group C (static pages)
**Description:** Same for about, faq, contact, privacy, terms.
**Acceptance criteria:**
- [ ] FAQ has no canonical change; legal pages unchanged
**Verification:**
- [ ] `npm run test`, `npm run check`
**Dependencies:** Task 8
**Files likely touched:** `src/routes/{about,faq,contact,privacy,terms}/+page.svelte`
**Estimated scope:** Medium

## Task 12: prerender English content pages
**Description:** `prerender = true` (+ `entries()` where dynamic) for blog index, blog posts, about/faq/contact/privacy/terms, practice hub.
**Acceptance criteria:**
- [ ] Build output contains static HTML for each; home stays SSR
- [ ] 404 for unknown blog slug still works
**Verification:**
- [ ] `npm run check`; inspect `.vercel/output/static`
**Dependencies:** Tasks 8-11
**Files likely touched:** `src/routes/**/+page.js` (new files), possibly `+layout.server.js`
**Estimated scope:** Medium

## Task 13: e2e head assertions
**Description:** Extend `tests/e2e/smoke.e2e.js` (or new `tests/e2e/seo.e2e.js`) asserting title, description, canonical, x-default, JSON-LD presence per page type.
**Acceptance criteria:**
- [ ] Covers home, hub, exam, blog index, blog post, faq, noindex page
- [ ] Fails if canonical disappears
**Verification:**
- [ ] `npm run smoke`
**Dependencies:** Tasks 9-12
**Files likely touched:** `tests/e2e/seo.e2e.js`
**Estimated scope:** Small

## Checkpoint: After Tasks 8-13
- [ ] `npm run check` + full suite pass
- [ ] Prerendered HTML inspected manually
- [ ] Review with human before Phase 3

## Task 14: Hindi data layer
**Description:** `streamHi` + `syllabusHi` overlay keyed by exam stream/template in `indianExams.js`; helper `examSyllabus(exam, lang)`. Tests assert full coverage.
**Acceptance criteria:**
- [ ] Every unique syllabus unit + stream has a Hindi string
- [ ] Acronyms (exam ids/names) untouched
**Verification:**
- [ ] `npm run test -- indianExams` (new test file)
**Dependencies:** None
**Files likely touched:** `src/lib/data/indianExams.js`, `src/lib/data/indianExams.test.js`
**Estimated scope:** Medium

## Task 15: extract practice body components
**Description:** Move hubs/exam markup into `src/lib/client/pages/PracticeHubPage.svelte` / `ExamPage.svelte`; English routes render them unchanged.
**Acceptance criteria:**
- [ ] English pages visually and structurally unchanged (e2e passes)
**Verification:**
- [ ] `npm run smoke`
**Dependencies:** Tasks 8-12
**Files likely touched:** `src/lib/client/pages/*.svelte`, `src/routes/practice/**`
**Estimated scope:** Medium

## Task 16: extract blog + static body components
**Description:** Same as Task 15 for blog index/post, about, faq, contact, privacy, terms.
**Acceptance criteria:**
- [ ] English pages unchanged (e2e passes)
**Verification:**
- [ ] `npm run smoke`
**Dependencies:** Task 15
**Files likely touched:** `src/lib/client/pages/*.svelte`, `src/routes/{blog,about,faq,contact,privacy,terms}/**`
**Estimated scope:** Large (split if needed)

## Task 17: extract home landing component
**Description:** Move home markup into `src/lib/client/pages/HomePage.svelte`; `/` renders it unchanged.
**Acceptance criteria:**
- [ ] Planner/chat behaviour unchanged (smoke test home passes)
**Verification:**
- [ ] `npm run smoke`
**Dependencies:** Task 16
**Files likely touched:** `src/lib/client/pages/HomePage.svelte`, `src/routes/+page.svelte`
**Estimated scope:** Medium

## Task 18: lang plumbing
**Description:** `+layout.server.js` returns `lang` from path; layout syncs store; new `hooks.server.js` replaces `%lang%` in `app.html` via `transformPageChunk`.
**Acceptance criteria:**
- [ ] `/hi/*` SSR emits `<html lang="hi">` and Hindi store value
- [ ] App pages keep preference behaviour
**Verification:**
- [ ] `npm run test` + preview HTML check
**Dependencies:** Task 17
**Files likely touched:** `src/routes/+layout.server.js`, `src/routes/+layout.svelte`, `src/hooks.server.js`, `src/app.html`
**Estimated scope:** Medium

## Task 19: `/hi` route tree
**Description:** Wrappers for home, hub, exam, blog, static pages; seo.js hreflang pairs; lang-aware internal links (related exams, blog links, CTA); toggle navigates between twins on indexable pages.
**Acceptance criteria:**
- [ ] `/hi`, `/hi/practice`, 80 `/hi/practice/*`, `/hi/blog`, 8 posts, static pages render Hindi
- [ ] Toggle on `/hi/*` goes to English twin and vice versa; app pages still flip store
- [ ] No English page links to `/hi` except hreflang/language toggle
**Verification:**
- [ ] `npm run smoke` + manual browser check
**Dependencies:** Tasks 14, 18
**Files likely touched:** `src/routes/hi/**` (new), `src/lib/client/pages/*`, `src/lib/client/i18n.js` (link helper)
**Estimated scope:** Large

## Task 20: bilingual sitemap + llms + prerender
**Description:** Sitemap emits both languages with `xhtml:link` alternates; llms.txt lists `/hi` alternates; `/hi` routes prerender with `entries()`.
**Acceptance criteria:**
- [ ] Every indexable URL appears with reciprocal alternates
- [ ] Build output contains `/hi` prerendered pages
**Verification:**
- [ ] `npm run test`, `npm run check`
**Dependencies:** Task 19
**Files likely touched:** `src/routes/sitemap.xml/+server.js`, `src/lib/shared/llms.js`, `src/routes/hi/**`
**Estimated scope:** Medium

## Task 21: e2e parity + verification
**Description:** e2e: `/hi` pages render Hindi (`html lang`, title), parity test EN↔HI route inventory; final smoke.
**Acceptance criteria:**
- [ ] Every indexable English route has a Hindi twin assertion
- [ ] Full suite green
**Verification:**
- [ ] `npm run lint && npm run test && npm run smoke`
**Dependencies:** Task 20
**Files likely touched:** `tests/e2e/seo.e2e.js`, `src/lib/shared/seo.test.js`
**Estimated scope:** Small

## Checkpoint: Complete
- [ ] All acceptance criteria met
- [ ] Manual check: `/hi` language toggle round-trip on mobile viewport
- [ ] Review with human before merge
