import { defineConfig } from '@playwright/test';
import { testDatabaseUrl } from './tests/e2e/testDb.js';

// E2E smoke suite: a few critical pages against a local dev server, using the
// installed Google Chrome (channel: 'chrome') so no browser download is
// needed. One-time setup is just `npm install`.
//
// The server runs on a dedicated port with TEST_DATABASE_URL (in-memory PGlite
// by default) as DATABASE_URL, and never reuses an already-running dev server:
// that server may be connected to production. See tests/e2e/testDb.js.
const testDatabase = testDatabaseUrl();

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
		baseURL: 'http://localhost:5174',
		channel: 'chrome',
		headless: true,
	},
	webServer: {
		command: 'npm run dev -- --port 5174 --strictPort',
		url: 'http://localhost:5174',
		reuseExistingServer: false,
		timeout: 120000,
		env: { ...process.env, DATABASE_URL: testDatabase },
	},
});
