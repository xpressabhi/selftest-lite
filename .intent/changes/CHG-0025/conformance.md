# Conformance record — CHG-0025 Visual explanations inline

> Proposal revision 1, digest `sha256:444b24bf63114ac1accbd2a67d7f53bd6cd4116573d0a5ea4c963c8bb7a4032a`.
> Marking `status: complete` is a front-matter edit; the body digest is unchanged (re-verified with
> `--print-digest`).

## Outcome

Review cards generate and embed the animated visual explainer **inside the card** (no navigation):
`VisualExplainerSection` replaces the old "Explain visually" link, builds through
`POST /api/playground` with `source: { testId, questionIndex }`, and opens an existing explainer
inline from the library cache. Served explainers are recorded in the new
`question_explainer_links` table (identity-scoped, upsert-replace) and restored per test by one
`GET /api/playground/links` read on the results page; playground library items show "From your
test" provenance. One shared Jev judge (`visualFit.js`, `visualFitCache.js`, `visualFitJudge.js`;
fail-open; content-addressed verdicts) gates both the card affordance (`POST /api/visual-fit`,
20/min) and the playground's pre-generation path (200 `VISUAL_NOT_WORTHY` refusal with guidance,
zero generation quota spent). Storage adds `question_visual_fits` and `question_explainer_links`
plus their indexes in `ensureStorageSchema` (SCHEMA_VERSION 15 to 16). The public explainer page
cross-links "Create your own". `/api/explain`, the markdown pipeline, `ArtifactFrame`'s sandbox
contract, and the public page's identity-free contract are untouched.

This matches the design (`docs/superpowers/specs/2026-10-15-visual-explanation-embed-design.md`):
decisions D1-D4 and D6-D10 are implemented as written, the §13 file inventory landed as listed
(the only inventory delta is `tests/e2e/visualFit.js`, added during the process, recorded in
`test_changes`), and the success criteria in §1 are covered by the E2E evidence below. The
deviations are the four plan-owner rulings recorded in "Deviations and decisions".

## Verification

All gates were run on a clean tree at `d55cd63` (the commit before this record). Every pre-existing
test passed unmodified; the only pre-existing tests touched are the 13 entries declared in the
proposal's `test_changes`.

| Command | Result |
| --- | --- |
| `npm run lint` (`eslint .`) | exit 0, no findings |
| `npm run check` (`svelte-kit sync && vite build && node scripts/check-build-mode.mjs`) | exit 0; `check-build-mode: OK — 200 chunks, no DEV-only code, service worker registration present` |
| `npm run test` (`vitest run`) | exit 0; **92 test files passed (92)**, **1136 tests passed (1136)**, 2.67 s |
| `npm run test:e2e` (`playwright test`) | exit 0; **232 passed (1.6m)**, 0 failed; artifact `test-results/e2e-artifact.json` = total 232 / passed 232 / failed 0, stamped `sha d55cd63, dirty false` |
| `npm run verify:vercel` (build + `scripts/verify-vercel.mjs`) | exit 0; `verify-vercel: OK — 238 sitemap URLs, 234 prerendered pages, 234 clean-URL overrides, SSR function present` |
| `sh .intent/scripts/verify-records.sh --base 2bab1bb --head HEAD` | exit 0; `record .intent/changes/CHG-0025` (exactly one record for the range) |
| `sh .intent/scripts/verify-change.sh --change .intent/changes/CHG-0025 --base 2bab1bb` | exit 0; digest matches, records match pinned schemas, changed paths within declared scope, all protected test changes declared |

## Test changes

Confirmed, each matching its declared kind and reason:

- `tests/e2e/playground.e2e.js` (modified): extended for the seeded-verdict refusal (no explainer
  row, no generation quota), the linked serve carrying `source`, and the provenance chip (now
  including the structural pin that the chip is a link sibling of, not inside, the row button);
  the in-flight loading-copy assertion moved from `Planning the explainer…` to the first stage
  `Checking if a visual helps...` because Judging now precedes Planning. No other assertion was
  weakened.
- `src/lib/shared/playgroundLink.test.js` (deleted): removed together with the now-unused
  `src/lib/shared/playgroundLink.js` (commit `d55cd63`); the playground URL-prefill contract stays
  covered by the existing deep-link spec.
- `src/lib/server/schemaMigrations.test.js` (modified): `DDL_FINGERPRINT` updated for the two new
  tables and their indexes, paired with the `SCHEMA_VERSION` 15 to 16 bump in `storage.js`; the
  guard's assertions are unchanged.
- `tests/e2e/cross-device-results.e2e.js`, `tests/e2e/design-consistency.e2e.js`,
  `tests/e2e/exam-engine.e2e.js`, `tests/e2e/nudges.e2e.js`, `tests/e2e/question-formats.e2e.js`,
  `tests/e2e/reminders.e2e.js`, `tests/e2e/results-hero.e2e.js`, `tests/e2e/smoke.e2e.js`,
  `tests/e2e/streak-home.e2e.js`, `tests/e2e/test-stats.e2e.js` (modified): each gained the
  `POST /api/visual-fit` provider stub from the shared `tests/e2e/visualFit.js` helper so no spec
  can reach a real provider when it renders `/results`; assertions and flows unchanged.

New tests (additions, not test changes): `visualFit.test.js`, `visualFitCache.test.js`,
`visualFitJudge.test.js`, `questionExplainerLinks.db.test.js`, `tests/e2e/visual-explanation.e2e.js`.

## Deviations and decisions

1. **Judge metering on `/api/playground` (plan-owner ruling, task 8 fix round).** The design
   doc's literal D5 order (judge before any limiter) left uncached topics spending Jev calls with
   no quota, regressing the pre-change property "no provider spend without passing a quota". A
   dedicated judge bucket `${ROUTE}:judge` (20/min) now runs before `judgeVisualFit`; refusals
   still bypass the 5/min generation quota. Confirmed in `src/routes/api/playground/+server.js`
   and pinned by the 6x-refusal E2E.
2. **Viewport-lazy verdict fetch (plan-owner ruling, task 10).** Wrong/unanswered cards
   auto-expand at load, so the literal "fetch when expanded" would batch-Jev every results view;
   the spec's stated intent ("no batch-Jev on page load") won. User-driven expansion and hash
   targets fetch immediately; auto-expanded cards fetch on first visibility via a one-shot
   `IntersectionObserver`, re-armed across filter churn.
3. **Provenance chip hoisted out of the row button (plan amendment, task 11 fix round).** The
   chip's mandated selector put an anchor inside the row `<button>` (invalid HTML); the chip is
   now a sibling of the button with structural E2E pins (link role present, button-name count 0).
4. **Fail-open test layering (documented in the plan's Global Constraints).** The judge's degraded
   path is pinned by unit tests with a fake client and a client-stub E2E, never by live-provider
   E2E, because the test env's `TYPESAFE_API_KEY` presence is not controllable.
5. **Recorded test changes beyond the original plan list.** `schemaMigrations.test.js` (DDL
   fingerprint), the suite-wide `/api/visual-fit` provider stubs across 10 pre-existing specs via
   `tests/e2e/visualFit.js`, and the `playground.e2e.js` loading-copy assertion update — all listed
   in the proposal's `test_changes`.
6. **Post-deploy verification remains a follow-up (operational).** On staging: one `worth_it`
   build → embed → share; one vague topic → refusal → refinement; then one
   `npm run telemetry:report -- --days=30` read (refusal rate, degraded rate, verdict mix, embed
   usage, cache-hit ratio). Not a code gate and not executed here.

## Approval constraints

Not required. `review_required: false` in the proposal and `review.required: false` in
`.intent/config.yaml`; the change shipped through the repository's autonomous flow with task-level
reviews recorded under `.superpowers/sdd/2026-10-15-visual-explanation-embed/`.
