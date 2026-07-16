import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
	plugins: [
		sveltekit(),
		VitePWA({
			registerType: 'autoUpdate',
			includeAssets: ['icons/152.png', 'icons/192.png', 'icons/512.png', 'ads.txt'],
			manifest: false,
			workbox: {
				cleanupOutdatedCaches: true,
				navigateFallback: '/',
				// Route and renderer chunks cache at runtime after their first use.
				// This keeps the install-time cache small on slow networks without removing
				// offline availability for pages and renderers the user has opened.
				globIgnores: ['**/_app/immutable/chunks/**'],
				runtimeCaching: [
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
							!url.pathname.startsWith('/_vercel/'),
						handler: 'NetworkFirst',
						options: {
							cacheName: 'pages',
							networkTimeoutSeconds: 10,
							expiration: {
								maxEntries: 32,
								maxAgeSeconds: 60 * 60 * 24,
							},
						},
					},
					{
						urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
						handler: 'StaleWhileRevalidate',
						options: {
							cacheName: 'static-image-assets',
							expiration: {
								maxEntries: 64,
								maxAgeSeconds: 60 * 60 * 24,
							},
						},
					},
				],
			},
		}),
	],
});
