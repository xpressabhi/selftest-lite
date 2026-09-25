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
			sveltekit(),
			VitePWA({
				registerType: 'autoUpdate',
				includeAssets: ['icons/*.png', 'icons/*.ico', 'ads.txt'],
				manifest: false,
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
					globIgnores: [
						'**/_app/immutable/chunks/**',
						'**/_app/immutable/assets/**',
					],
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
							// Public GET APIs only. Personal or admin data (/api/user,
							// /api/auth, /api/admin, /api/premium, /api/test) is never
							// written to a shared cache, and responses that explicitly
							// opt out with `Cache-Control: no-store` are skipped too.
							urlPattern: ({ url }) =>
								url.origin === self.location.origin &&
								url.pathname.startsWith('/api/') &&
								!/^\/api\/(auth|admin|user|premium)\//.test(url.pathname) &&
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
		},
	};
});
