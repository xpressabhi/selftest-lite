import { expect, test } from '@playwright/test';

// Question formats suite: matching columns and assertion-reasoning papers.
// Spec: docs/superpowers/specs/2026-09-24-question-formats-design.md
//
// Route-mocked and localStorage-seeded: no API keys, no backend rows.

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

async function stubHistoryAndTests(page, tests = []) {
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
				body: JSON.stringify({ tests, hasMore: false }),
			})
	);
}

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

async function seedPaper(page, paper) {
	await page.addInitScript((seed) => {
		window.localStorage.setItem('selftest_question_paper', JSON.stringify(seed));
	}, paper);
}

const MATCHING_KEY = '1-B, 2-D, 3-A, 4-C';

function matchingQuestion(stem = 'Match the vitamin in Column I with the deficiency disease in Column II.') {
	return {
		format: 'matching',
		question: stem,
		rationale: 'Vitamin A prevents night blindness, B1 beriberi, C scurvy, D rickets.',
		columnA: ['Vitamin A', 'Vitamin B1', 'Vitamin C', 'Vitamin D'],
		columnB: ['Scurvy', 'Night blindness', 'Rickets', 'Beriberi'],
		options: [MATCHING_KEY, '1-A, 2-B, 3-C, 4-D', '1-B, 2-C, 3-A, 4-D', '1-D, 2-B, 3-C, 4-A'],
		answer: MATCHING_KEY,
	};
}

const AR_OPTIONS = [
	'Both A and R are true, and R is the correct explanation of A',
	'Both A and R are true, but R is NOT the correct explanation of A',
	'A is true, but R is false',
	'A is false, but R is true',
];

function assertionReasoningQuestion(assertion, reason) {
	return {
		format: 'assertion-reasoning',
		question: '',
		assertion,
		reason,
		rationale: 'Iron displaces copper from copper sulphate, so the keyed statement holds.',
		options: [...AR_OPTIONS],
		answer: AR_OPTIONS[0],
	};
}

test('format picker offers both new formats and requests the picked one', async ({
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
				body: JSON.stringify({ plan: null, topicSource: 'local' }),
			})
	);
	const paper = {
		id: 'e2e-format-pick',
		topic: 'vitamins and deficiency diseases',
		testMode: 'quiz-practice',
		language: 'english',
		questions: [matchingQuestion()],
	};
	let capturedGenerate = null;
	await page.route(
		(url) => url.pathname === '/api/generate',
		async (route) => {
			capturedGenerate = JSON.parse(route.request().postData() || '{}');
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify(paper),
			});
		}
	);
	await page.route(
		(url) => url.pathname === '/api/test' && url.searchParams.get('id') === paper.id,
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ ...paper, myAttempt: null }),
			})
	);

	await page.goto('/');
	await page.locator('.intent-input').click();
	await page.locator('.intent-input').pressSequentially('vitamins and deficiency diseases', {
		delay: 15,
	});
	const card = page.locator('.preview-card');
	await expect(card).toBeVisible();

	await card.getByRole('button', { name: /^Format:/ }).click();
	const picker = card.locator('.format-picker');
	await expect(picker).toBeVisible();
	await expect(picker.getByRole('button', { name: 'Match the Columns' })).toBeVisible();
	await expect(picker.getByRole('button', { name: 'Assertion & Reasoning' })).toBeVisible();

	await picker.getByRole('button', { name: 'Match the Columns' }).click();
	await expect(card.locator('.spec-value').filter({ hasText: 'Match the Columns' })).toBeVisible();

	await card.locator('.generate-btn').click();
	await expect.poll(() => capturedGenerate?.testType).toBe('matching');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				requestedTestType: capturedGenerate?.testType,
				formatsOffered: ['Match the Columns', 'Assertion & Reasoning'],
			},
			null,
			2
		),
	});
	expect(errors).toEqual([]);
});

test('matching paper renders the grid, hint keeps the key, submit scores', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	const paper = {
		id: 'e2e-formats-match',
		topic: 'Vitamin Match',
		testMode: 'quiz-practice',
		language: 'english',
		questions: [
			matchingQuestion('Match question one.'),
			matchingQuestion('Match question two.'),
			matchingQuestion('Match question three.'),
		],
	};
	await seedPaper(page, paper);
	await page.setViewportSize({ width: 390, height: 844 });

	await page.goto('/test');
	await page.getByRole('button', { name: 'Start Test' }).click();

	// Grid: Column I numbered 1-4, Column II lettered A-D, eight aligned cells.
	const grid = page.locator('.question-matching');
	await expect(grid).toBeVisible();
	await expect(grid.locator('.matching-cell')).toHaveCount(8);
	await expect(grid.locator('.matching-key')).toHaveText(['1', '2', '3', '4', 'A', 'B', 'C', 'D']);
	await expect(page.locator('.test-format-chip')).toHaveText('Match the Columns');
	await expect(page.locator('.test-option')).toHaveCount(4);
	const fits = await grid.evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
	expect(fits).toBe(true);
	// The approved mockup targets 320px phones.
	await page.setViewportSize({ width: 320, height: 700 });
	const fitsNarrow = await grid.evaluate(
		(element) => element.scrollWidth <= element.clientWidth + 1
	);
	expect(fitsNarrow).toBe(true);
	await page.setViewportSize({ width: 390, height: 844 });

	// Two unanswered nexts unlock the 50-50 on question three.
	await page.getByRole('button', { name: 'Next' }).click();
	await page.getByRole('button', { name: 'Next' }).click();
	await expect(page.locator('.test-hint')).toBeEnabled();
	await page.locator('.test-hint').click();
	await expect(page.locator('.test-option.eliminated')).toHaveCount(2);

	// The keyed combination survives elimination and can be selected.
	const keyOption = page.locator('.test-option').filter({ hasText: MATCHING_KEY });
	await expect(keyOption).toHaveCount(1);
	await expect(keyOption).not.toHaveClass(/eliminated/);
	await keyOption.click();

	// Answer the two skipped questions correctly, then submit.
	await page.getByRole('button', { name: 'Back' }).click();
	await keyOption.click();
	await page.getByRole('button', { name: 'Back' }).click();
	await keyOption.click();
	await page.locator('.test-progress-pill').click();
	await pressAndHold(page, page.locator('.hold-button'));

	await expect(page).toHaveURL(/\/results\?id=e2e-formats-match/);
	await expect(page.locator('.score-ring-sub')).toContainText('3 of 3 correct');

	// The review card carries the same grid.
	await page.locator('.review-card-head').first().click();
	const reviewGrid = page.locator('.review-card-body .question-matching');
	await expect(reviewGrid).toBeVisible();
	await expect(reviewGrid.locator('.matching-cell')).toHaveCount(8);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				gridCells: 8,
				eliminated: 2,
				keySurvivedHint: true,
				score: '3 of 3',
			},
			null,
			2
		),
	});
	expect(errors).toEqual([]);
});

test('assertion-reasoning paper renders inline labels and scores', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	const paper = {
		id: 'e2e-formats-ar',
		topic: 'Chemical Reactions',
		testMode: 'quiz-practice',
		language: 'english',
		questions: [
			assertionReasoningQuestion(
				'An iron nail dipped in copper sulphate solution turns brown.',
				'Iron is more reactive than copper and displaces it from the solution.'
			),
		],
	};
	await seedPaper(page, paper);

	await page.goto('/test');
	await page.getByRole('button', { name: 'Start Test' }).click();

	const body = page.locator('.question-assertion');
	await expect(body).toBeVisible();
	await expect(body.locator('.ar-line')).toHaveCount(2);
	await expect(body.locator('.ar-line').first()).toContainText('Assertion (A):');
	await expect(body.locator('.ar-line').nth(1)).toContainText('Reason (R):');
	await expect(page.locator('.test-format-chip')).toHaveText('Assertion & Reasoning');
	await expect(page.locator('.test-option')).toHaveCount(4);

	await page.locator('.test-option').filter({ hasText: AR_OPTIONS[0] }).click();
	await page.locator('.test-progress-pill').click();
	await pressAndHold(page, page.locator('.hold-button'));

	await expect(page).toHaveURL(/\/results\?id=e2e-formats-ar/);
	await expect(page.locator('.score-ring-sub')).toContainText('1 of 1 correct');

	await page.locator('.review-card-head').first().click();
	await expect(page.locator('.review-card-body .question-assertion')).toBeVisible();

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ inlineLabels: ['Assertion (A):', 'Reason (R):'], score: '1 of 1' }, null, 2),
	});
	expect(errors).toEqual([]);
});

test('weak-area practice keeps structured format fields', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	const paper = {
		id: 'e2e-formats-weak',
		topic: 'Vitamin Match',
		testMode: 'quiz-practice',
		language: 'english',
		questions: [matchingQuestion('Match question one.'), matchingQuestion('Match question two.')],
	};
	await seedPaper(page, paper);

	await page.goto('/test');
	await page.getByRole('button', { name: 'Start Test' }).click();

	// Question one is answered wrong on purpose; question two is right.
	await page.locator('.test-option').filter({ hasText: '1-A, 2-B, 3-C, 4-D' }).click();
	await page.getByRole('button', { name: 'Next' }).click();
	await page.locator('.test-option').filter({ hasText: MATCHING_KEY }).click();
	await page.locator('.test-progress-pill').click();
	await pressAndHold(page, page.locator('.hold-button'));

	await expect(page).toHaveURL(/\/results\?id=e2e-formats-weak/);
	const practiceCta = page.locator('.hero-cta');
	await expect(practiceCta).toContainText('weak questions');
	await practiceCta.click();
	await expect(page).toHaveURL(/\/test$/);

	const saved = await page.evaluate(() =>
		JSON.parse(window.localStorage.getItem('selftest_question_paper') || 'null')
	);
	const reviewQuestion = saved?.questions?.[0];
	expect(reviewQuestion?.format).toBe('matching');
	expect(reviewQuestion?.columnA).toHaveLength(4);
	expect(reviewQuestion?.columnB).toHaveLength(4);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				format: reviewQuestion?.format,
				columnA: reviewQuestion?.columnA?.length,
				columnB: reviewQuestion?.columnB?.length,
			},
			null,
			2
		),
	});
	expect(errors).toEqual([]);
});
