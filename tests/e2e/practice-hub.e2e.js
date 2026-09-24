import { expect, test } from '@playwright/test';

// Practice hub contract: registry-driven category sections, anchor-jump chips,
// and client-side search over the exam catalog. Spec:
// docs/superpowers/specs/2026-09-24-teaching-exam-cluster-design.md

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

test('hub groups exams into labeled sections with jump chips', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await page.goto('/practice');

	const sections = page.locator('.practice-category');
	const chips = page.locator('.practice-chip');
	await expect(sections.first()).toBeVisible();

	const sectionCount = await sections.count();
	const chipCount = await chips.count();
	expect(sectionCount).toBeGreaterThan(1);
	expect(chipCount).toBe(sectionCount);

	// Every chip anchors to exactly one real section.
	for (let index = 0; index < chipCount; index += 1) {
		const href = await chips.nth(index).getAttribute('href');
		expect(href).toMatch(/^#practice-cat-/);
		await expect(page.locator(href)).toHaveCount(1);
	}

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{
				sections: sectionCount,
				chips: chipCount,
				firstHeading: await sections.first().locator('h2').textContent()
			},
			null,
			2
		)
	});
	expect(errors).toEqual([]);
});

test('hub search filters as you type and clear restores the grouped view', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await page.goto('/practice');

	const input = page.locator('#practice-search');
	await input.fill('banking');
	await expect(page.locator('.practice-category')).toHaveCount(0);
	await expect(page.locator('.practice-card', { hasText: 'IBPS PO' })).toBeVisible();
	const resultCount = await page.locator('.practice-card').count();

	await page.locator('.practice-search-clear').click();
	await expect(page.locator('.practice-category').first()).toBeVisible();
	await expect(page.locator('.practice-search-count')).toHaveCount(0);

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ query: 'banking', resultCount }, null, 2)
	});
	expect(errors).toEqual([]);
});

test('search matches syllabus units and Hindi script', async ({ page }) => {
	await page.goto('/practice');
	await page.locator('#practice-search').fill('स्त्री रोग');
	await expect(page.locator('.practice-card', { hasText: 'UPSC CMS' })).toBeVisible();
});

test('search with no matches shows the empty state', async ({ page }) => {
	await page.goto('/practice');
	await page.locator('#practice-search').fill('zzzz');
	await expect(page.locator('.practice-search-empty')).toBeVisible();
	await expect(page.locator('.practice-card')).toHaveCount(0);
});

test('hindi hub renders hindi category labels', async ({ page }) => {
	await page.goto('/hi/practice');
	await expect(
		page.getByRole('heading', { name: 'एसएससी और केंद्रीय सरकारी नौकरियाँ' })
	).toBeVisible();
});

test('search finds the new teaching exams', async ({ page }) => {
	await page.goto('/practice');
	await page.locator('#practice-search').fill('super tet');
	await expect(page.locator('.practice-card', { hasText: 'UP Super TET' })).toBeVisible();
	await page.locator('#practice-search').fill('kvs');
	await expect(page.locator('.practice-card', { hasText: 'KVS PRT/TGT/PGT' })).toBeVisible();
});

test('teaching exam pages render the pattern and syllabus in both languages', async ({ page }) => {
	await page.goto('/practice/up-super-tet');
	await expect(page.getByRole('heading', { name: /UP Super TET/ })).toBeVisible();
	await expect(page.getByText('Teaching Methodology')).toBeVisible();

	await page.goto('/hi/practice/up-super-tet');
	await expect(page.getByText('शिक्षण विधि')).toBeVisible();
	await expect(page.locator('.practice-lead')).toContainText('शिक्षण', { exact: false });
});
