import { expect, test } from '@playwright/test';

// QA tagging suite: team QA sessions opened with ?qa=1 are stamped on every
// feature event so weekly analysis can exclude them without heuristics, and an
// untagged visitor never carries the prop.
// Spec: docs/superpowers/specs/2026-10-17-first-visit-onboarding-design.md (D7)

const QA_KEY = 'selftest_qa';

// SvelteKit hydrates after the streamed SSR HTML, so server-rendered controls
// are visible but inert for a moment on a cold dev-server load.
async function waitForHydration(page) {
	await page.waitForFunction(
		() => Boolean(document.querySelector('.intent-input')?.__svelte_meta),
		undefined,
		{ timeout: 15000 }
	);
}

const EMPTY_HISTORY = {
	status: 200,
	contentType: 'application/json',
	body: JSON.stringify({ attempts: [] }),
};

const EMPTY_TESTS = {
	status: 200,
	contentType: 'application/json',
	body: JSON.stringify({ tests: [], hasMore: false }),
};

async function stubBackend(page) {
	await page.route(
		(url) => url.pathname === '/api/user/history',
		(route) => route.fulfill(EMPTY_HISTORY)
	);
	await page.route(
		(url) => url.pathname === '/api/test',
		(route) => route.fulfill(EMPTY_TESTS)
	);
}

async function captureTelemetry(page) {
	const batches = [];
	await page.route('**/api/telemetry', async (route) => {
		try {
			batches.push(JSON.parse(route.request().postData() || '{}'));
		} catch {
			batches.push({});
		}
		await route.fulfill({ status: 204, body: '' });
	});
	return batches;
}

// app.localhost resolves to loopback but is not treated as localhost by the
// telemetry client, so the real queue -> beacon path runs while the route
// above keeps the batch out of the database.
async function flushAndCollectBatches(page, batches) {
	// Wait out the device:profile client-hints race so the batch is never
	// empty on a fast flush.
	await page.waitForTimeout(700);
	await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
	await expect.poll(() => batches.length, { timeout: 5000 }).toBeGreaterThan(0);
	return batches.flatMap((batch) => batch.events || []);
}

test('a ?qa=1 session stamps every event and sticks', async ({ page }, testInfo) => {
	await stubBackend(page);
	const batches = await captureTelemetry(page);

	await page.goto('http://app.localhost:5174/?qa=1');
	await waitForHydration(page);
	const events = await flushAndCollectBatches(page, batches);
	const flag = await page.evaluate((key) => window.localStorage.getItem(key), QA_KEY);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				events: events.map((entry) => ({ event: entry.event, qa: entry.props?.qa })),
				flag,
			},
			null,
			2
		),
	});
	expect(events.length).toBeGreaterThan(0);
	expect(events.every((entry) => entry.props?.qa === true)).toBe(true);
	expect(flag).not.toBeNull();
});

test('an untagged visit never carries the qa prop', async ({ page }, testInfo) => {
	await stubBackend(page);
	const batches = await captureTelemetry(page);

	await page.goto('http://app.localhost:5174/');
	await waitForHydration(page);
	const events = await flushAndCollectBatches(page, batches);
	const flag = await page.evaluate((key) => window.localStorage.getItem(key), QA_KEY);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				events: events.map((entry) => ({ event: entry.event, qa: entry.props?.qa })),
				flag,
			},
			null,
			2
		),
	});
	expect(events.length).toBeGreaterThan(0);
	expect(events.some((entry) => entry.props?.qa !== undefined)).toBe(false);
	expect(flag).toBeNull();
});
