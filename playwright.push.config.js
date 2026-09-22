import { defineConfig } from '@playwright/test';
import { PUSH_TEST_KEYS } from './tests/e2e/pushTestKeys.js';

// Opt-in web push end-to-end suite (npm run test:e2e:push).
//
// It runs against the production build/preview because web push needs the real
// Workbox service worker (dev mode does not register one) and a headed Chrome
// (headless Chrome denies notification permission and incognito disables the
// Push API). Delivery goes through the real FCM push service, so network access
// is required and every run creates (then archives) one subscription row.
//
// The keys live in tests/e2e/pushTestKeys.js rather than being generated here:
// Playwright re-evaluates the config in every worker, so generated keys would
// not match the key the preview server was started with.
process.env.E2E_PUSH = '1';

export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: 'reminders.e2e.js',
	timeout: 180_000,
	// A fresh Chrome profile registers with FCM on first subscribe, which can
	// take half a minute on a slow connection.
	expect: { timeout: 60_000 },
	retries: 0,
	workers: 1,
	reporter: [
		['line'],
		['./tests/e2e/artifactReporter.js', { outputFile: 'test-results/push-e2e-artifact.json' }],
	],
	use: {
		baseURL: 'http://localhost:4173',
		channel: 'chrome',
		headless: false,
	},
	webServer: {
		command: 'npm run build && npm run preview -- --port 4173 --strictPort',
		url: 'http://localhost:4173',
		reuseExistingServer: false,
		timeout: 240_000,
		env: { PUBLIC_VAPID_KEY: PUSH_TEST_KEYS.publicKey },
	},
});