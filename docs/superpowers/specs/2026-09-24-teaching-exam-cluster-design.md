# Teaching Exam Cluster + Practice Hub Grouping & Search — Design

**Date:** 2026-09-24
**Status:** Approved in design review; implementation follows.
**Scope owner:** practice experience.

## Problem

- The exam registry (`src/lib/data/indianExams.js`) has 81 exams and **zero teacher-recruitment exams**, even though state TETs / Super TET are among the highest-volume searches in the Hindi belt.
- The practice hub is a flat, single-grid list. Adding ~20 exams pushes it past 100 cards with no way to scan, jump, or find an exam.

## Goals

1. Add teacher-recruitment exams with **researched, current patterns** (questions, duration, syllabus) under a new `Teaching` stream.
2. Keep the single registry the source of truth — exam pages, sitemap, llms.txt, related exams, and prerender entries must keep deriving automatically.
3. Make the hub navigable at ~100 exams with light grouping (category sections + anchor-jump chips) and client-side search. No regression to mobile-first, low-end-phone, and no-JS/SEO constraints.

## Non-goals

- Paper-level entries (e.g. `ctet-paper-1`, `ctet-paper-2` as separate exams). One entry per exam, syllabus combines papers/levels, ordered by paper.
- Hub search state in the URL, per-category filter chips (search covers this), exam-card redesign.
- Changes to generation logic, APIs, database, or telemetry.

## Decisions (approved 2026-09-24)

1. **Scope:** teacher exams cluster, including the optional extras (the user asked to implement everything): 21 exams listed below. Exams found discontinued or without a current pattern during research are dropped, not faked.
2. **Pattern accuracy:** each exam's latest pattern is researched from official sources where possible; sources and the research date are recorded in a comment above the exam block. No invented numbers.
3. **Hub:** category sections with headings + anchor-jump chips (no client JS for grouping), plus a client-side search box.
4. **Search:** matches exam name, id words, stream (English + Hindi), syllabus units (English + Hindi), and category search terms; case-insensitive; all whitespace tokens must match (AND). Empty query renders the grouped view.

## Data model — `src/lib/data/indianExams.js`

### New exams (21)

| # | Name | Suggested id | Group | Notes |
|---|------|--------------|-------|-------|
| 1 | CTET | `ctet` | C | Paper I + II combined |
| 2 | KVS PRT/TGT/PGT | `kvs-prt-tgt-pgt` | B/C | — |
| 3 | NVS TGT/PGT | `nvs-tgt-pgt` | B/C | — |
| 4 | DSSSB TGT/PGT | `dsssb-tgt-pgt` | B/C | — |
| 5 | EMRS TGT/PGT | `emrs-tgt-pgt` | B/C | irregular cycle — drop if no current pattern |
| 6 | AWES PRT/TGT/PGT | `awes-prt-tgt-pgt` | B/C | irregular cycle — drop if no current pattern |
| 7 | UPTET | `uptet` | C | Paper I + II combined |
| 8 | UP Super TET | `up-super-tet` | C | flagship for this batch |
| 9 | UP TGT/PGT | `up-tgt-pgt` | B/C | — |
| 10 | REET | `reet` | C | Level 1 + 2 combined |
| 11 | MPTET | `mptet` | C | Paper I + II combined |
| 12 | BTET | `btet` | C | use current Bihar eligibility route if BTET not held |
| 13 | HTET | `htet` | C | Level 1/2/3 combined |
| 14 | PSTET | `pstet` | C | Paper I + II combined |
| 15 | UTET | `utet` | C | Paper I + II combined |
| 16 | CGTET | `cgtet` | C | — |
| 17 | JTET | `jtet` | C | — |
| 18 | WBTET | `wbtet` | C | — |
| 19 | OTET | `otet` | C | — |
| 20 | KTET | `ktet` | C | — |
| 21 | TNTET | `tntet` | C | — |

All entries: `stream: 'Teaching'`, `questionFormat: 'objective'`, bilingual (existing default), `defaultDifficulty: 'intermediate'`, `defaultNumQuestions: 20`, `fullLengthQuestions` + `durationMinutes` from research, `syllabus` from shared templates where possible.

### Syllabus templates and overlays

- Reuse/extend the `SYLLABUS` template object for shared teacher shapes (primary TET set, upper-primary TET set, TGT/PGT set). Exam-specific arrays only where the research demands them.
- New stream `Teaching` → `STREAM_HI['Teaching'] = 'शिक्षण'`.
- Every new syllabus unit gets a `SYLLABUS_HI` entry in the same commit (existing test enforces full coverage and that Hindi differs from English).

### Hub categories

`HUB_CATEGORIES` — ordered, each `{ id, labelKey, searchTerms: [en, hi, ...], streams: [...] }`:

| id | labelKey | streams |
|----|----------|---------|
| `teaching` | `practiceCategoryTeaching` | Teaching |
| `ssc-central` | `practiceCategorySscCentral` | Government Jobs, Clerical, Multi Tasking Staff, Stenography, Selection Posts, EPFO, ESIC, Food Corporation |
| `banking` | `practiceCategoryBanking` | Banking, Insurance |
| `railways` | `practiceCategoryRailways` | Railways |
| `police-defence` | `practiceCategoryPoliceDefence` | Police, Paramilitary, Railway Police, Defence Entrance, Defence & Security |
| `civil-services` | `practiceCategoryCivilServices` | Civil Services, Forest Services, Medical Services |
| `state-govt` | `practiceCategoryStateGovt` | State PSC, State Services, State Group C, State Group D, State Group C/D, UP Group C/D, Revenue, Village Development, Secretariat |
| `entrance` | `practiceCategoryEntrance` | Engineering Entrance, Medical Entrance, Postgraduate Engineering, MBA Entrance, University Entrance, Law Entrance |

Functions (pure, exported):
- `getHubCategory(exam)` — stream lookup.
- `groupExamsByCategory(exams = OBJECTIVE_ONLY_EXAMS)` — returns ordered categories with their exams, omitting empty categories. Test asserts every stream maps to exactly one category and the grouping partitions the registry (no exam lost or duplicated).

### Search

- `buildExamHaystack(exam)` — lowercase joined string of: name, id words, stream, `STREAM_HI[stream]`, syllabus units, Hindi syllabus units, and the category's `searchTerms`.
- `searchExams(query, exams = OBJECTIVE_ONLY_EXAMS)` — trims/lowercases, returns `[]` for an empty query, otherwise exams whose haystack contains every whitespace-separated token.

## UI — `src/lib/client/pages/PracticeHubPage.svelte`

Structure:

```
hero (unchanged copy)
search field  (label + input + clear button; results count when searching)
if searching:
    empty state  OR  flat results grid
else:
    jump chips (anchors to #practice-cat-<id>)
    recommended pin (Jev promote, own section above categories)
    categories: <section id="practice-cat-…"> h2 + grid, promoted exam excluded from its grid
```

Behavior:
- Search input is client-side state only; the server-rendered, query-free page contains all cards (crawler and no-JS safe).
- While searching: chips, headings, and the pin are hidden; a flat `.practice-grid` lists results; `aria-live="polite"` results count; empty query restores the grouped view.
- Chips and cards keep ≥44 px tap targets. Sections get `scroll-margin-top` so anchors clear the sticky header.
- Card markup and classes stay (`.practice-card` etc.) so existing styles/tests keep working; the desktop "first card spans" rule is dropped for uniform sections.
- Jev personalize behavior stays fail-open; the promoted exam renders in the pin and is excluded from its category grid.

## i18n — both `english.json` and `hindi.json`

Keys: `practiceSearchLabel`, `practiceSearchPlaceholder`, `practiceSearchClear`, `practiceSearchResults`, `practiceSearchEmptyTitle`, `practiceSearchEmptyHint`, `practiceJumpLabel`, `practiceRecommendedTitle`, and the eight `practiceCategory*` labels.

## Tests

- **vitest (pure functions):** category partition + stream coverage; haystack/search matching (name, stream, syllabus, Hindi script, multi-token AND, empty query); Hindi overlay coverage (existing test, extended by data).
- **vitest (derived):** sitemap, llms, route loads auto-cover the new exams; no test edits expected beyond any count-based expectations.
- **e2e:** update `tests/e2e/smoke.e2e.js` selector that assumes a single `.practice-grid`; new `tests/e2e/practice-hub.e2e.js` covering section headings, chips/anchors, search filter + clear, empty state, and a teacher exam page (`/practice/up-super-tet` + `/hi/practice/up-super-tet`) showing pattern and syllabus.
- E2E artifact (`test-results/e2e-artifact.json`) comes free via the existing reporter.

## Verification

`npm run lint` → `npm run test` → `npm run check` → `npm run test:e2e` → `npm run verify:vercel` (SEO data touched). Optional: `npm run eval:content` spot-check for `up-super-tet` to confirm the syllabus produces on-topic questions.

## Risks

- **Pattern drift:** boards change patterns yearly. Mitigation: one file, research-date comment, no derived hard-coded copies.
- **Irregular exams (AWES/EMRS, BTET):** drop rather than invent data.
- **Hub regression:** existing taste-pass + smoke e2e cover page-level hygiene; the new e2e covers the new structure.

## Implementation slices (incremental)

1. Data layer: categories, grouping, search functions + vitest (test-first for the pure functions).
2. Hub UI + locales + e2e updates (teacher pages still absent; smoke stays green).
3. Teaching exam data + Hindi overlays (after background research lands) + teacher-page e2e.
4. Full verification pass (`verify:vercel`, optional content eval) and final commits.
