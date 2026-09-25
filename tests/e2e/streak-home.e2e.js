import { expect, test } from '@playwright/test';

// Queens-style streak card on home: stats row, streak headline, rolling 7-day
// strip graded by tests taken, milestone badge carousel, and the "Stay tuned"
// reminder row gated on a completed test. Seeded through localStorage; no API
// keys or backend data needed.

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

function dayKey(offset) {
	const date = new Date();
	date.setDate(date.getDate() + offset);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
		date.getDate()
	).padStart(2, '0')}`;
}

function defaultStreak() {
	return {
		currentStreak: 4,
		longestStreak: 12,
		lastActiveDate: dayKey(0),
		freezesRemaining: 1,
		streakHistory: [
			{ date: dayKey(-6), quizCount: 1 },
			{ date: dayKey(-4), quizCount: 1 },
			{ date: dayKey(-3), quizCount: 2 },
			{ date: dayKey(-2), quizCount: 3 },
			{ date: dayKey(-1), quizCount: 1 },
			{ date: dayKey(0), quizCount: 1 },
		],
		totalQuizDays: 11,
	};
}

function completedAttempt(id, score, totalQuestions) {
	return {
		id,
		topic: 'Chemical Reactions and Equations',
		timestamp: 10,
		questions: [{ question: 'Q1', options: ['A1', 'B1'], answer: 'A1' }],
		userAnswers: { 0: 'A1' },
		score,
		totalQuestions,
		timeTaken: 120,
	};
}

async function seed(page, { streak = null, history = null } = {}) {
	await page.addInitScript(
		({ streakKey, historyKey, streakValue, historyValue }) => {
			if (streakValue) {
				window.localStorage.setItem(streakKey, streakValue);
			}
			if (historyValue) {
				window.localStorage.setItem(historyKey, historyValue);
			}
		},
		{
			streakKey: STREAK_KEY,
			historyKey: HISTORY_KEY,
			streakValue: streak ? JSON.stringify(streak) : null,
			historyValue: history ? JSON.stringify(history) : null,
		}
	);
}

test('home shows the streak card with stats, graded week and headline', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 320, height: 700 });
	await seed(page, {
		streak: defaultStreak(),
		history: [
			completedAttempt('a', 3, 10),
			completedAttempt('b', 9, 10),
			completedAttempt('c', 1, 2),
		],
	});
	await page.goto('/');

	await expect(page.locator('.streak-card')).toBeVisible();
	await expect(page.locator('.streak-title')).toHaveText('4-day test streak');
	await expect(page.locator('.streak-sub')).toContainText("You're on a roll");

	const stats = page.locator('.streak-stat-value');
	await expect(stats.nth(0)).toHaveText('3');
	await expect(stats.nth(1)).toHaveText('59%');
	await expect(stats.nth(2)).toHaveText('90%');
	await expect(stats.nth(3)).toHaveText('12');

	await expect(page.locator('.streak-day')).toHaveCount(7);
	await expect(page.locator('.streak-ball.level-1')).toHaveCount(4);
	await expect(page.locator('.streak-ball.level-2')).toHaveCount(1);
	await expect(page.locator('.streak-ball.level-3')).toHaveCount(1);
	await expect(page.locator('.streak-day.linked')).toHaveCount(4);
	await expect(page.locator('.streak-day').last()).toHaveClass(/today/);
	await expect(page.locator('.streak-weekdays span')).toHaveCount(7);

	const horizontalOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(horizontalOverflow).toBeLessThanOrEqual(0);

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				title: await page.locator('.streak-title').textContent(),
				stats: await stats.allTextContents(),
				level1: await page.locator('.streak-ball.level-1').count(),
				level2: await page.locator('.streak-ball.level-2').count(),
				level3: await page.locator('.streak-ball.level-3').count(),
				linked: await page.locator('.streak-day.linked').count(),
				horizontalOverflow,
			},
			null,
			2
		),
	});
});

test('a brand-new visitor sees the empty-state card with no reminder row', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await page.goto('/');

	await expect(page.locator('.streak-card')).toBeVisible();
	await expect(page.locator('.streak-title')).toHaveText('0-day test streak');
	await expect(page.locator('.streak-sub')).toHaveClass(/streak-empty/);
	await expect(page.locator('.streak-sub')).toContainText('Practice today to start your streak');

	const stats = page.locator('.streak-stat-value');
	await expect(stats.nth(0)).toHaveText('0');
	await expect(stats.nth(1)).toHaveText('-');
	await expect(stats.nth(2)).toHaveText('-');
	await expect(stats.nth(3)).toHaveText('0');

	await expect(page.locator('.streak-ball')).toHaveCount(7);
	await expect(page.locator('.streak-day.active')).toHaveCount(0);
	await expect(page.locator('.streak-badge')).toHaveCount(4);
	await expect(page.locator('.streak-badge.earned')).toHaveCount(0);
	await expect(page.locator('.streak-reminder')).toHaveCount(0);
	await expect(page.locator('.streak-share')).toHaveCount(0);
	await expect(page.locator('.streak-explainer')).toContainText('at least one test');

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ emptyCard: true, activeDays: 0, reminderRows: 0 }, null, 2),
	});
});

test('badges show earned and locked states and the carousel arrows move', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await seed(page, { streak: defaultStreak() });
	await page.goto('/');

	await expect(page.locator('.streak-badge')).toHaveCount(4);
	await expect(page.locator('.streak-badge.earned')).toHaveCount(2);
	await expect(page.locator('.streak-badge').nth(0)).toContainText('3 days');
	await expect(page.locator('.streak-badge').nth(0)).toContainText('On Fire');
	await expect(page.locator('.streak-badge').nth(1)).toContainText('Week Warrior');
	await expect(page.locator('.streak-badge').nth(2)).toContainText('4/30 days');
	await expect(page.locator('.streak-badge').nth(3)).toContainText('Century');

	const dots = page.locator('.streak-badge-dots span');
	await expect(dots).toHaveCount(4);
	await expect(dots.nth(0)).toHaveClass(/on/);

	await page.getByRole('button', { name: 'Next badge' }).click();
	await expect(dots.nth(1)).toHaveClass(/on/);
	await page.getByRole('button', { name: 'Previous badge' }).click();
	await expect(dots.nth(0)).toHaveClass(/on/);

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				earned: await page.locator('.streak-badge.earned').count(),
				locked: await page.locator('.streak-badge:not(.earned)').count(),
				dots: await dots.count(),
			},
			null,
			2
		),
	});
});

test('the reminder row appears only after a completed test', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await seed(page, {
		streak: defaultStreak(),
		history: [completedAttempt('a', 3, 10)],
	});
	await page.goto('/');

	const reminder = page.locator('.streak-reminder');
	await expect(reminder).toBeVisible();
	await expect(reminder).toContainText('Stay tuned');
	await expect(reminder).toContainText('Daily practice reminders');
	await expect(reminder.locator('input[type="checkbox"]')).not.toBeChecked();

	// Never click the toggle in the default suite: it opens a real permission
	// prompt. Toggle behaviour is covered by the opt-in push e2e run.
	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ reminderVisible: true, checked: false }, null, 2),
	});
});

test('the streak share button sends one PNG with the direct URL in the text', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await page.addInitScript(() => {
		window.__shareCalls = [];
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: async (data) => {
				window.__shareCalls.push({
					files: data?.files?.length || 0,
					name: data?.files?.[0]?.name || '',
					type: data?.files?.[0]?.type || '',
					text: data?.text || '',
				});
			},
		});
		Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
	});
	await seed(page, {
		streak: defaultStreak(),
		history: [completedAttempt('a', 3, 10)],
	});
	await page.goto('/');

	await expect(page.locator('.streak-share')).toBeVisible();
	await page.locator('.streak-share').click();
	await expect.poll(() => page.evaluate(() => window.__shareCalls.length)).toBe(1);

	const call = await page.evaluate(() => window.__shareCalls[0]);
	expect(call.files).toBe(1);
	expect(call.name).toBe('selftest-streak.png');
	expect(call.type).toBe('image/png');
	expect(call.text).toContain("I'm on a 4-day test streak");
	expect(call.text).toContain('http://localhost:5173');

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(call, null, 2),
	});
});

test('without native share the streak card downloads and toasts', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
		Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
	});
	await seed(page, {
		streak: defaultStreak(),
		history: [completedAttempt('a', 3, 10)],
	});
	await page.goto('/');

	const downloadPromise = page.waitForEvent('download');
	await page.locator('.streak-share').click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe('selftest-streak.png');
	await expect(page.locator('.toast-lite')).toContainText('Streak card downloaded');

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ fallback: download.suggestedFilename() }, null, 2),
	});
});

test('hindi home shows hindi streak copy and weekday labels', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await seed(page, { streak: defaultStreak() });
	await page.goto('/hi');

	await expect(page.locator('.streak-card')).toBeVisible();
	await expect(page.locator('.streak-title')).toContainText('टेस्ट स्ट्रीक');
	await expect(page.locator('.streak-explainer')).toContainText('कम से कम एक टेस्ट');
	await expect(page.locator('.streak-weekdays span').first()).toHaveText(/[\u0900-\u097F]/);
	await expect(page.locator('.streak-stat-label').first()).toHaveText('टेस्ट');

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				title: await page.locator('.streak-title').textContent(),
				firstWeekday: await page.locator('.streak-weekdays span').first().textContent(),
			},
			null,
			2
		),
	});
});

test('results page no longer renders the streak panel', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await seed(page, {
		streak: defaultStreak(),
		history: [completedAttempt('e2e-streak', 1, 2)],
	});
	await page.goto('/results?id=e2e-streak');

	await expect(page.locator('.result-hero-card')).toBeVisible();
	await expect(page.locator('.week-strip')).toHaveCount(0);
	await expect(page.locator('.streak-card')).toHaveCount(0);
	await expect(page.getByText('Day Streak')).toHaveCount(0);

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ streakPanels: 0, weekStrips: 0 }, null, 2),
	});
});
