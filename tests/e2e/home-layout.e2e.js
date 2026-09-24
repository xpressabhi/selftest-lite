import { expect, test } from '@playwright/test';

// Home first-screen layout: one-line H1 kicker, planner directly under it, and
// the descriptive paragraph moved down next to the exam links.
// Spec: docs/superpowers/specs/2026-09-24-home-kicker-design.md

async function collectErrors(page) {
	const errors = [];
	page.on('console', (message) => {
		if (message.type() !== 'error') {
			return;
		}
		if (/failed to load resource/i.test(message.text())) {
			return;
		}
		errors.push(message.text());
	});
	page.on('pageerror', (error) => {
		errors.push(String(error?.message || error));
	});
	return errors;
}

async function stubBackend(page) {
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
}

async function waitForHydration(page) {
	await page.waitForFunction(
		() => Boolean(document.querySelector('.intent-input')?.__svelte_meta),
		undefined,
		{ timeout: 15000 }
	);
}

test('the kicker is one line and the planner owns the phone first screen', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await stubBackend(page);
	await page.goto('/');
	await waitForHydration(page);

	await expect(page.locator('h1.home-kicker')).toHaveText(
		'AI Quiz & Exam Paper Generator for India'
	);
	await expect(page.locator('.hero-block')).toHaveCount(0);
	await expect(page.locator('.hero-heading')).toHaveCount(0);

	const kicker = await page.locator('.home-kicker').boundingBox();
	const panel = await page.locator('.planner-panel').boundingBox();
	const composer = await page.locator('.composer-wrap').boundingBox();

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				kickerHeight: kicker.height,
				panelTop: panel.y,
				composerBottom: composer.y + composer.height,
				viewportHeight: 844,
			},
			null,
			2
		),
	});
	// One text line (the old two-line hero was 60px at this width).
	expect(kicker.height).toBeLessThanOrEqual(34);
	// The old hero pushed the panel to y=264; a kicker must land well above that.
	expect(panel.y).toBeLessThanOrEqual(160);
	expect(composer.y + composer.height).toBeLessThanOrEqual(844);
	expect(errors).toEqual([]);
});

test('the pitch paragraph sits with the exam links, below the planner', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await stubBackend(page);
	await page.goto('/');
	await waitForHydration(page);

	const pitch = page.locator('.home-pitch');
	await expect(pitch).toContainText('Practice UPSC, SSC, Banking');
	const order = await page.evaluate(() => {
		const nav = document.querySelector('.popular-exams');
		const paragraph = document.querySelector('.home-pitch');
		const panel = document.querySelector('.planner-panel');
		return {
			afterNav: Boolean(
				nav.compareDocumentPosition(paragraph) & Node.DOCUMENT_POSITION_FOLLOWING
			),
			afterPanel: Boolean(
				panel.compareDocumentPosition(paragraph) & Node.DOCUMENT_POSITION_FOLLOWING
			),
			h1Count: document.querySelectorAll('h1').length,
		};
	});

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ ...order, text: await pitch.textContent() }, null, 2),
	});
	expect(order.afterNav).toBe(true);
	expect(order.afterPanel).toBe(true);
	expect(order.h1Count).toBe(1);
	expect(errors).toEqual([]);
});

test('typing does not move the kicker or the panel', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await stubBackend(page);
	await page.route(
		(url) => url.pathname === '/api/parse-intent',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ plan: null, topicSource: 'local' }),
			})
	);
	await page.goto('/');
	await waitForHydration(page);

	const panelBefore = await page.locator('.planner-panel').boundingBox();
	const kickerBefore = await page.locator('.home-kicker').boundingBox();
	await page.locator('.intent-input').click();
	await page.locator('.intent-input').pressSequentially('zzz', { delay: 20 });
	const panelAfter = await page.locator('.planner-panel').boundingBox();
	const kickerAfter = await page.locator('.home-kicker').boundingBox();

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				panelTopBefore: panelBefore.y,
				panelTopAfter: panelAfter.y,
				kickerTopBefore: kickerBefore.y,
				kickerTopAfter: kickerAfter.y,
			},
			null,
			2
		),
	});
	// The old hero-collapse machinery used to hide the block on typing; the
	// kicker is static now, so nothing may shift.
	expect(Math.abs(panelBefore.y - panelAfter.y)).toBeLessThanOrEqual(1);
	expect(Math.abs(kickerBefore.y - kickerAfter.y)).toBeLessThanOrEqual(1);
	expect(errors).toEqual([]);
});

test('hindi home keeps the kicker and the hindi pitch', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await stubBackend(page);
	await page.goto('/hi');
	await waitForHydration(page);

	await expect(page.locator('h1.home-kicker')).toContainText('भारत के लिए AI क्विज़');
	await expect(page.locator('.home-pitch')).toContainText('UPSC, SSC, बैंकिंग');
	const panel = await page.locator('.planner-panel').boundingBox();

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ panelTop: panel.y }, null, 2),
	});
	expect(panel.y).toBeLessThanOrEqual(200);
	expect(errors).toEqual([]);
});
