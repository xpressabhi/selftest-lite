# Change intent

## Request and outcome

Full-exam papers must actually carry a marking scheme, so the marks view works. Today no paper in
production has ever had one: `marks > 0` on **0 of 725 attempts**, and **0 of 1680 papers** carry a
`sections` array — including all 23 full-exam papers. The marks row is hidden by
`{#if … questionPaper.totalMarks}` in `results/+page.svelte`, so the feature is invisible rather
than wrong.

Three changes, because the root cause turned out to have two independent links:

- **B** — a full-exam generation with no cached pattern now discovers one instead of shipping a
  paper with no scheme.
- **A** — a daily warm-up keeps the pattern cache populated for the exams users actually generate
  for, so the discovery in B normally costs nothing.
- **C** — a reused full-exam paper without a scheme is rejected, the same way a structurally
  defective one already is, but only when a pattern is available to fix it.

## Context

The chain, established from production data and the code:

1. `generate/+server.js` resolved the pattern with `discover: Boolean(normalizedSectionFocus)`, so a
   standard full-exam request never discovered one, and only 2 patterns existed (`ssc-cgl`,
   `ibps-po`) for the **14** exam_ids in use.
2. The one paper whose exam had a pattern (id 1204, `ssc-cgl`) was created **2026-07-22** while its
   pattern was fetched **2026-09-24** — no paper has ever been generated with a pattern in hand.
3. With no pattern, `assignSectionsToPaper(questions, null, { section: null })` returns
   `sections: []`, and the `...(assignment.sections.length > 0 ? { sections } : {})` spread omits
   the field.
4. At submit time `computeAttemptMarks({ …, sections: [] })` returns `null` by design, so
   `marks`/`total_marks` are stored NULL/0.
5. Discovered while verifying: full-exam papers are **shared**. `findReusableFullExamRecord` returns
   the newest paper for an exam+language, so one sectionless paper is served to many users (there are
   only 23 papers across 14 exam_ids because they are reused, not regenerated). Fixing generation
   alone would leave every existing shared paper unmarked for as long as it keeps being reused.

Measured costs that shaped the design: a pattern is valid **45 days** and discovery costs
**~0.4-1.7 s** of model time (cache hits are 8-15 ms; `/api/exam:pattern` all-time n=123, p50 149 ms,
max 17.5 s), against generations of 8-30 s.

## Scope

### Included

- `src/routes/api/generate/+server.js`: `discover: true` for full-exam pattern resolution, with the
  reason recorded in the comment; and a `missing-marking-scheme` reuse rejection conditioned on a
  pattern being available.
- `src/lib/server/examPatternWarmup.js` (new): pure planning — which exams to warm, and which of them
  genuinely need a model call.
- `src/lib/server/examPatternWarmup.test.js` (new): 17 tests, written before the module.
- `scripts/warm-exam-patterns.mjs` (new): the warm-up itself, aimed at the app's existing on-demand
  `/api/exam/pattern` endpoint.
- `.github/workflows/exam-patterns.yml` (new): daily warm-up at 02:45 UTC, with `dry-run`, `all` and
  `limit` dispatch inputs.
- `package.json`: `exams:patterns`.

### Excluded

- **Backfilling `sections` onto the 23 existing papers.** The reuse rejection makes that unnecessary:
  the first request per exam regenerates one markable paper, which is then reused. A backfill would
  need `assignSectionsToPaper` moved out of the `$env`-importing module (a plain `node` script cannot
  load it) plus a production data write, for the same end state.
- **Marking historical attempts.** No scheme was stored and today's pattern may not be the one that
  applied; 23 attempts stay unmarked.
- Removing the conditional from C so sectionless papers are always rejected. That would regenerate an
  identical sectionless paper on every request for any exam without a cached pattern.
- Any change to the marks computation, the attempt schema, or the UI.

## Preserved behavior

- The pattern endpoint, the discovery prompt, `getExamPattern`, `computeAttemptMarks` and
  `assignSectionsToPaper` are untouched. The warm-up calls the deployed endpoint over HTTP rather
  than importing server modules, so the discovery prompt exists in exactly one place.
- A fresh pattern still costs nothing: `discover: true` only matters on a cache miss, and
  `getExamPattern` serves a cached row without a model call.
- Quiz-practice papers keep `marks` null and the marks row stays hidden, which is correct.
- Reuse behavior is otherwise unchanged; a paper is only rejected when a pattern can actually supply
  the missing scheme.

## Test changes

None. No pre-existing test was modified, skipped or deleted. Two new files are additions
(`examPatternWarmup.test.js`, 17 tests). The E2E suite passes unmodified (176).

## Decisions and constraints

- **The warm-up goes through HTTP, not the database.** `examPattern.js` statically imports
  `$env/dynamic/private`, which a bare `node` process cannot resolve, so a script cannot reuse
  `refreshPattern`. Rather than duplicate the discovery prompt (or move it somewhere the app no
  longer owns), the script drives the endpoint that already exists and is already public.
- **The key format is duplicated on purpose, and tested against the original.**
  `patternKeyForExamId` restates `exam:${slugify(id)}` because the script cannot import the original;
  `examPatternWarmup.test.js` asserts the two agree across uppercase, spaced, punctuated, long and
  unicode ids. If the format ever drifts, the suite fails instead of the job silently re-warming
  patterns that are already cached.
- **Warming is demand-driven by default.** The exam ids come from `ai_test` (full-exam papers), so the
  job spends model calls where users actually are; `--all` (101 registered exams) and `--limit`
  (default 25) are explicit opt-ins. A fresh pattern is skipped before any HTTP call, so a daily run
  normally does nothing.
- **Pacing is deliberate**: the endpoint allows 10/min per client key, so the script waits
  `window / limit` between calls instead of collecting 429s.
- **The reuse rejection is conditional.** `examPattern &&` is load-bearing: without a pattern no paper
  can carry a scheme, so an unconditional rejection would loop regeneration forever.

## Verification

- `npm run lint`, `npm run test` (940 tests / 76 files, up from 923 / 75), `npm run check`
  (`check-build-mode: OK`), `npm run test:e2e` (176 passed) — all on the final tree.
- `npm run exams:patterns -- --url=… --dry-run` planned 14 targets correctly with zero model calls.
- The warm-up was then run for real: **13 discovered, 1 already fresh, 0 failed**, leaving all 14
  demanded exams with a cached 34-200 question pattern.
- Post-warm-up probe of the *deployed* app: a full-exam request for `ssc-cgl` returned the existing
  shared paper in 409 ms, which is what exposed the reuse link (C). Its attempt stored `marks 0/0`,
  as expected for a sectionless paper.
- **Not yet verified end to end**: "a fresh full-exam paper carries `sections` and stores
  `marks > 0`" requires B and C to be deployed. Expected after deploy: the same request regenerates a
  markable paper, and a submission on it stores marks on the pattern's scheme (2 marks per correct,
  -0.5 per wrong for `ssc-cgl`).
