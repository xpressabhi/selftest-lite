import { expect, test } from '@playwright/test';

// Smoke suite: critical pages render with zero console/page errors. No API
// keys or backend data needed; specs stay read-only (no test generation).

async function collectErrors(page) {
	const errors = [];
	page.on('console', (message) => {
		if (message.type() !== 'error') {
			return;
		}
		// Failed fetches (e.g. the deliberate 404 for an unknown test id)
		// surface here while the app still handles them gracefully.
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

// HoldButton ignores quick taps, so e2e submit drives a real press-and-hold.
// hover() waits for the element to stop moving, which matters while the
// review sheet is still animating in.
// HoldButton ignores quick taps, so e2e submit drives a real press-and-hold.
// The review sheet animates in: let it settle, re-aim the pointer, then hold.
async function pressAndHold(page, locator, holdMs = 1100) {
	await locator.waitFor({ state: 'visible' });
	await locator.hover();
	await page.waitForTimeout(300);
	await locator.hover();
	await page.mouse.down();
	await page.waitForTimeout(holdMs);
	await page.mouse.up();
}

test('home renders the planner composer', async ({ page }) => {
	const errors = await collectErrors(page);
	await page.goto('/');
	await expect(page.locator('.planner-panel')).toBeVisible();
	await expect(page.locator('.intent-input')).toBeVisible();
	expect(errors).toEqual([]);
});

test('practice hub lists exams', async ({ page }) => {
	const errors = await collectErrors(page);
	await page.goto('/practice');
	await expect(page.locator('.practice-grid')).toBeVisible();
	await expect(page.locator('.practice-card').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('history renders', async ({ page }) => {
	const errors = await collectErrors(page);
	await page.goto('/history');
	await expect(page.getByRole('heading', { name: /history/i }).first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('results with an unknown id fails gracefully', async ({ page }) => {
	const errors = await collectErrors(page);
	await page.goto('/results?id=999999999');
	await expect(page.locator('.alert').first()).toBeVisible();
	expect(errors).toEqual([]);
});

test('home and empty search list own tests only', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	// Any global list request (empty q) is a regression: home must never ask
	// for other people's tests.
	const globalListCalls = [];
	await page.route(
		(url) => url.pathname === '/api/test',
		async (route) => {
			const url = new URL(route.request().url());
			if (!url.searchParams.get('q')) {
				globalListCalls.push(url.toString());
			}
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					tests: [
						{ id: 999999, topic: 'Stranger Test', num_questions: 3, test_mode: 'quiz-practice' },
					],
					hasMore: false,
				}),
			});
		}
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
		(url) => url.pathname === '/api/parse-intent',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ plan: null, topicSource: 'local' }),
			})
	);
	// 12 own tests (cap checks), one hidden id, one distinct topic for the
	// short-query filter. Seeded newest-first, the order the app writes.
	await page.addInitScript(() => {
		const history = [
			{
				id: 301,
				topic: 'Physics Waves',
				totalQuestions: 5,
				test_mode: 'quiz-practice',
				timestamp: 2500,
			},
			{
				id: 201,
				topic: 'Hidden Test',
				totalQuestions: 5,
				test_mode: 'quiz-practice',
				timestamp: 2000,
			},
		];
		for (let i = 12; i >= 1; i -= 1) {
			history.push({
				id: 100 + i,
				topic: `Own Test ${i}`,
				totalQuestions: 5,
				test_mode: 'quiz-practice',
				timestamp: 1000 + i,
			});
		}
		window.localStorage.setItem('selftest_history', JSON.stringify(history));
		window.localStorage.setItem('selftest_hidden_history', JSON.stringify(['201']));
	});

	await page.goto('/');
	// Home block: own newest five only, hidden id filtered, no stranger rows.
	await expect(page.locator('.recent-item')).toHaveCount(5);
	await expect(page.locator('.recent-block').getByText('Own Test 12')).toBeVisible();
	await expect(page.locator('.recent-block').getByText('Own Test 8')).toHaveCount(0);
	await expect(page.locator('.recent-block').getByText('Hidden Test')).toHaveCount(0);
	await expect(page.getByText('Stranger Test')).toHaveCount(0);
	const homeRows = await page.locator('.recent-item').allInnerTexts();

	// Empty dropdown: own tests only, newest-first, capped at 10.
	await page.locator('.composer-search').click();
	await expect(page.locator('.search-dropdown')).toBeVisible();
	await expect(page.locator('.search-dropdown .dropdown-result')).toHaveCount(10);
	await expect(page.locator('.search-dropdown').getByText('Own Test 3')).toHaveCount(0);
	await expect(page.locator('.search-dropdown').getByText('Hidden Test')).toHaveCount(0);
	await expect(page.locator('.search-dropdown').getByText('Stranger Test')).toHaveCount(0);
	const dropdownRows = await page.locator('.search-dropdown .dropdown-result').allInnerTexts();

	// Short (non-searchable) query filters own tests locally, case-insensitively.
	await page.locator('.intent-input').click();
	await page.keyboard.type('phy');
	await expect(page.locator('.search-dropdown .dropdown-result')).toHaveCount(1);
	await expect(page.locator('.search-dropdown').getByText('Physics Waves')).toBeVisible();
	const filteredRows = await page.locator('.search-dropdown .dropdown-result').allInnerTexts();

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ homeRows, dropdownRows, filteredRows, globalListCalls }, null, 2),
	});
	expect(globalListCalls).toEqual([]);
	expect(errors).toEqual([]);
});

test('typed search still reaches the server', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	const searches = [];
	await page.route(
		(url) => url.pathname === '/api/parse-intent',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ plan: null, topicSource: 'local' }),
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
		async (route) => {
			const url = new URL(route.request().url());
			searches.push(url.searchParams.get('q') || '');
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					tests: [
						{
							id: 424242,
							topic: 'Topology Basics',
							num_questions: 5,
							test_mode: 'quiz-practice',
						},
					],
					hasMore: false,
				}),
			});
		}
	);

	await page.goto('/');
	await page.locator('.intent-input').click();
	await page.locator('.intent-input').pressSequentially('topology', { delay: 25 });
	await expect(page.locator('.search-strip').getByText('Topology Basics')).toBeVisible();
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				searchQueries: searches,
				stripRows: await page.locator('.search-strip .strip-chip').allInnerTexts(),
			},
			null,
			2
		),
	});
	expect(searches).toContain('topology');
	expect(errors).toEqual([]);
});

test('planner generation sends intent capture', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	let capturedBody = null;
	const paper = {
		id: 'e2e-capture',
		topic: 'python built-in data structures',
		testMode: 'quiz-practice',
		language: 'english',
		questions: [
			{ question: 'Q1', options: ['A1', 'B1', 'C1', 'D1'], answer: 'A1' },
			{ question: 'Q2', options: ['A2', 'B2', 'C2', 'D2'], answer: 'A2' },
		],
	};
	await page.route(
		(url) => url.pathname === '/api/parse-intent',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					plan: {
						topic: 'python built-in data structures',
						testType: 'multiple-choice',
						difficulty: 'intermediate',
						numQuestions: 10,
						examId: null,
						isFullExam: false,
						language: 'english',
					},
					topicSource: 'span',
					fieldConfidence: { topic: 0.9 },
					confidence: 'high',
				}),
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
		(url) => url.pathname === '/api/generate',
		async (route) => {
			capturedBody = JSON.parse(route.request().postData() || '{}');
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(paper),
			});
		}
	);
	await page.route(
		(url) => url.pathname === '/api/test',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ ...paper, myAttempt: null }),
			})
	);

	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const previewLanded = page.waitForResponse(
		(response) =>
			response.url().includes('/api/parse-intent') && response.request().method() === 'POST'
	);
	await page.locator('.intent-input').click();
	await page.locator('.intent-input').pressSequentially('python built in data structures', {
		delay: 15,
	});
	await previewLanded;
	await page.getByRole('button', { name: /Generate Test/ }).click();
	await expect(page).toHaveURL(/\/test\?id=e2e-capture/);

	const capture = capturedBody?.intentCapture;
	expect(capture?.thread?.[0]).toBe('python built in data structures');
	expect(capture?.plan?.topic).toBe('python built-in data structures');
	expect(capture?.provenance?.topicSource).toBe('span');
	expect(capture?.provenance?.parseMode).toBe('preview');
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ intentCapture: capture }, null, 2),
	});
	expect(errors).toEqual([]);
});

test('quick start omits intent capture', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	let capturedBody = null;
	const paper = {
		id: 'e2e-quick',
		topic: 'Daily mix',
		testMode: 'quiz-practice',
		language: 'english',
		questions: [{ question: 'Q1', options: ['A1', 'B1', 'C1', 'D1'], answer: 'A1' }],
	};
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
		(url) => url.pathname === '/api/generate',
		async (route) => {
			capturedBody = JSON.parse(route.request().postData() || '{}');
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(paper),
			});
		}
	);
	await page.route(
		(url) => url.pathname === '/api/test',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ ...paper, myAttempt: null }),
			})
	);

	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.getByRole('button', { name: /Daily 5/ }).click();
	await expect(page).toHaveURL(/\/test\?id=e2e-quick/);
	expect(capturedBody?.intentCapture).toBeUndefined();
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ hasIntentCapture: 'intentCapture' in (capturedBody || {}) }, null, 2),
	});
	expect(errors).toEqual([]);
});

test('generate stays disabled while intent parsing runs', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	const plan = {
		topic: 'python built in data structures',
		testType: 'multiple-choice',
		difficulty: 'intermediate',
		numQuestions: 10,
		examId: null,
		isFullExam: false,
		language: 'english',
	};
	await page.route(
		(url) => url.pathname === '/api/parse-intent',
		async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 1500));
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					plan,
					topicSource: 'span',
					fieldConfidence: { topic: 0.9 },
					confidence: 'high',
				}),
			});
		}
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

	await page.goto('/');
	await page.waitForLoadState('networkidle');
	const generate = page.locator('.generate-btn');

	// Preview parse: the button must be disabled while the request is in flight.
	const previewStarted = page.waitForRequest((request) =>
		request.url().includes('/api/parse-intent')
	);
	await page.locator('.intent-input').click();
	await page.locator('.intent-input').pressSequentially('python built in data structures', {
		delay: 10,
	});
	await previewStarted;
	await expect(generate).toBeDisabled();
	await expect(generate).toBeEnabled({ timeout: 10000 });

	// Turn parse: submitting the same message must disable it again.
	const turnStarted = page.waitForRequest(
		(request) =>
			request.url().includes('/api/parse-intent') &&
			!request.postData()?.includes('"mode":"preview"')
	);
	await page.locator('.intent-input').press('Enter');
	await turnStarted;
	await expect(generate).toBeDisabled();
	await expect(generate).toBeEnabled({ timeout: 10000 });

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ disabledDuringPreview: true, disabledDuringTurn: true }, null, 2),
	});
	expect(errors).toEqual([]);
});

test('seeded paper: skip-streak unlocks 50-50, submit lands on results', async ({
	page,
}) => {
	const errors = await collectErrors(page);
	const paper = {
		id: 'e2e-smoke',
		topic: 'Smoke Arithmetic',
		testMode: 'quiz-practice',
		language: 'english',
		questions: [
			{ question: 'Q1', options: ['A1', 'B1', 'C1', 'D1'], answer: 'A1' },
			{ question: 'Q2', options: ['A2', 'B2', 'C2', 'D2'], answer: 'A2' },
			{ question: 'Q3', options: ['A3', 'B3', 'C3', 'D3'], answer: 'C3' },
		],
	};
	await page.addInitScript((seed) => {
		window.localStorage.setItem('selftest_question_paper', JSON.stringify(seed));
	}, paper);

	await page.goto('/test');
	await page.getByRole('button', { name: 'Start Test' }).click();
	// Two consecutive unanswered nexts = skip streak, unlocks 50-50 on Q3.
	await page.getByRole('button', { name: 'Next' }).click();
	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.locator('.test-hint')).toBeEnabled();
	await page.locator('.test-hint').click();
	await expect(page.locator('.test-option.eliminated')).toHaveCount(2);
	// Answer everything correctly: Q3's first surviving option is the key.
	await page.locator('.test-option:not(.eliminated)').first().click();
	await page.getByRole('button', { name: 'Back' }).click();
	await page.locator('.test-option').first().click();
	await page.getByRole('button', { name: 'Back' }).click();
	await page.locator('.test-option').first().click();
	// Submit through the review sheet: the button commits on a full hold.
	await page.locator('.test-progress-pill').click();
	await pressAndHold(page, page.getByRole('button', { name: 'Submit Test' }));
	await expect(page).toHaveURL(/\/results\?id=e2e-smoke/);
	await expect(page.locator('.score-ring-sub')).toContainText('3 of 3 correct');
	expect(errors).toEqual([]);
});
