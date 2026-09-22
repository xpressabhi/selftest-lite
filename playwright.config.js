import { defineConfig } from '@playwright/test';

// E2E smoke suite: a few critical pages against a local dev server, using the
// installed Google Chrome (channel: 'chrome') so no browser download is
// needed. One-time setup is just `npm install`.
export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: '*.e2e.js',
	// Web push needs a production build, a headed Chrome and FCM access; it
	// runs from its own opt-in config (npm run test:e2e:push).
	testIgnore: 'reminders.e2e.js',
	timeout: 30000,
	retries: 0,
	reporter: [
		['line'],
		['./tests/e2e/artifactReporter.js', { outputFile: 'test-results/e2e-artifact.json' }],
	],
	use: {
		baseURL: 'http://localhost:5173',
		channel: 'chrome',
		headless: true,
	},
	webServer: {
		command: 'npm run dev',
		url: 'http://localhost:5173',
		reuseExistingServer: true,
		timeout: 120000,
	},
});
