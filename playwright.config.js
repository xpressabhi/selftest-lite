import { defineConfig } from '@playwright/test';

// E2E smoke suite: a few critical pages against a local dev server, using the
// installed Google Chrome (channel: 'chrome') so no browser download is
// needed. One-time setup is just `npm install`.
export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: '*.e2e.js',
	timeout: 30000,
	retries: 0,
	reporter: 'line',
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
