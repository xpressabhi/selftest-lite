import { expect, test } from '@playwright/test';

// Papers with 40+ questions are measured in a module worker (OffscreenCanvas
// + Pretext) so the main thread stays free. This seeds one and checks both the
// estimate and that the worker path actually produced it.
test('large papers estimate pagination in a worker', async ({ page }, testInfo) => {
	await page.addInitScript((paper) => {
		window.localStorage.setItem('selftest_history', JSON.stringify([paper]));
	}, {
		id: 'e2e-print-worker',
		topic: 'Worker pagination',
		timestamp: Date.now(),
		questions: Array.from({ length: 45 }, (_unused, index) => ({
			question: `Question ${index + 1}: explain the process and give one example.`,
			options: ['Option A', 'Option B', 'Option C', 'Option D'],
			answer: 'Option A',
		})),
	});

	await page.goto('/print?t=e2e-print-worker');

	await expect(page.locator('.print-question')).toHaveCount(45);
	await expect(page.locator('.print-paper')).toHaveAttribute(
		'data-layout-source',
		'worker',
		{ timeout: 20000 }
	);
	await expect(page.locator('.print-pages')).toContainText('≈', { timeout: 20000 });

	const evidence = {
		source: await page.locator('.print-paper').getAttribute('data-layout-source'),
		pages: (await page.locator('.print-pages').textContent()).trim(),
		questions: await page.locator('.print-question').count(),
	};
	expect(evidence.questions).toBe(45);
	expect(evidence.pages).toContain('≈');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(evidence, null, 2),
	});
});
