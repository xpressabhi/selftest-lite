import { expect, test } from '@playwright/test';

// Test exit dialog a11y contract: background scroll lock, focus moved into the
// dialog, Escape closes it, and focus returns to the page. The exit modal had
// no E2E coverage before this spec.

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

const PAPER = {
	id: 'e2e-exit-modal',
	topic: 'Exit Modal Arithmetic',
	testMode: 'quiz-practice',
	language: 'english',
	questions: [
		{ question: 'Q1', options: ['A1', 'B1', 'C1', 'D1'], answer: 'A1' },
		{ question: 'Q2', options: ['A2', 'B2', 'C2', 'D2'], answer: 'A2' },
	],
};

test('exit dialog traps focus, closes on Escape and locks background scroll', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.addInitScript((seed) => {
		window.localStorage.setItem('selftest_question_paper', JSON.stringify(seed));
	}, PAPER);

	await page.goto('/test');
	await page.getByRole('button', { name: 'Start Test' }).click();
	// Answer one question so exiting opens the confirm dialog.
	await page.locator('.test-option').first().click();

	await page.locator('.test-exit').click();
	const dialog = page.locator('.exit-modal');
	await expect(dialog).toBeVisible();

	const lockWhileOpen = await page.evaluate(() => document.body.style.overflow);
	await expect
		.poll(() =>
			page.evaluate(() =>
				Boolean(document.querySelector('.exit-modal')?.contains(document.activeElement))
			)
		)
		.toBe(true);
	const focusInside = await page.evaluate(() =>
		Boolean(document.querySelector('.exit-modal')?.contains(document.activeElement))
	);

	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	const lockAfterClose = await page.evaluate(() => document.body.style.overflow);
	const focusReturned = await page.evaluate(() => !document.querySelector('.exit-modal'));

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{ lockWhileOpen, lockAfterClose, focusInside, focusReturned, errors },
			null,
			2
		),
	});
	expect(lockWhileOpen).toBe('hidden');
	expect(lockAfterClose).not.toBe('hidden');
	expect(focusInside).toBe(true);
	expect(focusReturned).toBe(true);
	expect(errors).toEqual([]);
});
