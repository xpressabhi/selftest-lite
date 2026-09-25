import { expect, test } from '@playwright/test';
import { connectOrSkip, sqlClient } from './testDb.js';

// Design-consistency contract: every public surface lays out without
// horizontal page overflow, without content crossing the viewport edge,
// without clipped nowrap text, and with >=44px controls at phone (390),
// tablet (768) and desktop (1280) widths. This is the guard that keeps the
// "one coherent layout system" promise from silently regressing.

const WIDTHS = [390, 768, 1280];

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

async function settled(page) {
	await page.evaluate(() => document.fonts?.ready);
	await page.waitForTimeout(200);
}

/** Freeze entry animations so measurements never catch a mid-flight scale. */
async function freezeMotion(page) {
	await page.addInitScript(() => document.documentElement.classList.add('reduce-motion'));
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
	for (const width of WIDTHS) {
		await page.setViewportSize({ width, height: 900 });
		// First visit: no activity card yet.
		await page.goto(`/test?id=${testId}`, { waitUntil: 'load' });
		await settled(page);
		report.push({
			route: `/test (first visit) @${width}`,
			...(await page.evaluate(auditLayout)),
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

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(report, null, 2),
	});
	expect(failures(report)).toEqual([]);
});
