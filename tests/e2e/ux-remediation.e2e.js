import { expect, test } from '@playwright/test';

// UX remediation suite: pins the behavior of the fixes from the 2026-10-17
// all-pages UX review. Starting with the unified confirmation dialog — the
// single destructive-action idiom that replaced every native confirm().
// Plan: docs/superpowers/plans/2026-10-17-ux-critique-sweep.md

const HISTORY_KEY = 'selftest_history';
const BOOKMARKED_EXAMS_KEY = 'selftest_bookmarked_exams';

async function stubBackend(page) {
	await page.route(
		(url) => url.pathname === '/api/user/history',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ attempts: [] }),
			})
	);
	// Signed-out state: bookmarks stay local.
	await page.route(
		(url) => url.pathname === '/api/user/state',
		(route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
	);
}

function failOnNativeDialog(page) {
	let seen = false;
	page.on('dialog', async (dialog) => {
		seen = true;
		await dialog.dismiss();
	});
	return () => seen;
}

test('clearing history uses the app dialog with the safe default focused', async ({ page }) => {
	const nativeDialogSeen = failOnNativeDialog(page);
	await stubBackend(page);
	await page.addInitScript((key) => {
		window.localStorage.setItem(
			key,
			JSON.stringify([
				{
					id: 'ux-remediate-1',
					topic: 'Photosynthesis basics',
					totalQuestions: 5,
					timestamp: Date.now(),
				},
			])
		);
	}, HISTORY_KEY);

	await page.goto('/history');
	const clearButton = page.getByRole('button', { name: 'Clear', exact: true });
	await expect(clearButton).toBeVisible();
	await clearButton.click();

	const dialog = page.locator('.confirm-dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

	// Escape cancels and the history survives.
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(page.getByText('Photosynthesis basics').first()).toBeVisible();

	// Confirming clears everything.
	await clearButton.click();
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: 'Clear', exact: true }).click();
	await expect(dialog).toHaveCount(0);
	await expect(page.getByText('Photosynthesis basics')).toHaveCount(0);
	expect(nativeDialogSeen()).toBe(false);
});

test('removing a bookmark uses the app dialog', async ({ page }) => {
	const nativeDialogSeen = failOnNativeDialog(page);
	await stubBackend(page);
	await page.addInitScript((key) => {
		window.localStorage.setItem(key, JSON.stringify(['ssc-cgl']));
	}, BOOKMARKED_EXAMS_KEY);

	await page.goto('/bookmarks');
	const removeButton = page.getByRole('button', { name: /^Remove bookmark:/ });
	await expect(removeButton).toBeVisible();
	await removeButton.click();

	const dialog = page.locator('.confirm-dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

	// Cancel keeps the bookmark.
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(dialog).toHaveCount(0);
	await expect(removeButton).toBeVisible();

	// Confirming removes it.
	await removeButton.click();
	await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
	await expect(dialog).toHaveCount(0);
	await expect(page.getByRole('button', { name: /^Remove bookmark:/ })).toHaveCount(0);
	expect(nativeDialogSeen()).toBe(false);
});
