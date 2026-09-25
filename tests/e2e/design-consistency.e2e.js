import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { connectOrSkip, sqlClient } from './testDb.js';

// Design-consistency contract: every public surface lays out without
// horizontal page overflow, without content crossing the viewport edge,
// without clipped nowrap text, and with >=44px controls at phone (390),
// tablet (768) and desktop (1280) widths. This is the guard that keeps the
// "one coherent layout system" promise from silently regressing.

const WIDTHS = [390, 768, 1280];
const SHELL_WIDTHS = [390, 768, 1024, 1280, 1920];

const ROUTES = [
	'/',
	'/hi',
	'/practice',
	'/about',
	'/blog',
	'/faq',
	'/contact',
	'/privacy',
	'/terms',
	'/history',
	'/bookmarks',
	'/profile',
	'/exam-paper',
];

const ROUTES_DIR = fileURLToPath(new URL('../../src/routes/', import.meta.url));
const DYNAMIC_ROUTE_FIXTURES = {
	'[examId]': 'ssc-cgl',
	'[slug]': 'how-to-study-effectively',
};

function findRoutePageFiles(directory = ROUTES_DIR) {
	return readdirSync(directory, { withFileTypes: true })
		.flatMap((entry) => {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) return findRoutePageFiles(path);
			return entry.name === '+page.svelte' ? [path] : [];
		})
		.sort();
}

function routeUrlForFile(file) {
	const routeDirectory = relative(ROUTES_DIR, file)
		.replaceAll('\\', '/')
		.replace(/\+page\.svelte$/, '');
	const segments = routeDirectory
		.split('/')
		.filter(Boolean)
		.map((segment) =>
			segment.startsWith('[') ? DYNAMIC_ROUTE_FIXTURES[segment] || 'layout-probe' : segment
		);
	return `/${segments.join('/')}`.replace(/\/$/, '') || '/';
}

const ROUTE_PAGE_FILES = findRoutePageFiles();
const SHELL_ROUTES = [
	...new Set([
		...ROUTE_PAGE_FILES.map(routeUrlForFile).filter((route) => route !== '/test'),
		'/blog/not-a-real-layout-probe',
	]),
].sort();

async function stubBackend(page) {
	await page.route(
		(url) => url.pathname === '/api/user/history',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ attempts: [] }),
			})
	);
	await page.route(
		(url) => url.pathname === '/api/test',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ tests: [], hasMore: false }),
			})
	);
	await page.route(
		(url) => url.pathname === '/api/test/stats',
		(route) =>
			route.fulfill({
				status: 404,
				contentType: 'application/json',
				body: JSON.stringify({}),
			})
	);
}

// Runs inside the page. A single self-contained function so Playwright can
// serialise it. Skips intentionally scrollable/clipped ancestors.
function auditLayout() {
	const vw = window.innerWidth;
	const doc = document.documentElement;

	const scrollX = (el) => {
		const value = getComputedStyle(el).overflowX;
		return value === 'auto' || value === 'scroll' || value === 'hidden' || value === 'clip';
	};
	const insideScrollable = (el) => {
		let parent = el.parentElement;
		while (parent && parent !== document.body) {
			if (scrollX(parent)) return true;
			parent = parent.parentElement;
		}
		return false;
	};
	const isHidden = (el) => {
		const cs = getComputedStyle(el);
		return (
			cs.display === 'none' ||
			cs.visibility === 'hidden' ||
			cs.clipPath === 'inset(50%)' ||
			el.classList.contains('visually-hidden') ||
			el.classList.contains('sr-only')
		);
	};

	const overflowing = [];
	const clippedText = [];
	for (const el of document.body.querySelectorAll('*')) {
		if (el.tagName === 'SVG' || el.closest('svg')) continue;
		if (isHidden(el)) continue;
		const rect = el.getBoundingClientRect();
		if (rect.width < 2 || rect.height < 2) continue;
		if (!insideScrollable(el) && (rect.right > vw + 1 || rect.left < -1)) {
			overflowing.push({
				tag: el.tagName.toLowerCase(),
				class: String(el.className || '').slice(0, 80),
				left: Math.round(rect.left),
				right: Math.round(rect.right),
				text: (el.textContent || '').trim().slice(0, 40),
			});
		}
		const cs = getComputedStyle(el);
		if (
			cs.whiteSpace === 'nowrap' &&
			cs.textOverflow !== 'ellipsis' &&
			el.children.length === 0 &&
			(cs.overflowX === 'hidden' || cs.overflowX === 'clip') &&
			rect.width > 0 &&
			el.scrollWidth > el.clientWidth + 1
		) {
			clippedText.push({
				class: String(el.className || '').slice(0, 80),
				text: (el.textContent || '').trim().slice(0, 40),
				clientWidth: el.clientWidth,
				scrollWidth: el.scrollWidth,
			});
		}
	}

	// Controls only. Inline prose links are an accepted exception (WCAG 2.5.8
	// target-size exception for inline links). Checkboxes/radios are exempt
	// when their wrapping label is the real hit target.
	const smallControls = [];
	for (const el of document.querySelectorAll(
		'button, input, select, textarea, .btn, .chip, [role="button"]'
	)) {
		if (isHidden(el)) continue;
		if (el.matches('input[type="checkbox"], input[type="radio"]') && el.closest('label')) {
			continue;
		}
		const rect = el.getBoundingClientRect();
		if (rect.width < 2 || rect.height < 2) continue;
		// 0.5px tolerance for sub-pixel layout rounding.
		if (rect.height < 43.5) {
			smallControls.push({
				tag: el.tagName.toLowerCase(),
				class: String(el.className || '').slice(0, 80),
				height: Math.round(rect.height),
				text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30),
			});
		}
	}

	// Deduplicate repeated offenders (icon grids, list rows).
	const unique = (items, key) => {
		const seen = new Set();
		return items.filter((item) => {
			const value = key(item);
			if (seen.has(value)) return false;
			seen.add(value);
			return true;
		});
	};

	return {
		overflowX: doc.scrollWidth - doc.clientWidth,
		overflowing: unique(
			overflowing,
			(item) => `${item.class}|${item.left}|${item.right}`
		).slice(0, 8),
		clippedText: unique(clippedText, (item) => item.class).slice(0, 8),
		smallControls: unique(smallControls, (item) => `${item.class}|${item.height}`).slice(0, 8),
	};
}

// Shell contract. Direct-child selectors ensure a nested layout component can
// never hide a missing or malformed route root.
function auditDesktopShell() {
	const viewportWidth = window.innerWidth;
	const round = (value) => Math.round(value * 100) / 100;
	const box = (element) => {
		if (!element) return null;
		const rect = element.getBoundingClientRect();
		return {
			left: round(rect.left),
			right: round(rect.right),
			width: round(rect.width),
		};
	};
	const page = document.querySelector('main > .app-container, main > .test-shell');
	const header = document.querySelector('.header-inner');
	const footer = document.querySelector('.footer-inner');
	const shells = { page, header, footer };
	const issues = [];

	const nestedShells = page
		? [...page.querySelectorAll('.app-container')].map((element) => ({
				class: String(element.className || '').slice(0, 80),
			}))
		: [];
	if (nestedShells.length > 0) {
		issues.push({ code: 'nested-shell', elements: nestedShells.slice(0, 4) });
	}

	for (const [name, element] of Object.entries(shells)) {
		if (!element) {
			issues.push({ code: 'missing-shell', shell: name });
			continue;
		}
		if (!element.classList.contains('app-container')) {
			issues.push({ code: 'missing-shared-class', shell: name });
		}
		const width = element.getBoundingClientRect().width;
		if (width > 1280.5) {
			issues.push({ code: 'shell-too-wide', shell: name, width: round(width) });
		}
	}

	const expectedGutter = viewportWidth >= 1024 ? 32 : viewportWidth >= 640 ? 24 : 16;
	for (const [name, element] of Object.entries(shells)) {
		if (!element) continue;
		const styles = getComputedStyle(element);
		const paddingLeft = Math.round(Number.parseFloat(styles.paddingLeft) || 0);
		const paddingRight = Math.round(Number.parseFloat(styles.paddingRight) || 0);
		if (paddingLeft !== expectedGutter || paddingRight !== expectedGutter) {
			issues.push({
				code: 'wrong-gutter',
				shell: name,
				expected: expectedGutter,
				actual: [paddingLeft, paddingRight],
			});
		}
	}

	const pageBox = box(page);
	if (pageBox) {
		const expectedWidth = Math.min(viewportWidth, 1280);
		const expectedLeft = (viewportWidth - expectedWidth) / 2;
		if (Math.abs(pageBox.left - expectedLeft) > 0.5) {
			issues.push({
				code: 'shell-not-centered',
				shell: 'page',
				expectedLeft: round(expectedLeft),
				actualLeft: pageBox.left,
			});
		}
		for (const name of ['header', 'footer']) {
			const shellBox = box(shells[name]);
			if (!shellBox) continue;
			if (Math.abs(shellBox.left - pageBox.left) > 0.5) {
				issues.push({
					code: 'left-edge-mismatch',
					shell: name,
					pageLeft: pageBox.left,
					actualLeft: shellBox.left,
				});
			}
			if (Math.abs(shellBox.right - pageBox.right) > 0.5) {
				issues.push({
					code: 'right-edge-mismatch',
					shell: name,
					pageRight: pageBox.right,
					actualRight: shellBox.right,
				});
			}
		}
	}

	return {
		viewportWidth,
		expectedGutter,
		page: pageBox,
		header: box(header),
		footer: box(footer),
		issues,
	};
}

function auditImmersiveShell() {
	const viewportWidth = window.innerWidth;
	const shell = document.querySelector('main > .test-shell.app-container');
	const issues = [];
	if (!shell) {
		return { viewportWidth, shell: null, issues: [{ code: 'missing-test-shell' }] };
	}
	const nestedShells = [...shell.querySelectorAll('.app-container')].map(
		(element) => ({
			class: String(element.className || '').slice(0, 80),
		})
	);
	if (nestedShells.length > 0) {
		issues.push({ code: 'nested-shell', elements: nestedShells.slice(0, 4) });
	}

	const rect = shell.getBoundingClientRect();
	const box = {
		left: Math.round(rect.left * 100) / 100,
		right: Math.round(rect.right * 100) / 100,
		width: Math.round(rect.width * 100) / 100,
	};
	const expectedWidth = Math.min(viewportWidth, 1280);
	const expectedLeft = (viewportWidth - expectedWidth) / 2;
	const expectedGutter = viewportWidth >= 1024 ? 32 : viewportWidth >= 640 ? 24 : 16;
	const styles = getComputedStyle(shell);
	const paddingLeft = Math.round(Number.parseFloat(styles.paddingLeft) || 0);
	const paddingRight = Math.round(Number.parseFloat(styles.paddingRight) || 0);

	if (!shell.classList.contains('app-container')) {
		issues.push({ code: 'missing-shared-class', shell: 'test' });
	}
	if (box.width > 1280.5) {
		issues.push({ code: 'shell-too-wide', shell: 'test', width: box.width });
	}
	if (Math.abs(box.left - expectedLeft) > 0.5) {
		issues.push({
			code: 'shell-not-centered',
			shell: 'test',
			expectedLeft,
			actualLeft: box.left,
		});
	}
	if (paddingLeft !== expectedGutter || paddingRight !== expectedGutter) {
		issues.push({
			code: 'wrong-gutter',
			shell: 'test',
			expected: expectedGutter,
			actual: [paddingLeft, paddingRight],
		});
	}
	for (const selector of ['.app-header', '.site-footer']) {
		const chrome = document.querySelector(selector);
		if (chrome && getComputedStyle(chrome).display !== 'none') {
			issues.push({ code: 'global-chrome-visible', selector });
		}
	}

	return { viewportWidth, expectedGutter, shell: box, issues };
}

function auditHorizontalSafeArea() {
	const issues = [];
	const measurements = {};
	const inspect = (name, selector, required = true, minimums = [44, 48]) => {
		const element = document.querySelector(selector);
		if (!element) {
			if (required) issues.push({ code: 'missing-safe-area-shell', shell: name });
			return null;
		}
		const styles = getComputedStyle(element);
		const paddingLeft = Math.round(Number.parseFloat(styles.paddingLeft) || 0);
		const paddingRight = Math.round(Number.parseFloat(styles.paddingRight) || 0);
		const rect = element.getBoundingClientRect();
		measurements[name] = {
			left: Math.round(rect.left * 100) / 100,
			right: Math.round(rect.right * 100) / 100,
			paddingLeft,
			paddingRight,
		};
		if (paddingLeft < minimums[0] || paddingRight < minimums[1]) {
			issues.push({
				code: 'unsafe-horizontal-inset',
				shell: name,
				expected: minimums,
				actual: [paddingLeft, paddingRight],
			});
		}
		return { element, rect, paddingLeft, paddingRight };
	};

	const page = inspect('page', 'main > .app-container, main > .test-shell');
	const immersive = window.location.pathname === '/test';
	if (!immersive) {
		const header = inspect('header', '.header-inner');
		const footer = inspect('footer', '.footer-inner');
		inspect('bottom-nav', '.bottom-nav');
		const brand = document.querySelector('.header-inner .brand-link');
		if (page && header && brand) {
			const contentLeft = page.rect.left + page.paddingLeft;
			const brandLeft = brand.getBoundingClientRect().left;
			if (Math.abs(contentLeft - brandLeft) > 0.5) {
				issues.push({
					code: 'safe-area-content-mismatch',
					shell: 'header',
					expectedLeft: contentLeft,
					actualLeft: brandLeft,
				});
			}
		}
		if (page && footer) {
			const footerBrand = document.querySelector('.footer-inner .brand-link');
			if (footerBrand) {
				const contentLeft = page.rect.left + page.paddingLeft;
				const brandLeft = footerBrand.getBoundingClientRect().left;
				if (Math.abs(contentLeft - brandLeft) > 0.5) {
					issues.push({
						code: 'safe-area-content-mismatch',
						shell: 'footer',
						expectedLeft: contentLeft,
						actualLeft: brandLeft,
					});
				}
			}
		}
	} else {
		const exit = document.querySelector('.test-exit');
		const testHeader = inspect('test-header', '.test-header', Boolean(exit), [0, 0]);
		if (page && testHeader && exit) {
			const contentLeft = page.rect.left + page.paddingLeft;
			const exitLeft = exit.getBoundingClientRect().left;
			if (Math.abs(contentLeft - exitLeft) > 0.5) {
				issues.push({
					code: 'safe-area-content-mismatch',
					shell: 'test-header',
					expectedLeft: contentLeft,
					actualLeft: exitLeft,
				});
			}
		}
	}

	return {
		pathname: window.location.pathname,
		measurements,
		issues,
	};
}

async function settled(page) {
	await page.evaluate(() => document.fonts?.ready);
	await page.waitForTimeout(200);
}

/** Freeze entry animations so measurements never catch a mid-flight scale. */
async function freezeMotion(page) {
	// The init script can run before the document element exists; callers that
	// need the class guaranteed before measuring re-apply it after navigation.
	await page.addInitScript(() => {
		document.documentElement?.classList.add('reduce-motion');
	});
}

function failures(report) {
	return report.filter(
		(entry) =>
			entry.overflowX > 1 ||
			entry.overflowing.length > 0 ||
			entry.clippedText.length > 0 ||
			entry.smallControls.length > 0
	);
}

test('shell route inventory covers every non-immersive SvelteKit page file', () => {
	const generatedRoutes = [
		...new Set(ROUTE_PAGE_FILES.map(routeUrlForFile).filter((route) => route !== '/test')),
	].sort();
	expect(generatedRoutes).toEqual(
		SHELL_ROUTES.filter((route) => route !== '/blog/not-a-real-layout-probe')
	);
	expect(SHELL_ROUTES).toContain('/test/stats');
});

test('shared shell and fixed chrome honor horizontal safe areas', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 390, height: 900 });
	await page.addInitScript(() => {
		const applySafeAreas = () => {
			document.documentElement.style.setProperty('--sal', '44px');
			document.documentElement.style.setProperty('--sar', '48px');
		};
		if (document.documentElement) applySafeAreas();
		else document.addEventListener('DOMContentLoaded', applySafeAreas, { once: true });
	});
	await freezeMotion(page);
	await stubBackend(page);
	const report = [];
	for (const route of ['/', '/test?id=missing-layout-probe']) {
		await page.goto(route, { waitUntil: 'load' });
		await settled(page);
		report.push({ route, ...(await page.evaluate(auditHorizontalSafeArea)) });
	}
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(report, null, 2),
	});
	expect(
		report.map((entry) => ({
			route: entry.route,
			issueCodes: [...new Set(entry.issues.map((issue) => issue.code))],
		}))
	).toEqual([
		{ route: '/', issueCodes: [] },
		{ route: '/test?id=missing-layout-probe', issueCodes: [] },
	]);
});

test('every non-immersive route uses the 1280px shell at every breakpoint', async ({
	page,
}, testInfo) => {
	test.setTimeout(240000);
	await freezeMotion(page);
	await stubBackend(page);
	const report = [];
	for (const width of SHELL_WIDTHS) {
		await page.setViewportSize({ width, height: 900 });
		for (const route of SHELL_ROUTES) {
			await page.goto(route, { waitUntil: 'load' });
			await settled(page);
			report.push({ route, ...(await page.evaluate(auditDesktopShell)) });
		}
	}
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(report, null, 2),
	});
	const shellFailures = report
		.filter((entry) => entry.issues.length > 0)
		.map((entry) => ({
			route: entry.route,
			viewportWidth: entry.viewportWidth,
			issueCodes: [...new Set(entry.issues.map((issue) => issue.code))],
		}));
	expect(shellFailures).toEqual([]);
});

test('authenticated admin uses the shared desktop shell', async ({ page }, testInfo) => {
	test.skip(
		!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD,
		'Admin credentials are not configured'
	);
	await freezeMotion(page);
	await page.setViewportSize({ width: 1280, height: 900 });
	for (const pathname of ['/api/admin/device-network', '/api/admin/feature-usage']) {
		await page.route(
			(url) => url.pathname === pathname,
			(route) =>
				route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: '{}',
				})
		);
	}
	const login = await page.request.post('/api/admin/login', {
		data: {
			username: process.env.ADMIN_USERNAME,
			password: process.env.ADMIN_PASSWORD,
		},
	});
	expect(login.status()).toBe(200);
	await page.goto('/admin', { waitUntil: 'load' });
	await page.locator('.tab-bar').waitFor({ state: 'visible' });
	await settled(page);
	const report = await page.evaluate(auditDesktopShell);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(report, null, 2),
	});
	expect(report.issues).toEqual([]);
});

for (const width of WIDTHS) {
	test(`every public route is fluid at ${width}px`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width, height: 900 });
		await freezeMotion(page);
		await stubBackend(page);
		const report = [];
		for (const route of ROUTES) {
			await page.goto(route, { waitUntil: 'load' });
			await settled(page);
			report.push({ route, ...(await page.evaluate(auditLayout)) });
		}
		await testInfo.attach('evidence', {
			contentType: 'application/json',
			body: JSON.stringify(report, null, 2),
		});
		expect(failures(report)).toEqual([]);
	});
}

test('dark mode keeps the same layout guarantees at 390px', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 390, height: 900 });
	await page.addInitScript(() => window.localStorage.setItem('selftest_theme', 'dark'));
	await freezeMotion(page);
	await stubBackend(page);
	const report = [];
	for (const route of ['/', '/practice', '/history', '/exam-paper', '/profile']) {
		await page.goto(route, { waitUntil: 'load' });
		await settled(page);
		report.push({ route, ...(await page.evaluate(auditLayout)) });
	}
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(report, null, 2),
	});
	expect(failures(report)).toEqual([]);
});

test('test start, stats and results stay fluid at every width', async ({
	browser,
	page,
	request,
}, testInfo) => {
	await freezeMotion(page);
	// Ensure the dev-only PGlite adapter creates the application schema before
	// this focused spec seeds through the test bridge.
	await page.goto('/', { waitUntil: 'load' });
	const sql = sqlClient(request);
	await connectOrSkip(sql);
	const questions = Array.from({ length: 2 }, (_, index) => ({
		question: `Probe question ${index + 1}?`,
		options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
		answer: 'Alpha',
	}));
	const rows = await sql`
		INSERT INTO ai_test (test, topic, language, num_questions)
		VALUES (${JSON.stringify({ topic: 'Layout probe', questions })}::jsonb, 'Layout probe', 'english', 2)
		RETURNING id
	`;
	const testId = rows[0].id;

	const report = [];
	const immersiveShellReport = [];
	const stateShellReport = [];
	for (const width of WIDTHS) {
		await page.setViewportSize({ width, height: 900 });
		// First visit: no activity card yet.
		await page.goto(`/test?id=${testId}`, { waitUntil: 'load' });
		await settled(page);
		report.push({
			route: `/test (first visit) @${width}`,
			...(await page.evaluate(auditLayout)),
		});
		immersiveShellReport.push({
			route: `/test summary @${width}`,
			...(await page.evaluate(auditImmersiveShell)),
		});

		await page.locator('.test-summary-card .btn-primary').click();
		await page.locator('.test-main').waitFor({ state: 'visible' });
		await settled(page);
		report.push({
			route: `/test (active question) @${width}`,
			...(await page.evaluate(auditLayout)),
		});
		immersiveShellReport.push({
			route: `/test active question @${width}`,
			...(await page.evaluate(auditImmersiveShell)),
		});

		// Second visitor sees the activity card next to the summary on desktop
		// and below it on phone/tablet.
		const visitorContext = await browser.newContext({
			viewport: { width, height: 900 },
		});
		const visitor = await visitorContext.newPage();
		await freezeMotion(visitor);
		await visitor.goto(`/test?id=${testId}`, { waitUntil: 'load' });
		await visitor.locator('.test-stats-card').waitFor({ state: 'visible' });
		await settled(visitor);
		report.push({
			route: `/test (activity card) @${width}`,
			...(await visitor.evaluate(auditLayout)),
		});
		await visitor.goto(`/test/stats?id=${testId}`, { waitUntil: 'load' });
		await settled(visitor);
		report.push({ route: `/test/stats @${width}`, ...(await visitor.evaluate(auditLayout)) });
		stateShellReport.push({
			route: `/test/stats @${width}`,
			...(await visitor.evaluate(auditDesktopShell)),
		});
		await visitorContext.close();
	}

	// Results page from a seeded local attempt.
	await page.setViewportSize({ width: 390, height: 900 });
	await page.addInitScript(() => {
		const attempt = {
			id: 'layout-probe',
			topic: 'Layout probe',
			timestamp: Date.now(),
			questions: [
				{ question: 'Q1', options: ['A1', 'B1'], answer: 'A1' },
				{ question: 'Q2', options: ['A2', 'B2'], answer: 'A2' },
			],
			userAnswers: { 0: 'A1', 1: 'B2' },
			score: 1,
			totalQuestions: 2,
			timeTaken: 120,
		};
		window.localStorage.setItem('selftest_history', JSON.stringify([attempt]));
	});
	await page.goto('/results?id=layout-probe', { waitUntil: 'load' });
	await settled(page);
	report.push({ route: '/results @390', ...(await page.evaluate(auditLayout)) });
	stateShellReport.push({
		route: '/results @390',
		...(await page.evaluate(auditDesktopShell)),
	});

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(
			{ layout: report, immersiveShell: immersiveShellReport, stateShell: stateShellReport },
			null,
			2
		),
	});
	expect(failures(report)).toEqual([]);
	expect(
		immersiveShellReport
			.filter((entry) => entry.issues.length > 0)
			.map((entry) => ({
				route: entry.route,
				issueCodes: [...new Set(entry.issues.map((issue) => issue.code))],
			}))
	).toEqual([]);
	expect(
		stateShellReport
			.filter((entry) => entry.issues.length > 0)
			.map((entry) => ({
				route: entry.route,
				issueCodes: [...new Set(entry.issues.map((issue) => issue.code))],
			}))
	).toEqual([]);
});
