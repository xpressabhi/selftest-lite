import { expect, test } from '@playwright/test';

// Page-width contract: the header, every page's content column, and the footer
// share one max width (1280px) and one gutter scale, and page-level content
// fills that column instead of re-centering at its own width.
// Spec: docs/superpowers/specs/2026-09-25-consistent-page-width-design.md

const PAGES = [
	{ path: '/', wrap: '.home-wrap' },
	{ path: '/about', wrap: '.about-wrap' },
	{ path: '/blog', wrap: '.blog-wrap' },
	{ path: '/contact', wrap: '.contact-wrap' },
	{ path: '/faq', wrap: '.faq-wrap' },
	{ path: '/practice', wrap: '.practice-hub' },
	{ path: '/privacy', wrap: '.legal-wrap' },
	{ path: '/terms', wrap: '.legal-wrap' },
	{ path: '/hi/about', wrap: '.about-wrap' },
];

const PAGE_WIDTH = 1280;

async function measure(page, wrapSelector) {
	return page.evaluate((wrapSelector) => {
		const round = (value) => Math.round(value);
		const box = (el) => {
			if (!el) {
				return null;
			}
			const rect = el.getBoundingClientRect();
			return {
				left: round(rect.left),
				right: round(rect.right),
				width: round(rect.width),
			};
		};
		const gutterOf = (el) => (el ? getComputedStyle(el).paddingInlineStart : null);
		const header = document.querySelector('.header-inner');
		const container = document.querySelector('main .container');
		const footer = document.querySelector('.footer-inner');
		const wrap = document.querySelector(wrapSelector);
		return {
			clientWidth: document.documentElement.clientWidth,
			scrollWidth: document.documentElement.scrollWidth,
			header: box(header),
			container: box(container),
			footer: box(footer),
			wrap: box(wrap),
			gutters: {
				header: gutterOf(header),
				container: gutterOf(container),
				footer: gutterOf(footer),
			},
		};
	}, wrapSelector);
}

function expectShellColumn(measurement) {
	expect(measurement.header, 'header column missing').not.toBeNull();
	expect(measurement.container, 'page container missing').not.toBeNull();
	expect(measurement.footer, 'footer column missing').not.toBeNull();
	expect(measurement.container.left).toBe(measurement.header.left);
	expect(measurement.container.right).toBe(measurement.header.right);
	expect(measurement.container.left).toBe(measurement.footer.left);
	expect(measurement.container.right).toBe(measurement.footer.right);
}

function expectWrapFillsColumn(measurement) {
	expect(measurement.wrap, 'page content wrap missing').not.toBeNull();
	const gutter = Number.parseFloat(measurement.gutters.container);
	expect(measurement.wrap.left).toBe(measurement.container.left + gutter);
	expect(measurement.wrap.width).toBe(measurement.container.width - gutter * 2);
}

for (const { path, wrap } of PAGES) {
	test(`one column from header to footer on ${path}`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(path);
		await expect(page.locator(wrap)).toBeVisible();

		const desktop = await measure(page, wrap);
		expectShellColumn(desktop);
		expectWrapFillsColumn(desktop);
		expect(desktop.container.width).toBe(Math.min(PAGE_WIDTH, desktop.clientWidth));
		expect(desktop.container.left).toBe(
			Math.round((desktop.clientWidth - desktop.container.width) / 2)
		);
		expect(desktop.gutters.header).toBe(desktop.gutters.container);
		expect(desktop.gutters.footer).toBe(desktop.gutters.container);

		await page.setViewportSize({ width: 1280, height: 800 });
		await page.waitForFunction((width) => window.innerWidth === width, 1280);
		const narrow = await measure(page, wrap);
		expectShellColumn(narrow);
		expectWrapFillsColumn(narrow);
		// Below the max width the column is the viewport: no centered gutter drift.
		expect(narrow.container.left).toBe(0);
		expect(narrow.container.width).toBe(narrow.clientWidth);

		await testInfo.attach('evidence', {
			contentType: 'application/json',
			body: JSON.stringify({ path, desktop, narrow }, null, 2),
		});
	});
}

test('the content column does not move between pages', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	const edges = [];
	for (const { path, wrap } of PAGES) {
		await page.goto(path);
		await expect(page.locator(wrap)).toBeVisible();
		const measurement = await measure(page, wrap);
		expectShellColumn(measurement);
		edges.push({
			path,
			header: measurement.header,
			container: measurement.container,
			footer: measurement.footer,
			gutter: measurement.gutters.container,
		});
	}

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(edges, null, 2),
	});

	const first = edges[0];
	for (const edge of edges.slice(1)) {
		expect(edge.container.left, `container left moved on ${edge.path}`).toBe(first.container.left);
		expect(edge.container.right, `container right moved on ${edge.path}`).toBe(
			first.container.right
		);
	}
});

for (const { path, wrap } of [
	{ path: '/', wrap: '.home-wrap' },
	{ path: '/faq', wrap: '.faq-wrap' },
	{ path: '/privacy', wrap: '.legal-wrap' },
]) {
	test(`phone gutters align and the page never overflows on ${path}`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(path);
		await expect(page.locator(wrap)).toBeVisible();

		const phone = await measure(page, wrap);
		expectShellColumn(phone);
		expectWrapFillsColumn(phone);
		expect(phone.gutters.header).toBe('16px');
		expect(phone.gutters.container).toBe('16px');
		expect(phone.gutters.footer).toBe('16px');
		expect(phone.container.width).toBe(phone.clientWidth);
		expect(phone.scrollWidth).toBeLessThanOrEqual(phone.clientWidth);

		await testInfo.attach('evidence', {
			contentType: 'application/json',
			body: JSON.stringify({ path, phone }, null, 2),
		});
	});
}
