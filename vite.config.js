import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
	if (mode === 'production' && !process.env.NODE_ENV) {
		process.env.NODE_ENV = 'production';
	}

	return {
		plugins: [
			sveltekit(),
			VitePWA({
				registerType: 'autoUpdate',
				includeAssets: [
					'icons/*.png',
					'icons/*.ico',
					'ads.txt',
				],
				manifest: false,
				workbox: {
					cleanupOutdatedCaches: true,
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
					globIgnores: ['**/_app/immutable/chunks/**'],
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
							urlPattern: ({ url }) =>
								url.origin === self.location.origin && url.pathname.startsWith('/api/'),
							handler: 'NetworkFirst',
							options: {
								cacheName: 'apis',
								networkTimeoutSeconds: 10,
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
							handler: 'StaleWhileRevalidate',
							options: {
								cacheName: 'pages',
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
