import { expect, test } from '@playwright/test';
import { connectOrSkip, sqlClient } from './testDb.js';

// Public explainer visitor counter: the stats API records one row per identity
// and returns distinct viewers; the page shows the count from the second.
// Spec: docs/superpowers/specs/2026-10-16-explainer-visitor-counter-design.md

async function seedCounterExplainer(sql, { cacheKey, slug }) {
	await sql`
		INSERT INTO concept_explainers (cache_key, language, concept, payload, slug)
		VALUES (${cacheKey}, 'english', 'e2e counter probe', ${JSON.stringify({
			title: 'Counter Probe Title',
			summary: 'Counter probe summary',
			recipes: [],
			html: '<p id="e2e-counter-marker">counter body</p>',
			css: '',
			js: '',
		})}::jsonb, ${slug})
	`;
}

test('explainer stats records distinct viewers and rejects bad slugs', async ({
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	// Warm the schema through a real API request; the bridge does not create tables.
	await request.get('/api/test?id=1');
	const cacheKey = 'e2e-counter-probe-1';
	const slug = 'e2e-counter-probe-00000001';
	await seedCounterExplainer(sql, { cacheKey, slug });

	const first = await request.get(`/api/explain/stats?slug=${slug}`, {
		headers: { 'x-client-id': 'e2e-counter-client-alpha' },
	});
	expect(first.status()).toBe(200);
	expect(await first.json()).toEqual({ visitors: 1 });

	// The same identity again: refresh only, no new viewer.
	const revisit = await request.get(`/api/explain/stats?slug=${slug}`, {
		headers: { 'x-client-id': 'e2e-counter-client-alpha' },
	});
	expect((await revisit.json()).visitors).toBe(1);

	const second = await request.get(`/api/explain/stats?slug=${slug}`, {
		headers: { 'x-client-id': 'e2e-counter-client-beta' },
	});
	expect((await second.json()).visitors).toBe(2);

	// No identity at all: the count still answers and nothing is recorded.
	const anonymous = await request.get(`/api/explain/stats?slug=${slug}`);
	expect((await anonymous.json()).visitors).toBe(2);

	const missingSlug = await request.get('/api/explain/stats');
	expect(missingSlug.status()).toBe(400);
	expect((await missingSlug.json()).code).toBe('INVALID_SLUG');

	const unknownSlug = await request.get('/api/explain/stats?slug=definitely-missing-00000000');
	expect(unknownSlug.status()).toBe(404);
	expect((await unknownSlug.json()).code).toBe('EXPLAINER_NOT_FOUND');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			firstStatus: first.status(),
			visitorsAfterRevisit: 1,
			visitorsAfterSecond: 2,
			anonymousVisitors: 2,
			missingSlugStatus: missingSlug.status(),
			unknownSlugStatus: unknownSlug.status(),
		}),
	});
});

test('public explain page shows the counter from the second viewer', async ({
	browser,
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	await request.get('/api/test?id=1');
	const cacheKey = 'e2e-counter-probe-2';
	const slug = 'e2e-counter-probe-00000002';
	await seedCounterExplainer(sql, { cacheKey, slug });

	// First viewer: the fetch records them, the line stays hidden.
	const ctx1 = await browser.newContext();
	const page1 = await ctx1.newPage();
	const firstStats = page1.waitForResponse((response) =>
		response.url().includes('/api/explain/stats')
	);
	await page1.goto(`/explain/${slug}`);
	await firstStats;
	await expect(page1.locator('.explainer-header-views')).toHaveCount(0);
	// Server-side truth: exactly one viewer (an identity-less probe never adds rows).
	const afterFirst = await request.get(`/api/explain/stats?slug=${slug}`);
	expect((await afterFirst.json()).visitors).toBe(1);

	// Second viewer (fresh context → fresh device id): the line appears.
	const ctx2 = await browser.newContext();
	const page2 = await ctx2.newPage();
	const secondStats = page2.waitForResponse((response) =>
		response.url().includes('/api/explain/stats')
	);
	await page2.goto(`/explain/${slug}`);
	await secondStats;
	await expect(page2.locator('.explainer-header-views')).toBeVisible();
	await expect(page2.locator('.explainer-header-views')).toHaveText('Viewed by 2 people');

	// The Hindi twin shares the explainer: same count, localized copy, no new viewer.
	const hindiStats = page2.waitForResponse((response) =>
		response.url().includes('/api/explain/stats')
	);
	await page2.goto(`/hi/explain/${slug}`);
	await hindiStats;
	await expect(page2.locator('.explainer-header-views')).toHaveText('इसे 2 लोगों ने देखा है');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({
			visitorsAfterFirst: 1,
			visitorsAfterSecond: 2,
			englishText: 'Viewed by 2 people',
			hindiText: 'इसे 2 लोगों ने देखा है',
		}),
	});
	await ctx1.close();
	await ctx2.close();
});
