import { expect, test } from '@playwright/test';

// Streak on home: the GitHub-style grid, current-streak header, the
// plain-language explainer in English and Hindi, and the removed results
// panel. Seeded through localStorage; no API keys or backend data needed.

const STREAK_KEY = 'selftest_streak';
const HISTORY_KEY = 'selftest_history';

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

async function seedStreak(page, history = null) {
	await page.addInitScript(
		({ streakKey, historyKey, historyValue }) => {
			const day = (offset) => {
				const date = new Date();
				date.setDate(date.getDate() + offset);
				return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
					date.getDate()
				).padStart(2, '0')}`;
			};
			window.localStorage.setItem(
				streakKey,
				JSON.stringify({
					currentStreak: 2,
					longestStreak: 5,
					lastActiveDate: day(0),
					freezesRemaining: 1,
					streakHistory: [
						{ date: day(-1), quizCount: 1 },
						{ date: day(0), quizCount: 3 },
					],
					totalQuizDays: 11,
				})
			);
			if (historyValue) {
				window.localStorage.setItem(historyKey, historyValue);
			}
		},
		{
			streakKey: STREAK_KEY,
			historyKey: HISTORY_KEY,
			historyValue: history ? JSON.stringify(history) : null,
		}
	);
}

function completedAttempt() {
	return {
		id: 'e2e-streak',
		topic: 'Chemical Reactions and Equations',
		timestamp: 10,
		questions: [
			{ question: 'Q1', options: ['A1', 'B1'], answer: 'A1' },
			{ question: 'Q2', options: ['A2', 'B2'], answer: 'A2' },
		],
		userAnswers: { 0: 'A1', 1: 'B2' },
		score: 1,
		totalQuestions: 2,
		timeTaken: 120,
	};
}

test('home shows the streak card with grid, count and explainer', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 320, height: 700 });
	await seedStreak(page);
	await page.goto('/');

	await expect(page.locator('.streak-card')).toBeVisible();
	await expect(page.locator('.streak-current-value')).toHaveText('2');
	await expect(page.locator('.streak-cell')).toHaveCount(56);
	await expect(page.locator('.streak-cell.active')).toHaveCount(2);
	await expect(page.locator('.streak-cell.today')).toHaveCount(1);
	await expect(page.locator('.streak-meta')).toContainText('Best: 5');
	await expect(page.locator('.streak-explainer')).toContainText(
		'A streak counts days you practice in a row'
	);
	const horizontalOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(horizontalOverflow).toBeLessThanOrEqual(0);

	const evidence = {
		cellCount: await page.locator('.streak-cell').count(),
		activeCells: await page.locator('.streak-cell.active').count(),
		todayCells: await page.locator('.streak-cell.today').count(),
		current: await page.locator('.streak-current-value').textContent(),
		horizontalOverflow,
	};
	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(evidence, null, 2),
	});
});

test('a brand-new visitor sees the empty-state streak card with the explainer', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	// No seeding: fresh localStorage is exactly the first-visit case.
	await page.goto('/');

	await expect(page.locator('.streak-card')).toBeVisible();
	await expect(page.locator('.streak-current-value')).toHaveText('0');
	await expect(page.locator('.streak-cell.active')).toHaveCount(0);
	await expect(page.locator('.streak-empty')).toContainText('Practice today to start your streak');
	await expect(page.locator('.streak-explainer')).toContainText('A streak counts days you practice');

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ emptyStreakCard: true, cells: 56, active: 0 }, null, 2),
	});
});

test('hindi home shows the hindi streak explainer', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await seedStreak(page);
	await page.goto('/hi');

	await expect(page.locator('.streak-card')).toBeVisible();
	await expect(page.locator('.streak-explainer')).toContainText('लगातार अभ्यास');
	await expect(page.locator('.streak-current-value')).toHaveText('2');

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{ explainer: await page.locator('.streak-explainer').textContent() },
			null,
			2
		),
	});
});

test('results page no longer renders the streak panel', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await seedStreak(page, [completedAttempt()]);
	await page.goto('/results?id=e2e-streak');

	await expect(page.locator('.result-hero-card')).toBeVisible();
	await expect(page.locator('.week-strip')).toHaveCount(0);
	await expect(page.getByText('Day Streak')).toHaveCount(0);

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ streakPanels: 0, weekStrips: 0 }, null, 2),
	});
});
