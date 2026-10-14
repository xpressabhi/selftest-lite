# Conformance — CHG-0020 Concept playground

Outcome: `/playground` (en + `/hi` twin) generates animated, self-contained HTML explainers for
any concept through a two-step brief → artifact pipeline behind `POST /api/playground`; artifacts
render only inside `srcdoc` + `sandbox="allow-scripts"` with a `default-src 'none'` CSP; static
validation + one repair retry is the quality gate; results are cached cross-user in
`concept_explainers` (cache-first before the rate limiter, 5/min generation budget); review cards
deep-link into the playground; generation is tailored to coarse device buckets; and
`npm run eval:artifact` measures validity, animation, external requests and sizes as the model
decision gate. The markdown explanation pipeline is untouched.

## Deviations from the plan/spec (with reasons)

1. `src/lib/server/explainerPipeline.js` was split from the route so `scripts/eval-artifact.mjs`
   can drive the production pipeline under plain `node` (no `$app/env`, no storage imports).
2. The eval script is `scripts/eval-artifact.mjs` (kebab-case, matching `scripts/`), and fixtures
   live in `scripts/eval-artifact-concepts.json`.
3. Spec locale key `playgroundRetry` was not added; the page reuses the existing `tryAgain` key.
4. New dependency: `parse5` (used by `artifactValidation.js` for structural checks).
5. The new `concept_explainers` DDL required the repository's schema guard workflow:
   `SCHEMA_VERSION` 12 → 13 plus the recorded `DDL_FINGERPRINT` update in
   `src/lib/server/schemaMigrations.test.js` (declared in `test_changes`).
6. Provider seam (operator-requested): `EXPLAINER_PROVIDER=opencode` routes both pipeline calls
   through the OpenAI-compatible gateway (`OPENCODE_BASE_URL`, Bearer `OPENCODE_API_KEY`,
   `x-opencode-session` + identifying user agent per the Go client guidance). Default remains
   Gemini. Gateway calls use larger output budgets because reasoning tokens share the completion
   budget.
7. Device-aware generation (operator-requested responsiveness): coarse buckets
   (`viewport phone|wide`, `budget lite|full`) derived in the browser from width, save-data,
   effective connection type, cores/memory and reduced motion; buckets shape both prompts, are
   part of the cache key (now `pg-v2`), and the lite budget enforces an 80 KB composed-document
   cap. Scaffold CSS gained responsive guards (`max-width`, scrollable tables, no horizontal
   overflow) and `ArtifactFrame` re-clamps its height on resize/rotation. Scaffold version bumped
   to `scaffold-v2` and the pinned cache-key literals updated in unit + E2E suites.

## Decisions (evidence)

- **`ARTIFACT_MODEL` stays `gemini-flash-lite-latest`.** Final eval run: 8/8 valid, 8/8 animated,
  0 external requests, 0 over budget, strict gates passed (an earlier run was 7/8 with one
  model-authored JS `ReferenceError`, i.e. nondeterministic sloppiness, not a systemic failure).
- **`gemini-flash-latest` (→ `gemini-3.8-flash`) is unusable on this Google plan**: free-tier
  quota (5 requests/min/model) returned 429/503 for every concept.
- **The OpenCode gateway is not a validated artifact generator (yet)**: its brief call works
  (≈11 s, valid JSON), but on the artifact prompt `deepseek-v4.1-flash` burns the entire
  completion budget on reasoning (`finish_reason: length`, 0 content at 8192; >100 s at 16384;
  identical without `response_format`), and `glm-5.3-flash`, `kimi-k2.7-code` and
  `mimo-v2.6-flash` each exceeded a 90 s single-call ceiling. The seam stays shipped and
  selectable for later re-evaluation.
- Cache key excludes `theme` (cosmetic, applied at compose time) and includes device buckets;
  composed documents are produced at serve time so stored rows stay theme-agnostic.

## Verification

- `npm run lint`, `npm run check` — clean (194 chunks, build-mode OK).
- `npm run test` — 1087/1087 across 86 files (new: playgroundProfile, artifactValidation,
  artifactScaffold, artifactPrompt, artifactSchema, explainerCache key, playgroundLink).
- `npm run test:e2e` — full suite green on every commit (hook-enforced); the playground file
  passes 5/5: seeded-cache model-free proof, stubbed UI flow with height fallbacks, sandbox
  boundary against a seeded hostile document, phone-viewport overflow check, request bounds.
- `npm run verify:vercel` — OK (sitemap includes `/playground` + `/hi/playground`, 238 URLs).
- `npm run eval:artifact -- --strict` (Gemini lite) — strict gates passed; report and
  screenshots under `test-results/artifact-eval/` (plus preserved
  `report-gemini-flash-latest-quota.json` and `report-opencode-403.json` evidence).

## Follow-ups (post-deploy)

- Read `telemetry:report --days=30` after the first real week: `/api/playground` error codes,
  `ARTIFACT_INVALID` rate, cache `use_count` growth, `playground:*` client events.
- Human-review the eval screenshots once; re-try gateway models when a lighter-reasoning
  candidate appears (the seam already supports it).
