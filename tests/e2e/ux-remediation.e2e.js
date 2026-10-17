import { expect, test } from '@playwright/test';
import { connectOrSkip, sqlClient } from './testDb.js';
import { stubVisualFit } from './visualFit.js';

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

test('history shows a skeleton, not the empty state, while syncing', async ({ page }) => {
	await page.route(
		(url) => url.pathname === '/api/user/history',
		async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 800));
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ attempts: [] }),
			});
		}
	);
	await page.route(
		(url) => url.pathname === '/api/user/state',
		(route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
	);

	await page.goto('/history');
	// First paint is the skeleton, never a "No tests yet" flash before the
	// local + server read settles.
	await expect(page.locator('.history-skeleton')).toBeVisible();
	await expect(page.getByText('No tests yet')).toHaveCount(0);

	await expect(page.locator('.history-skeleton')).toHaveCount(0, { timeout: 5000 });
	await expect(page.getByText('No tests yet')).toBeVisible();
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

test('a paper with no questions shows an empty state, never a crash', async ({
	page,
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	const rows = await sql`
		INSERT INTO ai_test (test, topic, language, num_questions)
		VALUES (
			${JSON.stringify({ topic: 'E2E empty paper', questions: [] })}::jsonb,
			'E2E empty paper',
			'english',
			0
		)
		RETURNING id
	`;
	const testId = rows[0].id;
	const pageErrors = [];
	page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));

	await page.goto(`/test?id=${testId}`);
	await expect(page.getByText('This test has no questions')).toBeVisible({ timeout: 15000 });
	await expect(page.getByRole('link', { name: 'Create New Test' })).toBeVisible();

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ testId, pageErrors }, null, 2),
	});
	expect(pageErrors).toEqual([]);
});

/** Two-question paper: the first question is wrong, the second is correct. */
function personalizePaper() {
	return {
		id: 'ux-personalize',
		topic: 'E2E personalize topic',
		timestamp: 10,
		questions: [
			{ question: 'Q1', options: ['A1', 'B1', 'C1'], answer: 'A1' },
			{ question: 'Q2', options: ['A2', 'B2', 'C2'], answer: 'A2' },
		],
		userAnswers: { 0: 'B1', 1: 'A2' },
		score: 1,
		totalQuestions: 2,
		timeTaken: 24,
	};
}

test('an auto-personalized review filter is announced and reversible', async ({ page }) => {
	await stubVisualFit(page);
	await page.route(
		(url) => url.pathname === '/api/personalize',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					applied: true,
					action: 'fix_mistakes',
					promote: [],
					hide: [],
				}),
			})
	);
	await page.addInitScript(
		({ clientId, history }) => {
			window.localStorage.setItem('selftest_client_id', clientId);
			window.localStorage.setItem('selftest_history', JSON.stringify(history));
		},
		{ clientId: 'ux-personalize-client', history: [personalizePaper()] }
	);

	await page.goto('/results?id=ux-personalize');

	// The auto-applied filter is announced, and it really applied.
	const note = page.locator('.personalize-note');
	await expect(note).toBeVisible();
	await expect(note).toContainText('Showing incorrect answers first');
	await expect(page.locator('#question-0')).toHaveCount(1);
	await expect(page.locator('#question-1')).toHaveCount(0);

	// One tap reverses it.
	await note.getByRole('button', { name: 'Show all answers' }).click();
	await expect(note).toHaveCount(0);
	await expect(page.locator('#question-1')).toHaveCount(1);
});
