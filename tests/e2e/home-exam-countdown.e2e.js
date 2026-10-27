import { expect, test } from '@playwright/test';

// The home countdown reads the same feed the bell fetches (session cache +
// the fetch event), so it must appear without a second request and disappear
// when the feed has no dated exam.
function isoInDays(days) {
	return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function stubBackend(page, notifications) {
	await page.route(
		(url) => url.pathname === '/api/exam-notifications',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ notifications }),
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
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({}),
			})
	);
}

test('home shows the nearest dated exam from the notification feed', async ({ page }, testInfo) => {
	await stubBackend(page, [
		{
			id: 'countdown-probe',
			title: 'SSC CGL 2026 notification',
			org: 'Staff Selection Commission',
			examId: 'ssc-cgl',
			examDate: isoInDays(30),
			publishedAt: isoInDays(-2),
			status: 'open',
			sourceId: 'probe',
			notificationUrl: 'https://ssc.gov.in/',
		},
	]);
	await page.goto('/');

	const countdown = page.locator('.exam-countdown');
	await expect(countdown).toBeVisible();
	await expect(countdown).toContainText('SSC CGL exam');
	await expect(countdown).toContainText(/in (29|30|31) days/);
	await expect(countdown).toHaveAttribute('href', /\/practice\/ssc-cgl$/);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				text: await countdown.textContent(),
				href: await countdown.getAttribute('href'),
			},
			null,
			2
		),
	});
});

test('no dated exam means no countdown row', async ({ page }) => {
	await stubBackend(page, [
		{
			id: 'countdown-none',
			title: 'Result notice',
			org: 'Staff Selection Commission',
			examId: 'ssc-cgl',
			examDate: null,
			publishedAt: isoInDays(-1),
			status: 'open',
			sourceId: 'probe',
			notificationUrl: 'https://ssc.gov.in/',
		},
	]);
	await page.goto('/');
	await expect(page.locator('.exam-countdown')).toHaveCount(0);
});
