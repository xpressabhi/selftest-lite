# Implementation Plan: SEO Foundation

## Overview
Three shippable phases from `docs/superpowers/specs/2026-09-21-seo-foundation-design.md`: hygiene + measurement (no URL changes), prerender + shared head layer, then the `/hi` URL space with URL-driven language. English route tree is never moved.

## Architecture Decisions
- Parallel `/hi` route tree over extracted body components (`src/lib/client/pages/*`); English routes keep their URLs byte-identical.
- `src/lib/shared/seo.js` is the only place that knows the origin, canonical, hreflang pairs and noindex prefixes.
- Language on indexable pages comes from the URL; app pages keep the preference store.
- Content pages prerender (English now, `/hi` in phase 2); home stays SSR.
- Hindi overlay (`streamHi`, `syllabusHi`) in the exam registry; exam acronyms stay Latin.
- llms.txt/sitemap are generated from registries, with pure builders unit-tested outside the route files.

## Task List

### Phase 0: Hygiene + measurement
- [x] Task 1: `seo.js` base (origin, noindex prefixes) + layout drops canonical/og:url on noindex + tests
- [x] Task 2: robots.txt AI-crawler allow groups
- [x] Task 3: `/llms.txt` builder + route + tests
- [x] Task 4: sitemap `lastmod` cleanup (blog-only, real dates)
- [x] Task 5: RSS discovery link in layout head
- [x] Task 6: Workbox `pages` cache → NetworkFirst
- [x] Task 7: measurement docs (`.env.example` note, `docs/seo-baseline.md` + GSC checklist)

### Checkpoint: Phase 0
- [x] `npm run lint`, `npm run test`, `npm run smoke` pass
- [x] Preview build serves `/llms.txt`, robots, sitemap

### Phase 1: Prerender + head layer
- [ ] Task 8: `seo.js` full — `buildSeo`, `languageHref` + tests
- [ ] Task 9: refactor heads group A (home, practice hub, exam)
- [ ] Task 10: refactor heads group B (blog index, blog post)
- [ ] Task 11: refactor heads group C (about, faq, contact, privacy, terms)
- [ ] Task 12: prerender English content pages (blog, static, hub)
- [ ] Task 13: e2e head assertions (title/canonical/hreflang/JSON-LD per page type)

### Checkpoint: Phase 1
- [ ] `npm run check` + build output has prerendered HTML with correct heads
- [ ] Full test suite passes

### Phase 2: Hindi URL space
- [ ] Task 14: Hindi data layer (`streamHi`, `syllabusHi`) + tests
- [ ] Task 15: extract practice body components (hub, exam)
- [ ] Task 16: extract blog + static body components
- [ ] Task 17: extract home landing component
- [ ] Task 18: lang plumbing (`+layout.server.js`, store sync, `hooks.server.js`, `app.html`)
- [ ] Task 19: `/hi` route tree + hreflang pairs + lang-aware links + toggle navigation
- [ ] Task 20: bilingual sitemap + llms entries + `/hi` prerender
- [ ] Task 21: e2e parity + full verification

### Checkpoint: Complete
- [ ] All acceptance criteria met; `npm run smoke` passes
- [ ] Manual check: `/hi` pages render Hindi, toggle navigates, app flow stays Hindi

## Risks and Mitigations
| Risk | Impact | Mitigation |
| Prerender + `$env/dynamic/private` bakes build-time value | Low | Document env requirement; verify meta after build |
| Store sync during SSR leaks across requests | Med | Every route load supplies `lang`; unit test guards helper |
| Component extraction breaks existing pages | High | e2e smoke before/after; refactor in small groups |
| Old service workers keep stale HTML | Low | NetworkFirst + cache TTL; notify in release notes |
| Scope creep into new page types | Med | Out of scope section in spec is binding |

## Open Questions
- None blocking. GSC property work (account side) is a user task documented in `docs/seo-baseline.md`.
- Tasks tracked in `tasks/todo-seo.md` (default, no external tracker).
