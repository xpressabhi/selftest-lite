import { expect, test } from '@playwright/test';

// Offline submission: a paper is cached locally, so the attempt runs without a
// network. Grading needs the server (the answer key never leaves it), so a
// failed submit must queue the raw answers and replay them on demand rather
// than losing the attempt or showing a dead-end error.
const PAPER = {
	id: 'offline-e2e',
	topic: 'Offline probe',
	totalQuestions: 2,
	timestamp: 1,
	questions: [
		{ question: 'Offline question 1?', options: ['Alpha', 'Beta'] },
		{ question: 'Offline question 2?', options: ['Alpha', 'Beta'] },
	],
};

async function seedPaper(page) {
	await page.addInitScript((paper) => {
		localStorage.setItem('selftest_question_paper', JSON.stringify(paper));
		localStorage.setItem('selftest_history', JSON.stringify([paper]));
	}, PAPER);
}

// The review sheet's submit is a real press-and-hold control.
async function pressAndHold(page, locator, holdMs = 1100) {
	await locator.waitFor({ state: 'visible' });
	await locator.hover();
	await page.waitForTimeout(300);
	await locator.hover();
	await page.mouse.down();
	await page.waitForTimeout(holdMs);
	await page.mouse.up();
}

test('a failed submit is queued and graded when the connection returns', async ({
	page,
}, testInfo) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(String(error?.message || error)));

	await seedPaper(page);
	await page.goto('/test?id=offline-e2e');
	await expect(page.getByRole('button', { name: 'Start Test' })).toBeVisible();
	await page.getByRole('button', { name: 'Start Test' }).click();

	// Answer the first question, then make the network disappear for the
	// submit request only (the page has already loaded its paper locally).
	await page.locator('.test-option').filter({ hasText: 'Alpha' }).first().click();
	await page.route('**/api/test/submit', (route) => route.abort('failed'));

	await page.locator('.test-progress-pill').click();
	await pressAndHold(page, page.locator('.hold-button'));

	await expect(page.locator('.test-offline-wrap')).toBeVisible();
	await expect(page.locator('.test-offline-wrap')).toContainText('Answers saved on this device');
	const queued = await page.evaluate(() =>
		JSON.parse(localStorage.getItem('selftest_pending_grades') || '[]')
	);
	expect(queued).toHaveLength(1);
	expect(queued[0].testId).toBe('offline-e2e');
	expect(queued[0].answers['0']).toBe('Alpha');

	// The connection returns; the retry grades the queued attempt and lands on
	// the normal results page.
	await page.unroute('**/api/test/submit');
	await page.route('**/api/test/submit', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				id: 'offline-e2e',
				score: 1,
				totalQuestions: 2,
				timeTaken: 12,
				results: [
					{
						index: 0,
						correct: true,
						yourAnswer: 'Alpha',
						correctAnswer: 'Alpha',
					},
					{
						index: 1,
						correct: false,
						yourAnswer: null,
						correctAnswer: 'Beta',
					},
				],
				marks: null,
				totalMarks: null,
			}),
		})
	);

	await page.getByRole('button', { name: 'Try again now' }).click();
	await expect(page).toHaveURL(/\/results\?id=offline-e2e/);
	await expect(page.locator('.score-ring-sub')).toContainText('1 of 2 correct');
	const remaining = await page.evaluate(() =>
		JSON.parse(localStorage.getItem('selftest_pending_grades') || '[]')
	);
	expect(remaining).toHaveLength(0);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ queuedBeforeRetry: queued.length, remaining, score: '1/2' }, null, 2),
	});
	expect(errors).toEqual([]);
});
