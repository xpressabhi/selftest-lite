import { expect, test } from '@playwright/test';

// Share cards beyond the streak card: the test page share sends one PNG plus
// the recipient-openable /test?id= URL. Seeded through localStorage; no API
// keys or backend data needed.

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

function seededPaper() {
	return {
		id: 'e2e-share-test',
		topic: 'Chemical Reactions and Equations',
		testMode: 'quiz-practice',
		difficulty: 'intermediate',
		language: 'english',
		questions: [
			{ question: 'Q1', options: ['A1', 'B1', 'C1', 'D1'], answer: 'A1' },
			{ question: 'Q2', options: ['A2', 'B2', 'C2', 'D2'], answer: 'A2' },
			{ question: 'Q3', options: ['A3', 'B3', 'C3', 'D3'], answer: 'C3' },
		],
	};
}

async function stubShare(page) {
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
}

test('test page share sends one PNG with the direct test URL in the text', async ({
	page,
}, testInfo) => {
	const errors = await collectErrors(page);
	await stubShare(page);
	await page.addInitScript((seed) => {
		window.localStorage.setItem('selftest_question_paper', JSON.stringify(seed));
	}, seededPaper());
	await page.goto('/test');

	const shareButton = page.getByRole('button', { name: 'Share' });
	await expect(shareButton).toBeVisible();
	await shareButton.click();
	await expect.poll(() => page.evaluate(() => window.__shareCalls.length)).toBe(1);

	const call = await page.evaluate(() => window.__shareCalls[0]);
	expect(call.files).toBe(1);
	expect(call.name).toBe('selftest-test.png');
	expect(call.type).toBe('image/png');
	expect(call.text).toContain('/test?id=e2e-share-test');
	expect(call.text).toContain('Chemical Reactions and Equations');
	expect(call.text).toContain('http://localhost:5173');

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(call, null, 2),
	});
});
