import { expect, test } from '@playwright/test';

// Spotlight results hero: comparison-pill states, the adaptive CTA, the share
// sheet, relocated controls (auto-explain, rating, reminder, print, retake),
// and data-saver behaviour. Everything is seeded through localStorage; no API
// keys or backend data needed.

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

function question(index) {
	return {
		question: `Q${index + 1}`,
		options: [`A${index + 1}`, `B${index + 1}`, `C${index + 1}`],
		answer: `A${index + 1}`,
	};
}

/** Completed attempt: the first `correctCount` questions are answered right. */
function attempt({ id, correctCount = 2, total = 3, timestamp = 10 }) {
	const questions = Array.from({ length: total }, (_, index) => question(index));
	const userAnswers = {};
	questions.forEach((item, index) => {
		userAnswers[index] = index < correctCount ? item.answer : `B${index + 1}`;
	});
	return {
		id,
		topic: 'Chemical Reactions and Equations',
		timestamp,
		questions,
		userAnswers,
		score: correctCount,
		totalQuestions: total,
		timeTaken: 720,
	};
}

/** Previous completed attempt with a known percentage, for comparison maths. */
function previous({ id, score, total, timestamp = 1 }) {
	return {
		id,
		topic: 'Previous attempt',
		timestamp,
		userAnswers: {},
		score,
		totalQuestions: total,
	};
}

async function seedHistory(page, history) {
	await page.addInitScript(
		({ key, value }) => window.localStorage.setItem(key, value),
		{ key: HISTORY_KEY, value: JSON.stringify(history) }
	);
}

test('hero leads with the score, comparison, and one next step', async ({ page }) => {
	const errors = await collectErrors(page);
	const testInfo = test.info();
	await page.setViewportSize({ width: 390, height: 844 });
	await seedHistory(page, [attempt({ id: 'e2e-hero', correctCount: 2, total: 3 })]);
	await page.goto('/results?id=e2e-hero');

	await expect(page.locator('.result-hero-card')).toBeVisible();
	await expect(page.locator('.score-ring-pct')).toHaveText('67%');
	await expect(page.locator('.score-ring-sub')).toHaveText('2 of 3 correct');
	await expect(page.locator('.hero-compare')).toHaveText('First test: baseline saved');
	await expect(page.locator('.hero-cta')).toContainText('Practice 1 weak questions');

	// The follow-up loops stay one tap away, without button chrome.
	await expect(page.locator('.hero-links')).toContainText('Review wrong answers');
	// One CTA per intent: the practice CTA lives on .hero-cta, not repeated here.
	await expect(page.locator('.hero-links')).not.toContainText('Practice more');
	await expect(page.locator('.hero-links')).toContainText('New quiz');

	// Utilities and settings live in the quiet rows, not in the hero.
	await expect(page.locator('.hero-utility')).toContainText('Print');
	await expect(page.locator('.hero-utility')).toContainText('Retake');
	await expect(page.locator('.hero-utility')).toContainText('Test ID: e2e-hero');
	await expect(page.locator('.auto-explain-row')).toBeVisible();
	await expect(page.locator('.result-footer')).toContainText('Was this test useful?');

	await page.screenshot({ path: 'test-results/results-hero-mobile.png' });
	await testInfo.attach('results-hero-mobile', {
		path: 'test-results/results-hero-mobile.png',
		contentType: 'image/png',
	});
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				percentage: '67%',
				correctLine: '2 of 3 correct',
				cta: 'Practice 1 weak questions',
				utility: ['Print', 'Retake', 'Test ID'],
			},
			null,
			2
		),
	});
	expect(errors).toEqual([]);
});

const comparisonCases = [
	{
		name: 'personal best',
		previous: [previous({ id: 'p1', score: 1, total: 3 })],
		expected: 'Personal best',
	},
	{
		// Best 100%, average 60%: the attempt is ahead of the average but not a best.
		name: 'ahead of the average',
		previous: [
			previous({ id: 'p1', score: 3, total: 3 }),
			previous({ id: 'p2', score: 1, total: 5 }),
		],
		expected: '+7% vs your average',
	},
	{
		name: 'behind the average',
		previous: [previous({ id: 'p1', score: 3, total: 3 })],
		expected: '33% vs your average',
	},
	{
		name: 'same as the average',
		previous: [previous({ id: 'p1', score: 2, total: 3 })],
		expected: '= Same as your average',
	},
];

for (const testCase of comparisonCases) {
	test(`comparison pill: ${testCase.name}`, async ({ page }) => {
		// The current attempt is in history too: the pill must ignore it.
		await seedHistory(page, [attempt({ id: 'e2e-compare' }), ...testCase.previous]);
		await page.goto('/results?id=e2e-compare');
		await expect(page.locator('.hero-compare')).toHaveText(testCase.expected);
	});
}

test('a perfect attempt swaps the CTA to practice more', async ({ page }) => {
	const errors = await collectErrors(page);
	await seedHistory(page, [attempt({ id: 'e2e-perfect', correctCount: 3, total: 3 })]);
	await page.goto('/results?id=e2e-perfect');

	await expect(page.locator('.score-ring-sub')).toHaveText('3 of 3 correct');
	await expect(page.locator('.hero-cta')).toContainText('Practice more questions');
	await expect(page.locator('.hero-links')).not.toContainText('Review wrong answers');
	await expect(page.locator('.hero-links')).toContainText('New quiz');
	expect(errors).toEqual([]);
});

test('share sheet routes link and card sharing, and dismisses cleanly', async ({ page }) => {
	const errors = await collectErrors(page);
	await page.addInitScript(() => {
		window.__shareCalls = [];
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: async (data) => {
				window.__shareCalls.push({
					kind: data?.files?.length ? 'card' : 'link',
					text: data?.text || '',
					url: data?.url || '',
				});
			},
		});
		Object.defineProperty(navigator, 'canShare', {
			configurable: true,
			value: () => true,
		});
	});
	// A numeric id is the stored-paper case where the card carries the
	// challenge URL; local history resolves it without a server call.
	await seedHistory(page, [attempt({ id: 4242 })]);
	await page.goto('/results?id=4242');

	const shareButton = page.locator('.hero-share');
	const sheet = page.locator('.hero-share-sheet');

	await shareButton.click();
	await expect(sheet).toBeVisible();
	await expect(page.getByRole('menuitem', { name: 'Share result link' })).toBeFocused();

	await page.getByRole('menuitem', { name: 'Share result link' }).click();
	await expect(sheet).toHaveCount(0);
	await expect(shareButton).toBeFocused();

	await shareButton.click();
	await page.getByRole('menuitem', { name: 'Share score card' }).click();
	await expect(sheet).toHaveCount(0);

	// The card share draws the canvas first, so poll instead of asserting once.
	await expect
		.poll(() => page.evaluate(() => window.__shareCalls.map((call) => call.kind)))
		.toEqual(['link', 'card']);
	const cardShare = await page.evaluate(() =>
		window.__shareCalls.find((call) => call.kind === 'card')
	);
	expect(cardShare.text).toContain('/test?id=4242');

	// Escape closes and returns focus to the trigger.
	await shareButton.click();
	await expect(sheet).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(sheet).toHaveCount(0);
	await expect(shareButton).toBeFocused();

	// A tap outside closes it too.
	await shareButton.click();
	await expect(sheet).toBeVisible();
	await page.locator('.hero-topic').click();
	await expect(sheet).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('data saver keeps the hero static and disables auto-explain', async ({ page }) => {
	const errors = await collectErrors(page);
	await page.addInitScript(() => window.localStorage.setItem('dataSaverMode', 'true'));
	await seedHistory(page, [attempt({ id: 'e2e-saver' })]);
	await page.goto('/results?id=e2e-saver');

	await expect(page.locator('html')).toHaveClass(/data-saver/);
	await expect(page.locator('.auto-explain-row input')).toBeDisabled();
	// No count-up: the final value is rendered straight away.
	await expect(page.locator('.score-ring-pct')).toHaveText('67%');
	await expect(page.locator('.score-ring')).toHaveClass(/settled/);
	expect(errors).toEqual([]);
});

test('results page leaves out the topic mastery and review queue panels', async ({ page }) => {
	const errors = await collectErrors(page);
	// Two attempts on one topic would have fed both panels: mastery (topic
	// grouping) and the review queue (latest accuracy 67% is due today).
	await seedHistory(page, [
		attempt({ id: 'e2e-declutter', correctCount: 2, total: 3, timestamp: 10 }),
		attempt({ id: 'e2e-declutter-prev', correctCount: 1, total: 3, timestamp: 1 }),
	]);
	await page.goto('/results?id=e2e-declutter');

	await expect(page.locator('.result-hero-card')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Topic Mastery' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Review Queue' })).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('print opens a clean, chrome-free paper page', async ({ page }) => {
	const errors = await collectErrors(page);
	await seedHistory(page, [attempt({ id: 'e2e-print', correctCount: 2, total: 3 })]);
	await page.goto('/results?id=e2e-print');

	await page.locator('.hero-utility').getByRole('button', { name: 'Print' }).click();
	await expect(page).toHaveURL(/\/print\?t=e2e-print$/);

	// The paper renders as the taker saw it: stems and options, no score or
	// answers, and no app chrome around it.
	await expect(page.locator('.print-paper')).toBeVisible();
	await expect(page.locator('.print-question')).toHaveCount(3);
	await expect(page.locator('.print-question').first()).toContainText('Q1');
	await expect(page.locator('.print-question').first()).toContainText('A1');
	await expect(page.locator('.print-question').first()).toContainText('B1');
	await expect(page.locator('.app-header')).toHaveCount(0);
	await expect(page.locator('.bottom-nav')).toHaveCount(0);
	await expect(page.locator('.print-btn')).toBeVisible();
	expect(errors).toEqual([]);
});
