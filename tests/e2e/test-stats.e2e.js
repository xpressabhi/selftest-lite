import { expect, test } from '@playwright/test';
import { connectOrSkip, sqlClient } from './testDb.js';

// Social test stats: visitor / in-progress / submission counters, public
// scores, the owner-only view, and challenge params surviving submission.
// Seeded through the dev server's test database bridge.

async function collectErrors(page) {
	const errors = [];
	page.on('console', (message) => {
		if (message.type() !== 'error') {
			return;
		}
		if (/failed to load resource/i.test(message.text())) {
			return;
		}
		// Background session/state sync can be rate-limited when the whole
		// suite runs from one IP + user agent; this spec asserts its own
		// surfaces directly, so those environmental messages are ignored.
		if (/Rate limit exceeded|Failed to refresh auth session|Failed to fetch user state/i.test(message.text())) {
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
// The description pin avoids matching the bottom-bar submit button.
async function pressAndHold(page, locator, holdMs = 1100) {
	await locator.waitFor({ state: 'visible' });
	await locator.hover();
	await page.waitForTimeout(300);
	await locator.hover();
	await page.mouse.down();
	await page.waitForTimeout(holdMs);
	await page.mouse.up();
}

async function seedTest(sql, questionCount = 2) {
	const questions = Array.from({ length: questionCount }, (_, index) => ({
		question: `Probe question ${index + 1}?`,
		options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
		answer: 'Alpha',
	}));
	const paper = { topic: 'E2E stats probe', questions };
	const rows = await sql`
		INSERT INTO ai_test (test, topic, language, num_questions)
		VALUES (${JSON.stringify(paper)}::jsonb, 'E2E stats probe', 'english', ${questionCount})
		RETURNING id
	`;
	return rows[0].id;
}

// Uses the page's own client id so viewer-scoped fields are meaningful.
async function statsViaPage(page, testId) {
	return page.evaluate(async (id) => {
		const clientId = window.localStorage.getItem('selftest_client_id') || '';
		const response = await fetch(`/api/test/stats?id=${id}`, {
			headers: clientId ? { 'x-client-id': clientId } : {},
		});
		return { status: response.status, body: await response.json() };
	}, testId);
}

async function holdSubmit(page) {
	return page.getByRole('button', { name: 'Submit Test', description: 'Press and hold to submit' });
}

async function answerFirstAndSubmit(page, expectedUrl) {
	await page.getByRole('button', { name: 'Start Test' }).click();
	await page.locator('.test-option').first().click();
	await page.locator('.test-progress-pill').click();
	await pressAndHold(page, await holdSubmit(page));
	await expect(page).toHaveURL(expectedUrl);
}

test('visitors, in-progress and submissions across two visitors', async ({
	browser,
	page,
	request,
}, testInfo) => {
	const errors = await collectErrors(page);
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	const testId = await seedTest(sql, 2);

	// First visitor: no external activity yet, so no stats card.
	await page.goto(`/test?id=${testId}`);
	await expect(page.locator('.test-summary-card')).toBeVisible({ timeout: 15000 });
	await expect(page.locator('.test-stats-card')).toHaveCount(0);

	// Second visitor: the card appears with both visits counted.
	const visitorContext = await browser.newContext();
	const visitorPage = await visitorContext.newPage();
	await visitorPage.goto(`/test?id=${testId}`);
	await expect(visitorPage.locator('.test-stats-card')).toBeVisible();
	await expect
		.poll(async () => (await statsViaPage(visitorPage, testId)).body.visitors, {
			intervals: [500, 1000, 2000],
		})
		.toBe(2);
	await expect(visitorPage.locator('[data-metric="visitors"] .test-stats-value')).toHaveText('2');

	// Answering one question moves the test into "in progress".
	await visitorPage.getByRole('button', { name: 'Start Test' }).click();
	await visitorPage.locator('.test-option').first().click();
	await expect
		.poll(async () => (await statsViaPage(visitorPage, testId)).body.inProgress, {
			intervals: [500, 1000, 2000],
		})
		.toBe(1);

	// Submit: one submission, one public score, nothing left in progress.
	await visitorPage.locator('.test-progress-pill').click();
	await pressAndHold(visitorPage, await holdSubmit(visitorPage));
	await expect(visitorPage).toHaveURL(new RegExp(`/results\\?id=${testId}`));
	const after = await statsViaPage(visitorPage, testId);
	expect(after.body.submissions).toBe(1);
	expect(after.body.inProgress).toBe(0);
	expect(after.body.scores).toHaveLength(1);
	expect(after.body.scores[0]).toMatchObject({ name: null, score: 1, total: 2, isMine: true });
	expect(after.body.myAttempt).toMatchObject({ score: 1, total: 2 });

	// The taker's own score shows on the results card and back on the start page.
	await expect(visitorPage.locator('.test-stats-card')).toBeVisible();
	await expect(visitorPage.locator('.test-stats-my-score')).toContainText('1/2');
	await visitorPage.goto(`/test?id=${testId}`);
	await expect(visitorPage.locator('.test-stats-my-score')).toContainText('1/2');
	await expect(
		visitorPage.locator('[data-metric="submissions"] .test-stats-value')
	).toHaveText('1');

	// The first visitor sees the activity and the other person's score, not their own.
	await page.goto(`/test?id=${testId}`);
	await expect(page.locator('.test-stats-card')).toBeVisible();
	await expect(page.locator('[data-metric="visitors"] .test-stats-value')).toHaveText('2');
	await expect(page.locator('[data-metric="submissions"] .test-stats-value')).toHaveText('1');
	await expect(page.locator('.test-stats-score-row').first()).toContainText('1/2');
	await expect(page.locator('.test-stats-my-score')).toHaveCount(0);

	// The full stats page renders the same numbers.
	await page.goto(`/test/stats?id=${testId}`);
	await expect(page.locator('.test-stats-page')).toBeVisible();
	await expect(page.locator('.test-stats-daily')).toBeVisible({ timeout: 10000 });
	await expect(
		page.locator('.test-stats-page [data-metric="visitors"] .test-stats-value')
	).toHaveText('2', { timeout: 10000 });

	await visitorContext.close();
	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{ visitors: 2, submissions: 1, inProgress: 0, score: '1/2' },
			null,
			2
		),
	});
});

test('challenge name and params survive submission to the results page', async ({
	page,
	request,
}, testInfo) => {
	const errors = await collectErrors(page);
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	const testId = await seedTest(sql, 2);

	await page.goto(`/test?id=${testId}&ch=1&by=Ravi`);
	await expect(page.locator('.test-summary-card')).toBeVisible({ timeout: 15000 });
	await answerFirstAndSubmit(page, new RegExp(`/results\\?id=${testId}&ch=1&by=Ravi`));

	await expect(page.locator('.challenge-card')).toBeVisible();
	const stats = await statsViaPage(page, testId);
	expect(stats.body.scores[0]).toMatchObject({ name: 'Ravi', score: 1, total: 2 });
	await expect(page.locator('.test-stats-card')).toBeVisible();

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ challengeRendered: true, scoreName: 'Ravi' }, null, 2),
	});
});
