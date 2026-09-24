import { expect, test } from '@playwright/test';

// Welcome gallery suite: the empty planner state for users with no test
// history — greeting, three example groups, modifier tip — and its contract:
// tap fills the composer without any request, typing hides it, clearing
// brings it back, returning users are untouched.
// Spec: docs/superpowers/specs/2026-09-24-welcome-gallery-design.md

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

// SvelteKit hydrates after the streamed SSR HTML, so server-rendered controls
// are visible but inert for a moment on a cold dev-server load. Typing into an
// unhydrated field is silently lost (no input handler yet), so wait for
// Svelte's dev annotation on the composer before interacting.
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

test('new user sees the welcome gallery: greeting, three groups, six examples, tip', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await stubBackend(page);
	await page.goto('/');
	await waitForHydration(page);

	await expect(page.locator('.welcome-gallery')).toBeVisible();
	await expect(page.locator('.welcome-greeting')).toContainText(
		'Tell me what you want to practice'
	);
	await expect(page.locator('.welcome-group-label')).toHaveText([
		'Exam prep',
		'School & boards',
		'Skills & interviews',
	]);
	const examples = page.locator('.welcome-example');
	await expect(examples).toHaveCount(6);
	await expect(examples.first()).toContainText('SSC CGL general awareness practice');
	await expect(page.locator('.welcome-tip')).toContainText('Add a level, count or language');

	const overflow = await page.evaluate(() => {
		const log = document.querySelector('.chat-log');
		return {
			scrollHeight: log.scrollHeight,
			clientHeight: log.clientHeight,
			overflow: log.scrollHeight - log.clientHeight,
		};
	});
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				labels: await page.locator('.welcome-group-label').allTextContents(),
				examples: await examples.allTextContents(),
				tip: await page.locator('.welcome-tip').textContent(),
				logOverflowPx: overflow.overflow,
			},
			null,
			2
		),
	});
	// Success criterion at phone width: greeting, tip and the first four
	// examples are visible without scrolling, and the rest is a short scroll.
	// Six 44px full-width rows cannot fit the panel (spec §4 / risks), so this
	// is the honest bound rather than zero overflow.
	const logBox = await page.locator('.chat-log').boundingBox();
	const greetingBox = await page.locator('.welcome-greeting').boundingBox();
	expect(greetingBox.y).toBeGreaterThanOrEqual(logBox.y - 1);
	expect(greetingBox.y + greetingBox.height).toBeLessThanOrEqual(logBox.y + logBox.height + 1);
	for (let index = 0; index < 4; index += 1) {
		const exampleBox = await examples.nth(index).boundingBox();
		expect(exampleBox.y).toBeGreaterThanOrEqual(logBox.y - 1);
		expect(exampleBox.y + exampleBox.height).toBeLessThanOrEqual(
			logBox.y + logBox.height + 1
		);
	}
	expect(errors).toEqual([]);
});

test('returning user keeps the recent-tests idle state, no gallery', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await page.addInitScript(() => {
		window.localStorage.setItem(
			'selftest_history',
			JSON.stringify([
				{ id: 'e2e-welcome-1', topic: 'Photosynthesis', totalQuestions: 5, timestamp: 1 },
			])
		);
	});
	await page.goto('/');
	await waitForHydration(page);

	await expect(page.locator('.recent-item').first()).toBeVisible();
	await expect(page.locator('.welcome-gallery')).toHaveCount(0);
	await expect(page.locator('.welcome-tip')).toHaveCount(0);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				recentTitles: await page.locator('.recent-item .recent-topic').allTextContents(),
				galleryCount: await page.locator('.welcome-gallery').count(),
			},
			null,
			2
		),
	});
	expect(errors).toEqual([]);
});

test('tapping an example fills the composer without submitting or previewing', async ({
	page,
}, testInfo) => {
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
	await page.goto('/');
	await waitForHydration(page);

	const firstExample = page.locator('.welcome-example').first();
	const exampleText = (await firstExample.textContent()).trim();
	await firstExample.click();
	// Past the 900ms preview debounce: the fill must never trigger a request.
	await page.waitForTimeout(1300);

	await expect(page.locator('.intent-input')).toHaveValue(exampleText);
	await expect(page.locator('.welcome-gallery')).toBeVisible();
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				exampleText,
				inputValue: await page.locator('.intent-input').inputValue(),
				parseCalls: parseCalls.length,
				generateCalls: generateCalls.length,
			},
			null,
			2
		),
	});
	expect(parseCalls).toEqual([]);
	expect(generateCalls).toEqual([]);
	expect(errors).toEqual([]);
});

test('typing hides the gallery and clearing brings it back', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
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

	await page.locator('.intent-input').click();
	// Nonsense text: no local/lexicon topic must commit, otherwise the plan
	// card takes over and the gallery is not expected back (design §5).
	await page.locator('.intent-input').pressSequentially('zzz', { delay: 20 });
	await expect(page.locator('.welcome-gallery')).toHaveCount(0);
	await expect(page.locator('.welcome-tip')).toHaveCount(0);
	const hiddenGalleryCount = await page.locator('.welcome-gallery').count();

	// Clear the whole thing, one key at a time.
	const value = await page.locator('.intent-input').inputValue();
	for (let index = 0; index < value.length; index += 1) {
		await page.locator('.intent-input').press('Backspace');
	}
	await expect(page.locator('.welcome-gallery')).toBeVisible();
	await expect(page.locator('.welcome-tip')).toBeVisible();

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				hiddenGalleryCount,
				returnedGalleryCount: await page.locator('.welcome-gallery').count(),
				inputValue: await page.locator('.intent-input').inputValue(),
			},
			null,
			2
		),
	});
	expect(errors).toEqual([]);
});

test('hindi home renders the hindi gallery copy', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await page.goto('/hi');
	await waitForHydration(page);

	await expect(page.locator('.welcome-greeting')).toContainText('बताइए आप क्या अभ्यास करना चाहते हैं');
	await expect(page.locator('.welcome-example').first()).toContainText(
		'SSC CGL सामान्य जागरूकता अभ्यास'
	);
	await expect(page.locator('.welcome-group-label')).toHaveText([
		'परीक्षा की तैयारी',
		'स्कूल और बोर्ड',
		'स्किल और इंटरव्यू',
	]);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				labels: await page.locator('.welcome-group-label').allTextContents(),
				firstExample: await page.locator('.welcome-example').first().textContent(),
			},
			null,
			2
		),
	});
	expect(errors).toEqual([]);
});

test('panel height is unchanged when the gallery is dismissed by typing', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
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

	const panel = page.locator('.planner-panel');
	const before = await panel.boundingBox();
	await page.locator('.intent-input').click();
	await page.locator('.intent-input').pressSequentially('p');
	await expect(page.locator('.welcome-gallery')).toHaveCount(0);
	const after = await panel.boundingBox();

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{ beforeHeight: before.height, afterHeight: after.height },
			null,
			2
		),
	});
	expect(Math.abs(before.height - after.height)).toBeLessThanOrEqual(1);
	expect(errors).toEqual([]);
});

test('data saver shows the gallery without animation', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await page.addInitScript(() => window.localStorage.setItem('dataSaverMode', 'true'));
	await page.goto('/');
	await waitForHydration(page);

	await expect(page.locator('html')).toHaveClass(/data-saver/);
	await expect(page.locator('.welcome-gallery')).toBeVisible();
	const animationName = await page
		.locator('.welcome-gallery')
		.evaluate((element) => window.getComputedStyle(element).animationName);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ animationName }, null, 2),
	});
	expect(animationName).toBe('none');
	expect(errors).toEqual([]);
});
