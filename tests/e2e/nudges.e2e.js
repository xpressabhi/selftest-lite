import { expect, test } from '@playwright/test';

// Nudge engine contract on the results hero. /api/personalize is route-stubbed
// (no TypeSafe key in CI; the real route fails open), so the decision path is
// deterministic while the ledger, dwell, suppression and share wiring stay
// real. Everything is seeded through localStorage; no backend needed.

const HISTORY_KEY = 'selftest_history';
const LEDGER_KEY = 'selftest_nudge_ledger';
const LANGUAGE_KEY = 'selftest_language';

async function collectErrors(page) {
	const errors = [];
	page.on('console', (message) => {
		if (message.type() !== 'error') {
			return;
		}
		if (/failed to load resource/i.test(message.text())) {
			return;
		}
		if (
			/Rate limit exceeded|Failed to refresh auth session|Failed to fetch user state|Failed to hydrate|navigator\.vibrate|user hasn't tapped/i.test(
				message.text()
			)
		) {
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
		answer: `A${index + 1}`
	};
}

/** Completed attempt: the first `correctCount` questions are answered right. */
function attempt({ id, correctCount = 2, total = 3, timestamp = 10 } = {}) {
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
		timeTaken: 720
	};
}

async function seedResultsPage(page, { history, language = null } = {}) {
	await page.addInitScript(
		({ historyKey, languageKey, historyValue, languageValue }) => {
			window.localStorage.setItem(historyKey, JSON.stringify(historyValue));
			if (languageValue) {
				window.localStorage.setItem(languageKey, languageValue);
			}
		},
		{
			historyKey: HISTORY_KEY,
			languageKey: LANGUAGE_KEY,
			historyValue: history,
			languageValue: language
		}
	);
}

async function stubPersonalize(page, nudge) {
	const requests = [];
	await page.route('**/api/personalize', async (route) => {
		requests.push(route.request().postDataJSON());
		await route.fulfill({
			json: { applied: false, action: null, hide: [], promote: [], nudge }
		});
	});
	return requests;
}

async function stubShare(page) {
	await page.addInitScript(() => {
		window.__shareCalls = [];
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: async (data) => {
				window.__shareCalls.push({
					title: data?.title || '',
					text: data?.text || '',
					url: data?.url || ''
				});
			}
		});
		Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
	});
}

function readLedger(page) {
	return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || 'null'), LEDGER_KEY);
}

const CHALLENGE_NUDGE = { kind: 'challenge_friend', confidence: 'high', suppressed: null };

test('challenge nudge rides the personalize call, waits for the dwell and shares', async ({
	page
}, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await seedResultsPage(page, { history: [attempt({ id: 'e2e-nudge' })] });
	await stubShare(page);
	const requests = await stubPersonalize(page, CHALLENGE_NUDGE);

	await page.goto('/results?id=e2e-nudge');
	await expect(page.locator('.nudge-card')).toBeVisible({ timeout: 9000 });

	// The nudge slice piggybacked the existing focus call.
	expect(requests).toHaveLength(1);
	expect(requests[0].state.nudge).toMatchObject({
		page: 'results',
		testsTotal: 1,
		distinctTestDays: 1
	});

	await expect(page.locator('.nudge-title')).toHaveText('Beat my 2/3');
	await expect(page.locator('.nudge-card .btn')).toHaveText('Challenge a friend');

	await page.locator('.nudge-card .btn').click();
	await expect.poll(() => page.evaluate(() => window.__shareCalls.length)).toBe(1);
	const call = await page.evaluate(() => window.__shareCalls[0]);
	expect(call.text).toContain('I scored 2/3');
	expect(call.url).toContain('/test?id=e2e-nudge');

	const ledger = await readLedger(page);
	expect(ledger.lastShownAt.share).toBeGreaterThan(0);
	expect(ledger.shareUsedAt).toBeGreaterThan(0);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ kind: 'challenge_friend', title: 'Beat my 2/3', ledger }, null, 2)
	});
	expect(errors).toEqual([]);
});

test('dismissing writes the backoff and suppresses the next visit', async ({ page }) => {
	const errors = await collectErrors(page);
	await seedResultsPage(page, { history: [attempt({ id: 'e2e-nudge-dismiss' })] });
	await stubPersonalize(page, CHALLENGE_NUDGE);

	await page.goto('/results?id=e2e-nudge-dismiss');
	await expect(page.locator('.nudge-card')).toBeVisible({ timeout: 9000 });
	await page.getByRole('button', { name: 'Dismiss' }).click();
	await expect(page.locator('.nudge-card')).toHaveCount(0);

	const ledger = await readLedger(page);
	expect(ledger.dismissals.share).toBe(1);
	expect(ledger.lastDismissedAt.share).toBeGreaterThan(0);

	// A later visit still receives the decision, but the local backoff wins.
	await page.reload();
	await page.waitForTimeout(6000);
	await expect(page.locator('.nudge-card')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('a wait decision never surfaces a card', async ({ page }) => {
	const errors = await collectErrors(page);
	await seedResultsPage(page, { history: [attempt({ id: 'e2e-nudge-wait' })] });
	await stubPersonalize(page, { kind: null, confidence: null, suppressed: 'wait' });

	await page.goto('/results?id=e2e-nudge-wait');
	await expect(page.locator('.result-hero-card')).toBeVisible();
	await page.waitForTimeout(6000);
	await expect(page.locator('.nudge-card')).toHaveCount(0);

	expect(errors).toEqual([]);
});

test('hindi learners get the hindi nudge copy', async ({ page }) => {
	const errors = await collectErrors(page);
	await seedResultsPage(page, {
		history: [attempt({ id: 'e2e-nudge-hi' })],
		language: 'hindi'
	});
	await stubPersonalize(page, CHALLENGE_NUDGE);

	await page.goto('/results?id=e2e-nudge-hi');
	await expect(page.locator('.nudge-card')).toBeVisible({ timeout: 9000 });
	await expect(page.locator('.nudge-title')).toContainText('मेरा 2/3');
	await expect(page.locator('.nudge-card .btn')).toContainText('दोस्त को चुनौती दें');

	expect(errors).toEqual([]);
});
