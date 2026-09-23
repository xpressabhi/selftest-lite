import { expect, test } from '@playwright/test';

// Calm planner suite: settle rules (no flicker), search/planner coexistence,
// test-ID isolation, overlay planner footer, and keyboard viewport tiers.
// Spec: docs/superpowers/specs/2026-09-23-calm-morph-planner-design.md

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

const EMPTY_HISTORY = {
	status: 200,
	contentType: 'application/json',
	body: JSON.stringify({ attempts: [] }),
};

async function stubHistoryAndTests(page, tests = []) {
	await page.route(
		(url) => url.pathname === '/api/user/history',
		(route) => route.fulfill(EMPTY_HISTORY)
	);
	await page.route(
		(url) => url.pathname === '/api/test',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ tests, hasMore: false }),
			})
	);
}

// Records every distinct committed topic as it reaches the DOM.
async function installTopicLog(page) {
	await page.evaluate(() => {
		window.__topicLog = [];
		const record = () => {
			const label = document.querySelector('.preview-topic-label');
			const text = label ? label.textContent.trim() : '';
			if (text && window.__topicLog[window.__topicLog.length - 1] !== text) {
				window.__topicLog.push(text);
			}
		};
		new MutationObserver(record).observe(document.body, {
			childList: true,
			subtree: true,
			characterData: true,
		});
		record();
	});
}

test('live preview commits once: partial topic fragments never reach the card', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await stubHistoryAndTests(page);
	// Local tier only: Jev previews stay empty so the settle rules are the only
	// thing driving the card.
	const previewBodies = [];
	await page.route(
		(url) => url.pathname === '/api/parse-intent',
		(route) => {
			previewBodies.push(JSON.parse(route.request().postData() || '{}'));
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ plan: null, topicSource: 'local' }),
			});
		}
	);

	await page.goto('/');
	await installTopicLog(page);
	await page.locator('.intent-input').click();
	await page.locator('.intent-input').pressSequentially('photosynthesis in plants', {
		delay: 30,
	});

	const label = page.locator('.preview-topic-label');
	await expect(label).toHaveText('photosynthesis', { timeout: 6000 });
	await page.waitForTimeout(500);

	const topicLog = await page.evaluate(() => window.__topicLog);
	const finalTopic = await label.textContent();
	const fragments = topicLog.filter(
		(value) => value !== finalTopic && finalTopic.startsWith(value)
	);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ topicLog, finalTopic, fragments, previewCalls: previewBodies.length }, null, 2),
	});
	expect(fragments).toEqual([]);
	expect(topicLog).toEqual(['photosynthesis']);
	expect(errors).toEqual([]);
});

test('a weak Jev challenger holds the last committed topic; strong evidence commits', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await stubHistoryAndTests(page);
	let previewCalls = 0;
	await page.route(
		(url) => url.pathname === '/api/parse-intent',
		async (route) => {
			const body = JSON.parse(route.request().postData() || '{}');
			if (body.mode === 'preview') {
				previewCalls += 1;
				const confident = previewCalls >= 2;
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						plan: {
							topic: 'plant biology',
							testType: 'multiple-choice',
							difficulty: 'intermediate',
							numQuestions: 10,
							examId: null,
							isFullExam: false,
							language: 'english',
						},
						topicSource: 'span',
						fieldConfidence: { topic: confident ? 0.92 : 0.6 },
						confidence: confident ? 'high' : 'medium',
					}),
				});
				return;
			}
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ plan: null }),
			});
		}
	);

	await page.goto('/');
	await page.locator('.intent-input').click();
	await page.locator('.intent-input').pressSequentially('photosynthesis in plants', {
		delay: 20,
	});

	const label = page.locator('.preview-topic-label');
	// The local tier commits the subject first.
	await expect(label).toHaveText('photosynthesis', { timeout: 6000 });

	// First Jev preview: weak challenger must not move the card.
	const firstPreview = page.waitForResponse(
		(response) =>
			response.url().includes('/api/parse-intent') &&
			(response.request().postData() || '').includes('"mode":"preview"')
	);
	await firstPreview;
	await page.waitForTimeout(400);
	await expect(label).toHaveText('photosynthesis');

	// Pass the preview throttle, then ask again: same challenger, high confidence.
	await page.waitForTimeout(800);
	await page.locator('.intent-input').pressSequentially('.', { delay: 20 });
	await expect(label).toHaveText('plant biology', { timeout: 8000 });

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				previewCalls,
				finalTopic: await label.textContent(),
				heldWeakChallenger: true,
			},
			null,
			2
		),
	});
	expect(previewCalls).toBeGreaterThanOrEqual(2);
	expect(errors).toEqual([]);
});

test('keyword search and plan card update independently', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubHistoryAndTests(page, [
		{ id: 424242, topic: 'Physics Waves', num_questions: 5, test_mode: 'quiz-practice' },
	]);
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
	await page.locator('.intent-input').click();
	await page.locator('.intent-input').pressSequentially('physics waves', { delay: 20 });

	// Both lanes visible at the same time: past-test strip and the plan card.
	await expect(page.locator('.search-strip').getByText('Physics Waves')).toBeVisible();
	await expect(page.locator('.preview-topic-label')).toHaveText('physics waves');
	await expect(page.locator('.preview-card')).toHaveClass(/tier-/);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				strip: await page.locator('.search-strip .strip-chip').allInnerTexts(),
				topic: await page.locator('.preview-topic-label').textContent(),
				previewCardClasses: await page.locator('.preview-card').getAttribute('class'),
			},
			null,
			2
		),
	});
	expect(errors).toEqual([]);
});

test('test-id query never runs a planner preview and leaves the card alone', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await stubHistoryAndTests(page, [
		{ id: 4821, topic: 'Motion & force', num_questions: 5, test_mode: 'quiz-practice' },
	]);
	const previewRequests = [];
	await page.route(
		(url) => url.pathname === '/api/parse-intent',
		(route) => {
			const body = JSON.parse(route.request().postData() || '{}');
			if (body.mode === 'preview') {
				previewRequests.push(body.intent);
			}
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ plan: null }),
			});
		}
	);

	await page.goto('/');
	await page.locator('.intent-input').click();
	await page.locator('.intent-input').pressSequentially('4821', { delay: 30 });

	await expect(page.locator('.search-strip .strip-chip')).toContainText('Motion & force');
	await expect(page.locator('.search-strip .strip-chip')).toContainText('4821');
	await expect(page.locator('.preview-card')).toHaveCount(0);
	await page.waitForTimeout(1200);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ previewRequests }, null, 2),
	});
	expect(previewRequests).toEqual([]);
	expect(errors).toEqual([]);
});

test('overlay keeps the planner visible: plan status and plan action with matches', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await stubHistoryAndTests(page, [
		{ id: 424242, topic: 'Physics Waves', num_questions: 5, test_mode: 'quiz-practice' },
	]);
	const parseBodies = [];
	await page.route(
		(url) => url.pathname === '/api/parse-intent',
		(route) => {
			parseBodies.push(JSON.parse(route.request().postData() || '{}'));
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ plan: null, topicSource: 'local' }),
			});
		}
	);

	await page.goto('/');
	// Build a plan first, then search on top of it.
	await page.locator('.intent-input').click();
	await page.locator('.intent-input').pressSequentially('physics waves', { delay: 20 });
	await expect(page.locator('.preview-topic-label')).toHaveText('physics waves');

	await page.locator('.composer-search').click();
	const overlay = page.locator('.search-dropdown');
	await expect(overlay).toBeVisible();
	await expect(overlay.locator('.dropdown-result').first()).toBeVisible();

	// The planner stays visible even while matches exist.
	await expect(overlay.locator('.dropdown-plan')).toContainText('physics waves');
	await expect(overlay.locator('.dropdown-generate')).toBeVisible();

	// The footer action submits the current query as a planner turn.
	const turnRequest = page.waitForRequest(
		(request) =>
			request.url().includes('/api/parse-intent') &&
			!((request.postData() || '').includes('"mode":"preview"'))
	);
	await overlay.locator('.dropdown-generate').click();
	await turnRequest;

	const turnBody = parseBodies.find((body) => !('mode' in body)) || null;
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				turnIntent: turnBody?.intent,
				previewCalls: parseBodies.filter((body) => body.mode === 'preview').length,
				overlayPlan: await page.locator('.preview-topic-label').textContent().catch(() => null),
			},
			null,
			2
		),
	});
	expect(turnBody?.intent).toBe('physics waves');
	expect(errors).toEqual([]);
});

test('plan card keyboard tiers: full, dense, micro', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubHistoryAndTests(page);
	await page.route(
		(url) => url.pathname === '/api/parse-intent',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ plan: null, topicSource: 'local' }),
			})
	);

	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	await page.locator('.intent-input').click();
	await page.locator('.intent-input').pressSequentially('physics waves', { delay: 20 });

	const card = page.locator('.preview-card');
	await expect(card).toHaveClass(/tier-full/);
	await expect(card.locator('.spec-tile')).toHaveCount(4);

	await page.setViewportSize({ width: 390, height: 420 });
	await expect(card).toHaveClass(/tier-dense/);
	await expect(card.locator('.spec-tile')).toHaveCount(4);
	await expect(card.locator('.generate-btn')).toBeVisible();

	await page.setViewportSize({ width: 390, height: 300 });
	await expect(card).toHaveClass(/tier-micro/);
	await expect(card.locator('.spec-tile')).toHaveCount(4);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				classes: {
					full: 'tier-full',
					dense: 'tier-dense',
					micro: 'tier-micro',
				},
				tilesPerTier: 4,
			},
			null,
			2
		),
	});
	expect(errors).toEqual([]);
});
