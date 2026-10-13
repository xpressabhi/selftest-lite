## scope.included

- package.json / package-lock.json: every dependency at its latest release; @sveltejs/vite-plugin-svelte@^7.3.1 added; a scoped npm overrides entry reconciles @vercel/analytics' stale Kit peer range.
- SvelteKit 3 migration: svelte.config.js removed (options moved into vite.config.js); $lib ->
- Vercel Analytics: app-owned injectAnalytics wrapper replacing the Kit-3-incompatible upstream SvelteKit entry.
- vite-plugin-pwa: explicit client outDir (.svelte-kit/output/client) so the generated sw.js lands in the deployment.
- Documentation facts updated to SvelteKit 3 / $app/env/private in README.md, AGENTS.md, docs/architecture.md and .intent/PROJECT.md.

## scope.excluded

- Application features, UI, SEO logic, locale content and telemetry behavior.
- Opt-in push suite (npm run test:e2e:push; headed Chrome + FCM + real DB row).
- Formatter-only churn outside touched code and docs (reverted).

## preserved

- All pre-existing unit and E2E tests pass; the single adminAuth.test.js adaptation preserves the same eleven cases and assertions.
- Public routes, API contract, content-generation pipeline, PWA caching behavior and analytics pageview semantics are unchanged.

## decisions

- Use the official sv migrate sveltekit-3 migration plus targeted fixes instead of hand-editing 147 import sites.
- Keep the app-owned analytics wrapper and the npm overrides entry temporarily until @vercel/analytics ships Kit 3 support.
- Keep Kit's default client output directory for the PWA plugin rather than changing the application output layout.
- Empty-string env fallback reviewed safe: every consumer treats a falsy value as not configured.

