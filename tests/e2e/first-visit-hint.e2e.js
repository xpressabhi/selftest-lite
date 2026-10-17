import { expect, test } from '@playwright/test';

// First-visit coach hint suite: the quiet, in-flow nudge that replaced the
// blocking welcome tour — it teaches the composer, retires for good when used
// or dismissed, is capped for untouched sessions, and never interrupts
// returning users.
// Spec: docs/superpowers/specs/2026-10-17-first-visit-onboarding-design.md

// Pre-existing suites suppress first-visit surfaces with a storage state; this
// file opts out so a genuinely fresh visitor is exercised.
test.use({ storageState: { cookies: [], origins: [] } });

const HINT_DISMISSED_KEY = 'selftest_onboarding_hint_dismissed_at';
const HINT_SHOWS_KEY = 'selftest_onboarding_hint_shows';

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
}

async function openHome(page) {
	await page.goto('/');
	await waitForHydration(page);
}

async function expectHintVisible(page) {
	await expect(page.locator('.onboarding-hint')).toBeVisible({ timeout: 5000 });
}

// The entrance animation composites the card; waiting for it to finish keeps
// tap-target measurements the laid-out 44px box instead of animation-phase
// subpixel geometry (observed: 43.99997 during the 180ms fade-up).
async function waitForHintSettled(page) {
	await page.locator('.onboarding-hint').evaluate(async (element) => {
		const animations = element.getAnimations({ subtree: true });
		await Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
	});
}

function readHintKeys(page) {
	return page.evaluate(
		({ dismissedKey, showsKey }) => ({
			dismissedAt: window.localStorage.getItem(dismissedKey),
			shows: window.localStorage.getItem(showsKey),
		}),
		{ dismissedKey: HINT_DISMISSED_KEY, showsKey: HINT_SHOWS_KEY }
	);
}

test('a first visit shows the in-flow hint, and nothing is blocked', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await openHome(page);

	await expect(page.locator('.welcome-tour')).toHaveCount(0);
	await expectHintVisible(page);
	await expect(page.locator('.welcome-gallery')).toBeVisible();

	await waitForHintSettled(page);
	const hintPosition = await page
		.locator('.onboarding-hint')
		.evaluate((element) => window.getComputedStyle(element).position);
	const dismissBox = await page.locator('.onboarding-hint-dismiss').boundingBox();
	const keys = await readHintKeys(page);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ hintPosition, dismissBox, keys }, null, 2),
	});
	expect(hintPosition).toBe('static');
	expect(dismissBox.height).toBeGreaterThanOrEqual(44);
	expect(keys.shows).toBe('1');
	expect(keys.dismissedAt).toBeNull();
	expect(errors).toEqual([]);
});

test('typing in the composer retires the hint for good', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await openHome(page);
	await expectHintVisible(page);

	await page.locator('.intent-input').fill('photosynthesis for class 10');
	await expect(page.locator('.onboarding-hint')).toHaveCount(0);
	const keys = await readHintKeys(page);

	await page.reload();
	await waitForHydration(page);
	await page.waitForTimeout(1200);
	await expect(page.locator('.onboarding-hint')).toHaveCount(0);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ keys }, null, 2),
	});
	expect(keys.dismissedAt).not.toBeNull();
	expect(errors).toEqual([]);
});

test('the dismiss button retires the hint for good', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await openHome(page);
	await expectHintVisible(page);

	await page.locator('.onboarding-hint-dismiss').click();
	await expect(page.locator('.onboarding-hint')).toHaveCount(0);
	const keys = await readHintKeys(page);

	await page.reload();
	await waitForHydration(page);
	await page.waitForTimeout(1200);
	await expect(page.locator('.onboarding-hint')).toHaveCount(0);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ keys }, null, 2),
	});
	expect(keys.dismissedAt).not.toBeNull();
	expect(errors).toEqual([]);
});

test('tapping an example fills the composer and retires the hint', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await openHome(page);
	await expectHintVisible(page);

	const exampleText = (await page.locator('.welcome-example').first().textContent()).trim();
	await page.locator('.welcome-example').first().click();

	await expect(page.locator('.onboarding-hint')).toHaveCount(0);
	await expect(page.locator('.intent-input')).toHaveValue(exampleText);
	const keys = await readHintKeys(page);

	await page.reload();
	await waitForHydration(page);
	await page.waitForTimeout(1200);
	await expect(page.locator('.onboarding-hint')).toHaveCount(0);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ exampleText, keys }, null, 2),
	});
	expect(keys.dismissedAt).not.toBeNull();
	expect(errors).toEqual([]);
});

test('an interaction before the hint appears cancels it silently', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await openHome(page);

	// Straight into the composer, inside the 800 ms window.
	await page.locator('.intent-input').fill('human physiology');
	await page.waitForTimeout(1200);

	const keys = await readHintKeys(page);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ keys }, null, 2),
	});
	await expect(page.locator('.onboarding-hint')).toHaveCount(0);
	expect(keys.shows).toBeNull();
	expect(keys.dismissedAt).toBeNull();
	expect(errors).toEqual([]);
});

test('the hint stops after three untouched shows', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);

	for (let show = 1; show <= 3; show += 1) {
		await openHome(page);
		await expectHintVisible(page);
	}

	await openHome(page);
	await page.waitForTimeout(1400);
	const keys = await readHintKeys(page);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ keys }, null, 2),
	});
	await expect(page.locator('.onboarding-hint')).toHaveCount(0);
	expect(keys.shows).toBe('3');
	expect(errors).toEqual([]);
});

test('the hint fits a 320px phone and keeps a 44px dismiss', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 320, height: 568 });
	await stubBackend(page);
	await openHome(page);
	await expectHintVisible(page);

	await expect
		.poll(
			() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
			{ timeout: 2000, message: 'the page overflows horizontally at 320px' }
		)
		.toBe(true);
	await waitForHintSettled(page);
	const dismissBox = await page.locator('.onboarding-hint-dismiss').boundingBox();

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ dismissBox }, null, 2),
	});
	expect(dismissBox.width).toBeGreaterThanOrEqual(44);
	expect(dismissBox.height).toBeGreaterThanOrEqual(44);
	expect(errors).toEqual([]);
});

test('reduced motion shows the hint without motion', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await openHome(page);
	await expectHintVisible(page);

	const durations = await page.locator('.onboarding-hint').evaluate((element) => {
		const style = window.getComputedStyle(element);
		return { animation: style.animationDuration, transition: style.transitionDuration };
	});
	const toSeconds = (value) =>
		value.endsWith('ms') ? parseFloat(value) / 1000 : parseFloat(value);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ durations }, null, 2),
	});
	expect(toSeconds(durations.animation)).toBeLessThan(0.001);
	expect(toSeconds(durations.transition)).toBeLessThan(0.001);
	expect(errors).toEqual([]);
});

test('the hindi home shows hindi copy and the switch returns to english', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await page.goto('/hi');
	await waitForHydration(page);
	await expectHintVisible(page);

	await expect(page.locator('.onboarding-hint-body')).toContainText('अभ्यास');
	await expect(page.locator('.onboarding-hint-switch')).toHaveText('View in English');

	await page.locator('.onboarding-hint-switch').click();
	await expect.poll(() => new URL(page.url()).pathname).toBe('/');
	await expectHintVisible(page);
	await expect(page.locator('.onboarding-hint-switch')).toHaveText('हिंदी में देखें');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{ url: page.url(), switchLabel: await page.locator('.onboarding-hint-switch').textContent() },
			null,
			2
		),
	});
	expect(errors).toEqual([]);
});

test('returning users never see the hint', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await page.addInitScript(() => {
		window.localStorage.setItem(
			'selftest_history',
			JSON.stringify([
				{ id: 'e2e-hint-1', topic: 'Photosynthesis', totalQuestions: 5, timestamp: 1 },
			])
		);
	});
	await page.goto('/');
	await waitForHydration(page);
	await page.waitForTimeout(1200);

	await expect(page.locator('.recent-item').first()).toBeVisible();
	await expect(page.locator('.onboarding-hint')).toHaveCount(0);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ recentTitles: await page.locator('.recent-item .recent-topic').allTextContents() }, null, 2),
	});
	expect(errors).toEqual([]);
});

test('the card reserves its space before it reveals', async ({ page }, testInfo) => {
	// Clock control makes the pre-reveal window deterministic. The reserved box
	// exists (hidden) from first paint, so the reveal is a visibility flip
	// rather than the layout shift a late in-flow insertion would cause.
	await page.clock.install();
	await stubBackend(page);
	await page.goto('/');
	await page.clock.fastForward(1);

	await expect(page.locator('.onboarding-hint')).toHaveCount(1);
	const hiddenBeforeReveal = await page.locator('.onboarding-hint').isHidden();

	await page.clock.fastForward(900);
	await expect(page.locator('.onboarding-hint')).toBeVisible();

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ hiddenBeforeReveal }, null, 2),
	});
	expect(hiddenBeforeReveal).toBe(true);
});

test('opening the tour retires the hint for good', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubBackend(page);
	await openHome(page);

	// Straight into the walkthrough: the hint must retire whether or not it
	// had already revealed, and must not return on the next visit.
	await page.locator('.how-it-works').click();
	await expect(page.locator('.welcome-tour')).toBeVisible();
	await expect(page.locator('.onboarding-hint')).toHaveCount(0);
	await page.locator('.welcome-tour-skip').click();
	const keys = await readHintKeys(page);

	await page.reload();
	await waitForHydration(page);
	await page.waitForTimeout(1200);
	await expect(page.locator('.onboarding-hint')).toHaveCount(0);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ keys }, null, 2),
	});
	expect(keys.dismissedAt).not.toBeNull();
	expect(errors).toEqual([]);
});

test('blocked storage never throws when the hint is dismissed', async ({ page }, testInfo) => {
	const errors = await collectUncaught(page);
	await stubBackend(page);
	await page.addInitScript(() => {
		// Private-mode style failure for the hint's own keys: reads work,
		// writes throw. Other keys keep working so pre-existing app paths are
		// not dragged into this contract.
		const originalSetItem = Storage.prototype.setItem;
		Storage.prototype.setItem = function (key, value) {
			if (String(key).startsWith('selftest_onboarding_hint')) {
				throw new DOMException('Storage blocked', 'SecurityError');
			}
			return originalSetItem.call(this, key, value);
		};
	});
	await openHome(page);
	await expectHintVisible(page);

	await page.locator('.onboarding-hint-dismiss').click();
	await expect(page.locator('.onboarding-hint')).toHaveCount(0);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ uncaught: errors }, null, 2),
	});
	expect(errors).toEqual([]);
});
