# Conformance record

> Complete at `conformance_review`. Keep it factual and short; scale detail to the change.

## Outcome

Every dependency in `package.json` is at its latest release (`npm outdated` empty), with
SvelteKit 3.0.1, `@sveltejs/adapter-vercel` 7.0.0, `@sveltejs/vite-plugin-svelte` 7.3.1,
Vite 8.3.4, Svelte 5.57.2, Vitest 5.0.4, Mermaid 12.1.0, vite-plugin-pwa 2.0.0 and KaTeX
0.19.0 in place. The app lints, builds, runs its unit and E2E suites, and validates as a
Vercel deployment.

Change `CHG-0017` revision 1, proposal digest
`sha256:a0ddef5c404405b9d823863f5e362f9018eb1cd1306986cd809a7fe9f6517428`.

## Verification

| Command              | Result                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `npm outdated`       | empty — every package at latest                                                                    |
| `npm run lint`       | pass (no findings)                                                                                 |
| `npm run test`       | **992 passed / 79 files**                                                                          |
| `npm run check`      | build OK; `check-build-mode: OK — 198 chunks, no DEV-only code, service worker registration present` |
| `npm run test:e2e`   | **196 passed (~1.7 min)** — run on the final tree after the diff cleanup                           |
| `npm run verify:vercel` | `OK — 236 sitemap URLs, 232 prerendered pages, 232 clean-URL overrides, SSR function present`    |

PWA evidence: 47 precache entries (238.95 KiB); `sw.js` generated into
`.svelte-kit/output/client/sw.js` and copied into the deployment by adapter-vercel.

## Test changes

- `src/lib/server/adminAuth.test.js` — modified as declared in the proposal. All eleven cases
  pass with the same assertions; password rotation is verified across two module instances.
  No other test file was modified, skipped or deleted.

## Deviations and decisions

- **AdminAuth test adaptation (declared):** Kit 3 resolves environment variables per build, so
  runtime env mutation was replaced with per-test module loading and mocking of
  `$app/env/private`.
- **PWA output fix:** `vite-plugin-pwa@2` read Vite's root `build.outDir` (default `dist`),
  while Kit 3 writes the client bundle into the `client` Vite environment; the plugin now
  receives `outDir: '.svelte-kit/output/client'` explicitly. Without this, `sw.js` was
  generated outside the deployment (observed and fixed during validation).
- **Vercel Analytics:** `@vercel/analytics@2.0.1` (latest) still imports the removed
  `$app/stores`, so the app-owned wrapper in `src/lib/client/vercelAnalytics.svelte.js`
  replaces the `@vercel/analytics/sveltekit` helper; the npm `overrides` entry is temporary
  until upstream ships Kit 3 support.
- **`PASSKEY_RP_ID` / `PASSKEY_ALLOWED_ORIGINS`:** accessed dynamically (`envValues?.…`), so
  the codemod could not see them; they were added to `src/env.js` and the four passkey routes
  now read them via `$app/env/private`.
- **Benign warnings kept as-is:** Kit's `transform_index_html_unsupported` note for the PWA
  plugin (the app registers `/sw.js` manually), the chunk-size advisory, and adapter notes
  about optional `ws` dependencies.
- **Formatter-only churn reverted:** the migration's `npm run format` pass touched tests,
  scripts, workflows and `.intent` history without functional need; those files were restored
  to keep the diff reviewable.
- `MIGRATION_TASKS.md` produced by the migration tool was resolved item-by-item (all items
  reviewed; `json`/`text` helpers migrated, navigation options verified, 204 consumer checked)
  and deleted.

## Approval constraints

Not required. `.intent/config.yaml` has `review.required: false`; the operator selected the
"everything, including majors" scope before implementation.
