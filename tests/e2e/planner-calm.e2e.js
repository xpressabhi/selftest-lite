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

// Ported from Pretext's `bubbles` demo: a multiline bubble should sit at the
// width of its widest line, not at its max-width with dead space on the right.
test('a long chat bubble shrinks to its measured width', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await stubHistoryAndTests(page);
	await page.route(
		(url) => url.pathname === '/api/parse-intent',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					plan: {
						topic: 'photosynthesis',
						testType: 'multiple-choice',
						difficulty: 'intermediate',
						numQuestions: 10,
						examId: null,
						isFullExam: false,
						language: 'english',
					},
					messageKey: 'plannerPlanReady',
				}),
			})
	);
	await page.goto('/');

	const message =
		'Explain photosynthesis in plants for a class ten science test, ' +
		'including the light-dependent reactions, the Calvin cycle, ' +
		'and why chlorophyll looks green to the human eye.';
	const input = page.locator('.intent-input');
	await input.click();
	await input.pressSequentially(message, { delay: 2 });
	// The composer runs a live-preview parse while typing; its submit handler
	// ignores a click until that turn settles.
	await page.waitForTimeout(1200);
	const send = page.getByRole('button', { name: 'Build my test plan' });
	await expect(send).toBeEnabled();
	await send.click();

	const bubble = page.locator('.chat-bubble-user').last();
	await expect(bubble).toBeVisible({ timeout: 10000 });
	await expect(bubble).toHaveAttribute('data-tight-width', 'true', { timeout: 8000 });
	const measured = await bubble.evaluate((node) => {
		const log = node.closest('.chat-log');
		return {
			width: node.getBoundingClientRect().width,
			logWidth: log ? log.clientWidth : 0,
			text: (node.textContent || '').trim().length,
		};
	});
	expect(measured.width).toBeGreaterThan(0);
	expect(measured.width).toBeLessThan(measured.logWidth * 0.86);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(measured, null, 2),
	});
	expect(errors).toEqual([]);
});

// Gravity Letters, adapted for the live preview: the topic and changed config
// values render as grapheme spans with a drop-and-settle animation.
test('preview text and changed config values settle with gravity letters', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await stubHistoryAndTests(page);
	await page.route(
		(url) => url.pathname === '/api/parse-intent',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					plan: {
						topic: 'photosynthesis',
						testType: 'multiple-choice',
						difficulty: 'intermediate',
						numQuestions: 10,
						examId: null,
						isFullExam: false,
						language: 'english',
					},
					topicSource: 'local',
					confidence: 'high',
				}),
			})
	);
	await page.goto('/');
	await page.locator('.intent-input').click();
	await page.locator('.intent-input').pressSequentially('photosynthesis in plants', {
		delay: 2,
	});

	const topic = page.locator('.preview-topic-label');
	await expect(topic).toContainText('photosynthesis', { timeout: 8000 });
	const topicLetter = topic.locator('.gravity-letter').first();
	await expect(topicLetter).toBeVisible();
	expect(
		await topicLetter.evaluate((node) => getComputedStyle(node).animationName)
	).toContain('gravity-letter-drop');

	const questionsTile = page.locator('.spec-tile').filter({ hasText: 'Questions' }).first();
	await questionsTile.click();
	await page.locator('.preset-btn').filter({ hasText: '20' }).click();
	await expect(page.locator('.spec-tile').filter({ hasText: 'Questions' })).toHaveAttribute(
		'aria-label',
		'Questions: 20'
	);
	const valueLetter = page
		.locator('.spec-tile')
		.filter({ hasText: 'Questions' })
		.locator('.gravity-letter')
		.first();
	await expect(valueLetter).toBeVisible();

	await page.emulateMedia({ reducedMotion: 'reduce' });
	const reducedAnimation = await valueLetter.evaluate(
		(node) => getComputedStyle(node).animationName
	);
	expect(reducedAnimation).toBe('none');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ topic: await topic.textContent(), reducedAnimation }, null, 2),
	});
	expect(errors).toEqual([]);
});

// When Pretext is already in memory (a test, print or chat loaded it), the
// topic change runs the full Gravity Letters physics on a canvas overlay.
test('topic changes use the canvas gravity animation once pretext is loaded', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await stubHistoryAndTests(page);
	await page.route(
		(url) => url.pathname === '/api/parse-intent',
		(route) => {
			const body = JSON.parse(route.request().postData() || '{}');
			const intent = String(body.intent || '').toLowerCase();
			const topic = intent.includes('gravity')
				? 'gravity in the solar system'
				: 'photosynthesis';
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					plan: {
						topic,
						testType: 'multiple-choice',
						difficulty: 'intermediate',
						numQuestions: 10,
						examId: null,
						isFullExam: false,
						language: 'english',
					},
					topicSource: 'local',
					confidence: 'high',
				}),
			});
		}
	);
	await page.goto('/');
	const input = page.locator('.intent-input');
	await input.click();
	await input.pressSequentially('photosynthesis in plants', {
		delay: 2,
	});
	await expect(page.locator('.preview-topic-label')).toContainText('photosynthesis', {
		timeout: 8000,
	});

	// Warm the engine exactly as a test/print/chat interaction would.
	await page.evaluate(async () => {
		const module = await import('/src/lib/client/pretextLayout.js');
		await module.measureNaturalWidth('warm', '400 16px sans-serif');
	});

	// Change the topic from the composer so the preview label (and its
	// GravityTopic instance) stays mounted.
	await input.fill('');
	await input.pressSequentially('gravity in the solar system', { delay: 2 });
	await expect(page.locator('.preview-topic-label')).toContainText('gravity', {
		timeout: 8000,
	});

	const canvas = page.locator('.gravity-topic canvas');
	await expect(canvas).toHaveClass(/gravity-visible/, { timeout: 3000 });
	const text = page.locator('.gravity-topic .gravity-topic-text');
	await expect(text).toHaveClass(/gravity-hidden/);

	const box = await canvas.evaluate((node) => ({
		width: node.width,
		height: node.height,
		dpr: window.devicePixelRatio,
	}));
	expect(box.width).toBeGreaterThan(0);
	expect(box.height).toBeGreaterThan(0);
	await expect(canvas).not.toHaveClass(/gravity-visible/, { timeout: 3000 });
	await expect(text).not.toHaveClass(/gravity-hidden/);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(box, null, 2),
	});
	expect(errors).toEqual([]);
});
