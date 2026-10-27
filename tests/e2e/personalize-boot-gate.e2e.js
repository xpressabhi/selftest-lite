import { expect, test } from '@playwright/test';

// Home personalization is a model call (TypeSafe/Jev), so it must not fire
// until the page has actually been on screen for a moment. JS-rendering
// crawlers boot the shell, call the boot APIs and die inside a second; they
// were paying for a personalization decision on every crawl. The same request
// must carry the anonymous client id, otherwise bot rows cannot be told apart
// from real visitors at all.
const VISIBLE_DELAY_MS = 2000;

async function stubBackend(page, calls) {
	await page.route(
		(url) => url.pathname === '/api/exam-notifications',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ notifications: [] }),
			})
	);
	await page.route(
		(url) => url.pathname === '/api/user/history',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ attempts: [] }),
			})
	);
	await page.route(
		(url) => url.pathname === '/api/test',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ tests: [], hasMore: false }),
			})
	);
	await page.route(
		(url) => url.pathname === '/api/personalize',
		(route) => {
			calls.push({
				headers: route.request().headers(),
				at: Date.now(),
			});
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ applied: false }),
			});
		}
	);
}

test('home personalization waits for a visible session and sends the client id', async ({
	page,
}, testInfo) => {
	const calls = [];
	await stubBackend(page, calls);

	await page.goto('/');
	await expect(page.locator('.home-wrap')).toBeVisible();

	// A crawler-shaped session: the page is alive but gone in under a second.
	// Nothing has been spent on the model yet.
	await page.waitForTimeout(1000);
	expect(calls).toHaveLength(0);

	// A real session stays visible; the decision is requested once.
	await expect.poll(() => calls.length, { timeout: VISIBLE_DELAY_MS + 4000 }).toBe(1);
	await page.waitForTimeout(500);
	expect(calls).toHaveLength(1);

	const clientId = await page.evaluate(() =>
		window.localStorage.getItem('selftest_client_id')
	);
	expect(clientId).toMatch(/^c-/);
	expect(calls[0].headers['x-client-id']).toBe(clientId);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				visibleDelayMs: VISIBLE_DELAY_MS,
				personalizeCallsAt1s: 0,
				personalizeCallsTotal: calls.length,
				clientIdSent: calls[0].headers['x-client-id'] === clientId,
			},
			null,
			2
		),
	});
});
