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
	expect(call.text).toContain(new URL(page.url()).origin);

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(call, null, 2),
	});
});

test('without native share the test card downloads and toasts', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
		Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
	});
	await page.addInitScript((seed) => {
		window.localStorage.setItem('selftest_question_paper', JSON.stringify(seed));
	}, seededPaper());
	await page.goto('/test');

	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Share' }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe('selftest-test.png');
	await expect(page.locator('.toast-lite')).toContainText('Test card downloaded');

	expect(errors).toEqual([]);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ fallback: download.suggestedFilename() }, null, 2),
	});
});

// The renderers wrap text with canvas measurements, so a jsdom unit test
// cannot exercise them. Paint all three in a real browser with long Hindi
// copy, a ZWJ emoji cluster and an unbroken URL, and check opaque pixels.
test('share cards paint measured Hindi and emoji copy', async ({ page }, testInfo) => {
	await page.goto('/');

	const result = await page.evaluate(async () => {
		const { drawTestCard } = await import('/src/lib/client/testCard.js');
		const { drawScoreCard } = await import('/src/lib/client/scoreCard.js');
		const { drawStreakCard } = await import('/src/lib/client/streakCard.js');
		const { drawPaperCard } = await import('/src/lib/client/paperCard.js');

		const topic =
			'रसायन विज्ञान: अम्ल, क्षार और लवण की पहचान 👨‍👩‍👧‍👦🧪 ' +
			'Photosynthesis and cellular respiration in plants. '.repeat(8);
		const url = `https://selftest.in/test?id=${'a'.repeat(140)}`;
		const canvas = document.createElement('canvas');
		canvas.width = 1080;
		canvas.height = 1920;
		const ctx = canvas.getContext('2d');

		const testOk = drawTestCard(canvas, {
			kicker: 'Practice test',
			topic,
			chips: ['Class 10', 'NCERT', '20 questions'],
			cta: 'Try it',
			ctaSub: 'Free · 10 questions',
			url,
		});
		const testAlpha = ctx.getImageData(540, 580, 1, 1).data[3];

		const scoreOk = drawScoreCard(canvas, {
			topic,
			score: 8,
			total: 10,
			pct: 80,
			timeLabel: '3:20',
			challenge: 'Beat my score on this paper',
			link: url,
		});
		const scoreAlpha = ctx.getImageData(540, 1220, 1, 1).data[3];

		const streakOk = drawStreakCard(canvas, {
			headline: '7 day streak',
			subtitle: topic,
			week: [],
			stats: { tests: 12, accuracy: '78%', best: '92%', max: 21 },
			labels: { tests: 'tests', accuracy: 'accuracy', best: 'best', max: 'longest' },
			badges: [{ meta: '5', title: 'Streak', earned: true }],
			url,
		});
		const streakAlpha = ctx.getImageData(540, 545, 1, 1).data[3];
		const footerAlpha = ctx.getImageData(540, 1690, 1, 1).data[3];

		const paperOk = drawPaperCard(canvas, {
			kicker: 'Practice paper',
			topic,
			meta: ['10 Questions', 'Section A'],
			questions: [
				'Explain why chlorophyll appears green and what that means for photosynthesis.',
				'Compare the light-dependent reactions with the Calvin cycle.',
				'रसायन विज्ञान में अम्ल और क्षार की पहचान कैसे करें? 🧪',
			],
			cta: 'Try it',
			ctaSub: 'Open the link to attempt the same questions',
			url,
		});
		const paperAlpha = ctx.getImageData(540, 390, 1, 1).data[3];

		return {
			testOk,
			scoreOk,
			streakOk,
			paperOk,
			testAlpha,
			scoreAlpha,
			streakAlpha,
			footerAlpha,
			paperAlpha,
		};
	});

	expect(result.testOk).toBe(true);
	expect(result.scoreOk).toBe(true);
	expect(result.streakOk).toBe(true);
	expect(result.paperOk).toBe(true);
	expect(result.testAlpha).toBeGreaterThan(0);
	expect(result.scoreAlpha).toBeGreaterThan(0);
	expect(result.streakAlpha).toBeGreaterThan(0);
	expect(result.footerAlpha).toBeGreaterThan(0);
	expect(result.paperAlpha).toBeGreaterThan(0);

	// Rich-inline (the section banner's mixed fonts) loads from its own subpath.
	const rich = await page.evaluate(async () => {
		const { measureRichInlineLines } = await import('/src/lib/client/pretextLayout.js');
		return measureRichInlineLines(
			[
				{ text: 'Section 1 of 2 ', font: '700 12px sans-serif', extraWidth: 4 },
				{ text: 'Some Physics ', font: '700 14px sans-serif', extraWidth: 4 },
				{ text: '1 mark each ', font: '700 12px sans-serif', extraWidth: 4 },
			],
			120
		);
	});
	expect(rich.lineCount).toBeGreaterThan(1);
	expect(rich.maxLineWidth).toBeGreaterThan(0);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(result, null, 2),
	});
});

test('print page shares a paper preview card', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await stubShare(page);
	await page.addInitScript((seed) => {
		window.localStorage.setItem('selftest_history', JSON.stringify([seed]));
	}, seededPaper());
	await page.goto('/print?t=e2e-share-test');

	await page.getByRole('button', { name: 'Share paper preview' }).click();
	await expect.poll(() => page.evaluate(() => window.__shareCalls.length)).toBe(1);

	const call = await page.evaluate(() => window.__shareCalls[0]);
	expect(call.files).toBe(1);
	expect(call.name).toBe('selftest-paper.png');
	expect(call.type).toBe('image/png');
	expect(call.text).toContain('/test?id=e2e-share-test');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(call, null, 2),
	});
	expect(errors).toEqual([]);
});
