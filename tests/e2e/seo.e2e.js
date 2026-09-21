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
