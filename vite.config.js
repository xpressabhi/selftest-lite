import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command }) => {
	// A production bundle must not inherit NODE_ENV=development from the
	// environment (a hosting dashboard variable, a wrapper script, ...): Vite
	// derives import.meta.env.DEV/PROD from it, so a dev compile keeps DEV-only
	// code and strips every `import.meta.env.PROD` block — including the /sw.js
	// registration in +layout.svelte — and the deployed app never gets a
	// service worker. Setting NODE_ENV here is Vite's supported override point
	// and runs before DEV/PROD are resolved; scripts/check-build-mode.mjs fails
	// the build if a dev-mode bundle ever slips through again.
	if (command === 'build') {
		process.env.NODE_ENV = 'production';
	}

	return {
		plugins: [
			sveltekit({
				adapter: adapter({ runtime: 'nodejs22.x' }),
				// Inline stylesheet chunks into the SSR HTML. Saves a network round trip
				// on slow connections (FCP win) at the cost of a larger document; the
				// document is cached by the service worker on repeat visits.
				inlineStyleThreshold: 100000,
			}),
			VitePWA({
				registerType: 'autoUpdate',
				includeAssets: ['icons/*.png', 'icons/*.ico', 'ads.txt'],
				manifest: false,
				// SvelteKit 3 builds the client bundle into the Vite `client`
				// environment; the plugin's default (root `build.outDir` → `dist`)
				// points at a directory nothing is written to. This must match
				// kit's client output or sw.js is never copied into the deployment.
				outDir: '.svelte-kit/output/client',
				workbox: {
					cleanupOutdatedCaches: true,
					// Custom push notification handlers; loaded into the generated
					// Workbox service worker as-is.
					importScripts: ['push-handler.js'],
					// No navigateFallback (explicitly null — the plugin's default
					// 'index.html' also isn't precached): this app is server-rendered,
					// so neither '/' nor 'index.html' exists as a static file.
					// workbox's createHandlerBoundToURL(<fallback>) then throws
					// "non-precached-url" during SW evaluation, which aborts every
					// registerRoute after it and silently kills ALL runtime caching.
					// Offline support comes from the runtime caches below (immutable
					// assets + previously visited pages).
					navigateFallback: null,
					// Route and renderer chunks cache at runtime after their first use.
					// This keeps the install-time cache small on slow networks without removing
					// offline availability for pages and renderers the user has opened.
					globIgnores: ['**/_app/immutable/chunks/**', '**/_app/immutable/assets/**'],
					runtimeCaching: [
						{
							// Hashed, immutable build assets (JS/CSS chunks, entry files):
							// the hash IS the version, so they never change for a given URL.
							// CacheFirst makes repeat visits (and offline mode) instant on
							// slow connections instead of waiting on a network round trip.
							urlPattern: ({ url }) =>
								url.origin === self.location.origin &&
								url.pathname.startsWith('/_app/immutable/'),
							handler: 'CacheFirst',
							options: {
								cacheName: 'immutable-assets',
								expiration: {
									maxEntries: 128,
									maxAgeSeconds: 30 * 24 * 60 * 60,
								},
							},
						},
						{
							// Public, shareable GET APIs only. Personal or admin data
							// (/api/user, /api/auth, /api/admin, /api/premium, /api/test,
							// /api/playground) is never written to a shared cache — the
							// explainer library is per-identity and a cached list went
							// stale on phones. Responses that explicitly opt out with
							// `Cache-Control: no-store` are skipped too.
							urlPattern: ({ url }) =>
								url.origin === self.location.origin &&
								url.pathname.startsWith('/api/') &&
								!/^\/api\/(auth|admin|user|premium|playground)\//.test(url.pathname) &&
								url.pathname !== '/api/test',
							handler: 'NetworkFirst',
							options: {
								cacheName: 'apis',
								networkTimeoutSeconds: 10,
								plugins: [
									{
										cacheWillUpdate: async ({ response }) =>
											response.headers
												.get('Cache-Control')
												?.includes('no-store')
												? null
												: response,
									},
								],
								expiration: {
									maxEntries: 16,
									maxAgeSeconds: 60 * 60 * 24,
								},
							},
						},
						{
							urlPattern: ({ url }) =>
								url.origin === self.location.origin &&
								!url.pathname.startsWith('/api/') &&
								!url.pathname.startsWith('/_app/immutable/') &&
								!url.pathname.startsWith('/_vercel/'),
							// Network-first: landing pages must not be served stale
							// after a deploy. Falls back to cache so offline still works.
							handler: 'NetworkFirst',
							options: {
								cacheName: 'pages',
								networkTimeoutSeconds: 3,
								expiration: {
									maxEntries: 32,
									maxAgeSeconds: 60 * 60 * 24,
								},
							},
						},
						{
							urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
							handler: 'CacheFirst',
							options: {
								cacheName: 'static-image-assets',
								expiration: {
									maxEntries: 64,
									maxAgeSeconds: 30 * 24 * 60 * 60,
								},
							},
						},
					],
				},
			}),
		],
		build: {
			sourcemap: false,
			// The CSS floor is deliberately lower than the JS baseline
			// ('baseline-widely-available' = Chrome/Edge 111, Firefox 114,
			// Safari 16.4). The minifier (lightningcss) removes an earlier
			// declaration when a later one is provably valid for *its*
			// targets, which silently deleted every `vh` fallback in front of
			// a `dvh` value (and would delete future color-space fallbacks).
			// These targets keep the double declarations alive, let the
			// minifier lower computable color-mix()/oklch() automatically,
			// and match the fallback work in src/lib/styles/globals.css for
			// pre-oklch browsers (e.g. Chrome 109 on Windows 7/8.1).
			cssTarget: ['chrome107', 'edge107', 'firefox104', 'safari16', 'ios16'],
		},
	};
});
