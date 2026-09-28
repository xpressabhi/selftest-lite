import { expect, test } from '@playwright/test';

// Welcome tour suite: the one-time first-visit walkthrough — language step,
// spotlighted composer / examples / Daily 5, and its contract: finish and skip
// write the device flag, the fill never requests, reduced motion has no
// transitions, the spotlight follows resizes, and finished devices or
// returning users never see it.
// Spec: docs/superpowers/specs/2026-09-28-welcome-tour-design.md

// The rest of the suite suppresses the tour with a storage state so existing
// specs keep their fresh-visitor behaviour; this file opts out again.
test.use({ storageState: { cookies: [], origins: [] } });

const TOUR_DONE_KEY = 'selftest_welcome_tour_done_at';

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

async function collectUncaught(page) {
	const errors = [];
	page.on('pageerror', (error) => {
		errors.push(String(error?.message || error));
	});
	return errors;
}

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
	await page.route(
		(url) => url.pathname === '/api/parse-intent',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ plan: null, topicSource: 'local' }),
			})
	);
}

async function openTour(page) {
	await page.goto('/');
	await waitForHydration(page);
	await page.locator('.welcome-tour').waitFor({ state: 'visible', timeout: 5000 });
}

async function expectTourStep(page, step) {
	await expect(page.locator('.welcome-tour')).toHaveAttribute('data-step', String(step));
}

async function spotlightContains(page, selector) {
	await expect
		.poll(
			async () => {
				const target = await page.locator(selector).boundingBox();
				const spotlight = await page.locator('.welcome-tour-spotlight').boundingBox();
				if (!target || !spotlight) {
					return false;
				}
				return (
					spotlight.x <= target.x + 1 &&
					spotlight.y <= target.y + 1 &&
					spotlight.x + spotlight.width >= target.x + target.width - 1 &&
					spotlight.y + spotlight.height >= target.y + target.height - 1
				);
			},
			{ timeout: 4000, message: `spotlight does not contain ${selector}` }
		)
		.toBe(true);
}

async function expectCardClearOfSpotlight(page) {
	await expect
		.poll(
			async () => {
				const card = await page.locator('.welcome-tour-card').boundingBox();
				const spotlight = await page.locator('.welcome-tour-spotlight').boundingBox();
				if (!card || !spotlight) {
					return false;
				}
				return (
					card.y + card.height <= spotlight.y ||
					spotlight.y + spotlight.height <= card.y ||
					card.x + card.width <= spotlight.x ||
					spotlight.x + spotlight.width <= card.x
				);
			},
			{ timeout: 4000, message: 'tour card overlaps the spotlight' }
		)
		.toBe(true);
}

test('new visitor sees the tour: language step in both scripts, 44px controls', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await stubBackend(page);
	await openTour(page);

	await expectTourStep(page, 1);
	const languageButtons = page.locator('.welcome-tour-lang');
	await expect(languageButtons).toHaveCount(2);
	await expect(languageButtons.nth(0)).toContainText('English');
	await expect(languageButtons.nth(0)).toHaveAttribute('aria-pressed', 'true');
	await expect(languageButtons.nth(1)).toContainText('हिंदी');
	await expect(page.locator('.welcome-tour-subtitle')).toContainText('अपनी भाषा चुनें');
	await expect(page.locator('.welcome-tour-skip')).toBeVisible();
	await expect(page.locator('.welcome-tour-next')).toBeVisible();
	await expect(page.locator('.welcome-tour-back')).toHaveCount(0);

	for (const control of ['welcome-tour-skip', 'welcome-tour-lang', 'welcome-tour-next']) {
		const boxes = await page.locator(`.${control}`).all();
		for (const box of boxes) {
			const bounds = await box.boundingBox();
			expect(bounds.height).toBeGreaterThanOrEqual(44);
		}
	}

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				step: await page.locator('.welcome-tour').getAttribute('data-step'),
				languageButtons: await languageButtons.allTextContents(),
				subtitle: await page.locator('.welcome-tour-subtitle').textContent(),
			},
			null,
			2
		),
	});
	expect(errors).toEqual([]);
});

test('hindi choice continues the tour in hindi on /hi and persists', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await openTour(page);
	await expectTourStep(page, 1);

	await page.locator('.welcome-tour-lang[data-lang="hindi"]').click();
	await page.waitForURL('**/hi');
	await expect(page.locator('.welcome-tour')).toBeVisible();
	await expectTourStep(page, 2);
	await expect(page.locator('.welcome-tour-title')).toHaveText('यहाँ से शुरू करें');
	await expect(page.locator('.welcome-tour-skip')).toHaveText('टूर छोड़ें');

	const storedLanguage = await page.evaluate(() =>
		window.localStorage.getItem('selftest_language')
	);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				url: page.url(),
				storedLanguage,
				step: await page.locator('.welcome-tour').getAttribute('data-step'),
				title: await page.locator('.welcome-tour-title').textContent(),
			},
			null,
			2
		),
	});
	expect(storedLanguage).toBe('hindi');
	expect(errors).toEqual([]);
});

test('next and back walk steps 2-4 with the spotlight on its target', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await stubBackend(page);
	await openTour(page);

	await page.locator('.welcome-tour-next').click();
	await expectTourStep(page, 2);
	await expect(page.locator('.welcome-tour-title')).toBeFocused();
	await spotlightContains(page, '.intent-input');
	await expectCardClearOfSpotlight(page);
	await expect(page.locator('.welcome-tour-back')).toBeVisible();

	await page.locator('.welcome-tour-next').click();
	await expectTourStep(page, 3);
	await spotlightContains(page, '.welcome-gallery');

	await page.locator('.welcome-tour-next').click();
	await expectTourStep(page, 4);
	await spotlightContains(page, '.daily-five-row');
	await expect(page.locator('.welcome-tour-next')).toHaveCount(0);
	await expect(page.locator('.welcome-tour-fill')).toBeVisible();

	await page.locator('.welcome-tour-back').click();
	await expectTourStep(page, 3);
	await expect(page.locator('.welcome-tour-title')).toBeFocused();

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				step: await page.locator('.welcome-tour').getAttribute('data-step'),
				fillVisible: await page.locator('.welcome-tour-fill').count(),
				backVisible: await page.locator('.welcome-tour-back').count(),
			},
			null,
			2
		),
	});
	expect(errors).toEqual([]);
});

test('fill an example completes the tour exactly without requests', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	const parseCalls = [];
	const generateCalls = [];
	await page.route(
		(url) => url.pathname === '/api/parse-intent',
		(route) => {
			parseCalls.push(route.request().postData());
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ plan: null, topicSource: 'local' }),
			});
		}
	);
	await page.route(
		(url) => url.pathname === '/api/generate',
		(route) => {
			generateCalls.push(route.request().postData());
			return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
		}
	);
	await openTour(page);

	const exampleText = (await page.locator('.welcome-example').first().textContent()).trim();
	for (let index = 0; index < 3; index += 1) {
		await page.locator('.welcome-tour-next').click();
	}
	await expectTourStep(page, 4);
	await page.locator('.welcome-tour-fill').click();

	await expect(page.locator('.welcome-tour')).toHaveCount(0);
	await expect(page.locator('.intent-input')).toHaveValue(exampleText);
	await expect(page.locator('.welcome-gallery')).toBeVisible();
	// Past the 900ms preview debounce: the fill must never trigger a request.
	await page.waitForTimeout(1300);

	const flag = await page.evaluate((key) => window.localStorage.getItem(key), TOUR_DONE_KEY);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				exampleText,
				inputValue: await page.locator('.intent-input').inputValue(),
				parseCalls: parseCalls.length,
				generateCalls: generateCalls.length,
				flag,
			},
			null,
			2
		),
	});
	expect(flag).not.toBeNull();
	expect(parseCalls).toEqual([]);
	expect(generateCalls).toEqual([]);
	expect(errors).toEqual([]);
});

test('skip button writes the device flag', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await openTour(page);

	await page.locator('.welcome-tour-skip').click();
	await expect(page.locator('.welcome-tour')).toHaveCount(0);
	const flag = await page.evaluate((key) => window.localStorage.getItem(key), TOUR_DONE_KEY);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ flag }, null, 2),
	});
	expect(flag).not.toBeNull();
	expect(errors).toEqual([]);
});

test('escape skips the tour', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await openTour(page);

	await page.keyboard.press('Escape');
	await expect(page.locator('.welcome-tour')).toHaveCount(0);
	const flag = await page.evaluate((key) => window.localStorage.getItem(key), TOUR_DONE_KEY);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ flag }, null, 2),
	});
	expect(flag).not.toBeNull();
	expect(errors).toEqual([]);
});

test('backdrop tap skips the tour', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await openTour(page);

	await page.mouse.click(8, 8);
	await expect(page.locator('.welcome-tour')).toHaveCount(0);
	const flag = await page.evaluate((key) => window.localStorage.getItem(key), TOUR_DONE_KEY);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ flag }, null, 2),
	});
	expect(flag).not.toBeNull();
	expect(errors).toEqual([]);
});

test('a finished device never sees the tour again', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await openTour(page);

	await page.locator('.welcome-tour-skip').click();
	await expect(page.locator('.welcome-tour')).toHaveCount(0);
	await page.reload();
	await waitForHydration(page);
	// Well past the settle delay the tour would use.
	await page.waitForTimeout(1200);

	await expect(page.locator('.welcome-tour')).toHaveCount(0);
	await expect(page.locator('.welcome-gallery')).toBeVisible();
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				tourCount: await page.locator('.welcome-tour').count(),
				galleryCount: await page.locator('.welcome-gallery').count(),
			},
			null,
			2
		),
	});
	expect(errors).toEqual([]);
});

test('returning users never see the tour', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await page.addInitScript(() => {
		window.localStorage.setItem(
			'selftest_history',
			JSON.stringify([
				{ id: 'e2e-tour-1', topic: 'Photosynthesis', totalQuestions: 5, timestamp: 1 },
			])
		);
	});
	await page.goto('/');
	await waitForHydration(page);
	await page.waitForTimeout(1200);

	await expect(page.locator('.recent-item').first()).toBeVisible();
	await expect(page.locator('.welcome-tour')).toHaveCount(0);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				tourCount: await page.locator('.welcome-tour').count(),
				recentTitles: await page.locator('.recent-item .recent-topic').allTextContents(),
			},
			null,
			2
		),
	});
	expect(errors).toEqual([]);
});

test('reduced motion runs the tour without transitions', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openTour(page);

	await page.locator('.welcome-tour-next').click();
	await expectTourStep(page, 2);
	const transitionDuration = await page
		.locator('.welcome-tour-spotlight')
		.evaluate((element) => window.getComputedStyle(element).transitionDuration);
	const durationSeconds = transitionDuration.endsWith('ms')
		? parseFloat(transitionDuration) / 1000
		: parseFloat(transitionDuration);
	await spotlightContains(page, '.intent-input');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ transitionDuration }, null, 2),
	});
	expect(durationSeconds).toBeLessThan(0.001);
	expect(errors).toEqual([]);
});

test('desktop invitation focus does not suppress the tour', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 1280, height: 900 });
	await stubBackend(page);
	await openTour(page);

	const focusedClass = await page.evaluate(() => document.activeElement?.className || '');
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ focusedBeforeTour: focusedClass }, null, 2),
	});
	await expectTourStep(page, 1);
	expect(errors).toEqual([]);
});

test('blocked storage still shows and skips the tour', async ({ page }, testInfo) => {
	const errors = await collectUncaught(page);
	await stubBackend(page);
	await page.addInitScript(() => {
		// Private-mode style failure for the tour's own flag: reads work,
		// writes throw. Other keys keep working so pre-existing app paths are
		// not dragged into this contract.
		const originalSetItem = Storage.prototype.setItem;
		Storage.prototype.setItem = function (key, value) {
			if (String(key).startsWith('selftest_welcome_tour_done_at')) {
				throw new DOMException('Storage blocked', 'SecurityError');
			}
			return originalSetItem.call(this, key, value);
		};
	});
	await openTour(page);

	await page.locator('.welcome-tour-skip').click();
	await expect(page.locator('.welcome-tour')).toHaveCount(0);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ uncaught: errors }, null, 2),
	});
	expect(errors).toEqual([]);
});

test('resize keeps the spotlight on its target', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await stubBackend(page);
	await openTour(page);

	await page.locator('.welcome-tour-next').click();
	await expectTourStep(page, 2);
	await spotlightContains(page, '.intent-input');

	await page.setViewportSize({ width: 1280, height: 900 });
	await spotlightContains(page, '.intent-input');

	await page.locator('.welcome-tour-next').click();
	await page.locator('.welcome-tour-next').click();
	await expectTourStep(page, 4);
	await spotlightContains(page, '.daily-five-row');

	await page.setViewportSize({ width: 390, height: 844 });
	await spotlightContains(page, '.daily-five-row');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				step: await page.locator('.welcome-tour').getAttribute('data-step'),
				viewport: page.viewportSize(),
			},
			null,
			2
		),
	});
	expect(errors).toEqual([]);
});
