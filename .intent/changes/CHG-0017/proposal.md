---
protocol_version: "2.0"
id: "CHG-0017"
title: "Update all dependencies to latest, including the SvelteKit 3 major migration"
status: "complete"
created_at: "2026-10-13T04:45:31Z"
request: "Update all dependencies in package.json to their latest versions and validate the application afterwards."
proposal:
  revision: 1
  digest: "sha256:a0ddef5c404405b9d823863f5e362f9018eb1cd1306986cd809a7fe9f6517428"
scope:
  paths:
    - ".intent/changes/CHG-0017/**"
    - ".intent/PROJECT.md"
    - "AGENTS.md"
    - "README.md"
    - "docs/architecture.md"
    - "package.json"
    - "package-lock.json"
    - "svelte.config.js"
    - "vite.config.js"
    - "src/**"
test_changes:
  - path: "src/lib/server/adminAuth.test.js"
    kind: "modified"
    reason: "Kit 3 resolves $app/env/private per build, so the old vi.mock('$env/dynamic/private') runtime mutation no longer reaches the module. The same eleven cases assert the same behavior; the file now loads the module per test with mocked $app/env/private values and verifies password rotation across two module instances."
links:
  related: []
  supersedes: []
  decisions: []
review_required: false
---
# Change intent

## Request and outcome

"Update all dependencies in package json and then validate." (operator)

Every dependency in `package.json` is updated to its latest release — including the majors
the operator explicitly confirmed: SvelteKit 2.70 → 3.0.1, `@sveltejs/adapter-vercel` 6 → 7,
Vitest 4 → 5, Mermaid 11 → 12, vite-plugin-pwa 1 → 2, KaTeX 0.18 → 0.19 and
`@chenglou/pretext` 0.0.8 → 0.0.9. The SvelteKit 3 upgrade runs through the official
`sv migrate sveltekit-3` migration; the remaining incompatibilities (Vercel Analytics, the
PWA output directory, environment variables, the deprecated `json()` helper) are resolved in
the repository. The change is validated with the repository's full pipeline: `npm outdated`
(empty), `npm run lint`, `npm run test`, `npm run check`, `npm run test:e2e` and
`npm run verify:vercel`.

## Context

- Kit 3 removes `$app/stores`, moves project configuration out of `svelte.config.js` into the
  `sveltekit()` Vite plugin, replaces the `$lib` alias with `#lib` subpath imports
  (`package.json#imports`), and resolves environment variables per build from `src/env.js`
  (`defineEnvVars`) instead of `$env/dynamic/private`.
- `vite-plugin-pwa@2` reads Vite's root `build.outDir`; Kit 3 keeps root `build.outDir` unset
  and writes the client bundle into the `client` Vite environment, so the plugin needs an
  explicit `outDir` or `sw.js` misses the deployment.
- `@vercel/analytics@2.0.1` is the latest release and its SvelteKit entry still imports the
  removed `$app/stores`; its declared peer range is `@sveltejs/kit ^1 || ^2`.
- `.intent/config.yaml` protects test paths; the single test adaptation this change needs is
  declared under "Test changes".

## Scope

### Included

- `package.json` / `package-lock.json`: every dependency at its latest release, plus
  `@sveltejs/vite-plugin-svelte@^7.3.1` (now required by Kit 3); a scoped npm `overrides`
  entry reconciles `@vercel/analytics`' stale Kit peer range.
- SvelteKit 3 migration: `svelte.config.js` removed (options moved into `vite.config.js`),
  `$lib` → `#lib` imports with explicit `.js` extensions, `$app/env` migration,
  `goto({ shallow, replace })` for the FAQ anchor update, `Response.json()` in place of the
  deprecated `json()` helper, `src/env.js` completed with the dynamically-read `PASSKEY_*`
  variables.
- Vercel Analytics: local `injectAnalytics` wrapper (`src/lib/client/vercelAnalytics.svelte.js`)
  built on the framework-agnostic `inject` entry, `$app/env` and `$app/state`, replacing the
  Kit-3-incompatible upstream SvelteKit helper.
- vite-plugin-pwa: explicit client `outDir` so the generated `sw.js` lands in the deployment.
- Documentation facts updated: `README.md`, `AGENTS.md`, `docs/architecture.md` and
  `.intent/PROJECT.md` now say SvelteKit 3 and `$app/env/private`.

### Excluded

- Application features, UI, SEO logic, locale content and telemetry behavior — unchanged.
- The opt-in push suite (`npm run test:e2e:push`, headed Chrome + FCM + real DB row).
- Formatting churn introduced by the migration's `npm run format` pass outside the touched
  code and docs (tests, scripts, workflows, `.intent` history) was reverted.

## Preserved behavior

- All pre-existing unit and E2E tests pass, with the single declared adaptation below.
- Public routes, API contract, the content-generation pipeline, PWA caching behavior and
  analytics pageview semantics are unchanged.

## Test changes

- `src/lib/server/adminAuth.test.js` — **modified**. Kit 3 resolves `$app/env/private` per
  build, so the old `vi.mock('$env/dynamic/private')` runtime mutation no longer reaches the
  module. The same eleven cases assert the same behavior; the file now loads the module per
  test with mocked `$app/env/private` values and verifies password rotation across two module
  instances. No case was removed, skipped or weakened.

## Decisions and constraints

- Use the official migration tool plus targeted fixes rather than hand-editing 147 import
  sites.
- Keep the app-owned analytics wrapper (a drop-in for the upstream helper) until
  `@vercel/analytics` ships Kit 3 support; the `overrides` entry is likewise temporary.
- Keep Kit's default client output directory (`.svelte-kit/output/client`) for the PWA plugin
  rather than changing the application output layout.
- The `?? ''` environment fallback was reviewed safe: every consumer treats a falsy value as
  "not configured", matching the previous `undefined` from `$env/dynamic/private`.
- `MIGRATION_TASKS.md` produced by the migration tool was resolved item-by-item and deleted.

## Verification

- `npm outdated` — empty (every package at latest).
- `npm run lint`, `npm run test` (992 tests / 79 files), `npm run check` (build +
  `check-build-mode`), `npm run test:e2e` (196 tests) and `npm run verify:vercel` — all green.
  Results recorded in `conformance.md`.
