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
	// Submit through the review sheet.
	await page.locator('.test-progress-pill').click();
	await page.getByRole('button', { name: 'Submit Test' }).click();
	await expect(page).toHaveURL(/\/results\?id=e2e-smoke/);
	await expect(page.getByText('3 / 3').first()).toBeVisible();
	expect(errors).toEqual([]);
});
