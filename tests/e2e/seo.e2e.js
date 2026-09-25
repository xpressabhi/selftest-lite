import { expect, test } from '@playwright/test';

// SEO head suite: every indexable page type must ship a canonical, x-default
// alternate, robots meta and JSON-LD; noindex app pages must ship none of the
// crawler-pointing tags. Runs against the dev server like the smoke suite.

const ORIGIN = 'https://www.selftest.in';

async function expectIndexableHead(page, path) {
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		`${ORIGIN}${path}`
	);
	await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
		'href',
		`${ORIGIN}${path}`
	);
	await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
		'content',
		`${ORIGIN}${path}`
	);
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
		'content',
		/index, follow/
	);
	await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'en_IN');
	await expect(page.locator('script[type="application/ld+json"]').first()).toBeAttached();
}

test('home ships canonical and schema tags', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle(/selftest\.in/);
	await expectIndexableHead(page, '/');
});

test('exam landing page ships canonical and JSON-LD', async ({ page }) => {
	await page.goto('/practice/ssc-cgl');
	await expect(page).toHaveTitle(/SSC CGL/);
	await expectIndexableHead(page, '/practice/ssc-cgl');
	expect(await page.locator('script[type="application/ld+json"]').count()).toBeGreaterThanOrEqual(
		2
	);
});

test('blog post ships article metadata', async ({ page }) => {
	await page.goto('/blog/how-to-study-effectively');
	await expectIndexableHead(page, '/blog/how-to-study-effectively');
	await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
});

test('faq page ships a FAQPage schema', async ({ page }) => {
	await page.goto('/faq');
	await expectIndexableHead(page, '/faq');
	const schemas = await page.locator('script[type="application/ld+json"]').allTextContents();
	expect(schemas.join('\n')).toMatch(/"@type":\s*"FAQPage"/);
});

test('noindex app pages ship no canonical or og:url', async ({ page }) => {
	await page.goto('/history');
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
	await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
	await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);
});

async function expectHreflangPair(page, englishPath, hindiPath) {
	await expect(page.locator('link[rel="alternate"][hreflang="en-IN"]')).toHaveAttribute(
		'href',
		`${ORIGIN}${englishPath}`
	);
	await expect(page.locator('link[rel="alternate"][hreflang="hi-IN"]')).toHaveAttribute(
		'href',
		`${ORIGIN}${hindiPath}`
	);
	await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
		'href',
		`${ORIGIN}${englishPath}`
	);
}

test('English exam page links to its Hindi twin', async ({ page }) => {
	await page.goto('/practice/ssc-cgl');
	await expectHreflangPair(page, '/practice/ssc-cgl', '/hi/practice/ssc-cgl');
});

test('Hindi exam page renders Hindi with a Hindi canonical', async ({ page }) => {
	await page.goto('/hi/practice/ssc-cgl');
	await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
	await expect(page).toHaveTitle(/मॉक टेस्ट/);
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		`${ORIGIN}/hi/practice/ssc-cgl`
	);
	await expectHreflangPair(page, '/practice/ssc-cgl', '/hi/practice/ssc-cgl');
	await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'hi_IN');
	await expect(page.locator('main, body').first()).toContainText('मात्रात्मक योग्यता');
});

test('Hindi blog index renders Hindi', async ({ page }) => {
	await page.goto('/hi/blog');
	await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
	await expect(page).toHaveTitle(/ब्लॉग/);
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		`${ORIGIN}/hi/blog`
	);
});

test('root favicon.ico is served for crawler fallbacks', async ({ request }) => {
	// Google requests /favicon.ico even when the icon links point at
	// /icons/*; a 404 here showed up in Search Console's Page indexing report.
	// The dev server does not set a content-type for .ico, so assert the icon
	// magic bytes (00 00 01 00) instead of the header.
	const response = await request.get('/favicon.ico');
	expect(response.status()).toBe(200);
	const body = await response.body();
	expect(body.length).toBeGreaterThan(0);
	expect([...body.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
});

test('language toggle navigates between twins and back', async ({ page }) => {
	await page.goto('/about');
	// The first click can land before hydration in dev; retry until it takes.
	await expect(async () => {
		await page.getByRole('button', { name: 'Switch UI language' }).click();
		await expect(page).toHaveURL(/\/hi\/about$/, { timeout: 1000 });
	}).toPass({ timeout: 20000 });
	await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
	await expect(page).toHaveTitle(/के बारे में/);
	await expect(async () => {
		await page.getByRole('button', { name: 'यूआई भाषा बदलें' }).click();
		await expect(page).toHaveURL(/\/about$/, { timeout: 1000 });
	}).toPass({ timeout: 20000 });
	await expect(page).not.toHaveURL(/\/hi\//);
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
