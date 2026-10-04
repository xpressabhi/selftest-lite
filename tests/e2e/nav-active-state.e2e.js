import { expect, test } from '@playwright/test';

// Nav contract: every nav surface in the shell (desktop nav, phone hamburger
// grid, phone bottom bar) must mark the link for the current route and only
// that one, and must keep doing so across client-side navigation. SvelteKit
// swaps the page without a full load, so the marker has to be reactive to
// `page.url.pathname`.
//
// A permanent brand tint on the Create entry is not a marker. It rendered
// identically on /about and on /, so it read as "you are here" on every page
// and told the user nothing. The marker is `.active` + `aria-current="page"`,
// and it is the only thing allowed to signal the current destination.

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

// SvelteKit serves SSR HTML and attaches handlers once the client bundle
// hydrates; a click issued before that is silently dropped. Probe for a live
// handler instead of guessing with a timeout. The layout owns the menu toggle on
// every non-immersive page, so this gate works on all of them, at any width
// (the toggle is `display: none` on desktop, hence the dispatched click rather
// than a real one), and it leaves the menu closed.
async function waitForHydration(page) {
	const toggle = page.locator('.menu-control');
	const expanded = () =>
		page.evaluate(
			() => document.querySelector('.menu-control')?.getAttribute('aria-expanded') ?? null
		);
	for (let attempt = 0; attempt < 30; attempt += 1) {
		await toggle.evaluate((el) => el.click());
		const opened = await page
			.waitForFunction(
				() => document.querySelector('.menu-control')?.getAttribute('aria-expanded') === 'true',
				undefined,
				{ timeout: 1000 }
			)
			.then(() => true)
			.catch(() => false);
		if (opened) {
			await toggle.evaluate((el) => el.click());
			await page.waitForFunction(
				() => document.querySelector('.menu-control')?.getAttribute('aria-expanded') === 'false',
				undefined,
				{ timeout: 5000 }
			);
			return;
		}
		// A click can land just after hydration; leave the menu closed for the
		// next attempt.
		if ((await expanded()) === 'true') {
			await toggle.evaluate((el) => el.click());
		}
	}
	throw new Error('app shell never hydrated: .menu-control stayed inert');
}

async function openMenu(page) {
	await waitForHydration(page);
	await page.locator('.menu-control').click();
	await page.waitForFunction(() => Boolean(document.querySelector('.mobile-menu')), undefined, {
		timeout: 5000,
	});
}

// Every nav anchor in `selector`, split into the ones carrying the current-page
// marker and the rest, keyed by pathname.
async function navState(page, selector) {
	return page.$$eval(`${selector} a`, (links) => {
		const path = (a) => new URL(a.href).pathname;
		const marked = links.filter(
			(a) => a.classList.contains('active') || a.getAttribute('aria-current') === 'page'
		);
		return {
			total: links.length,
			// The home/create pair share a destination, so collapse duplicates:
			// `marked` is "which destinations are current", not "how many tabs".
			marked: [...new Set(marked.map(path))].sort(),
			// Keep the class half and the aria half comparable, so a marker that is
			// class-only or attribute-only shows up as a disagreement instead of
			// passing on whichever half happened to be set.
			classOnly: marked.filter((a) => !a.getAttribute('aria-current')).map(path).sort(),
			attrOnly: links
				.filter(
					(a) =>
						a.getAttribute('aria-current') === 'page' && !a.classList.contains('active')
				)
				.map(path)
				.sort(),
		};
	});
}

async function expectNav(page, selector, expected, minLinks = 1) {
	await expect
		.poll(() => navState(page, selector), { timeout: 10000 })
		.toEqual({ total: expect.any(Number), marked: expected, classOnly: [], attrOnly: [] });
	// `expect.poll` resolves without a value, so read the state again for the
	// surface-size guard: a missing or empty nav would satisfy `marked: []`
	// vacuously.
	const state = await navState(page, selector);
	expect(state.total).toBeGreaterThanOrEqual(minLinks);
	return state;
}

// The desktop bar carried no route-driven state at all, so nothing about it
// responded to navigation.
test('desktop nav marks only the current destination', async ({ page }) => {
	await page.setViewportSize(DESKTOP);

	const routes = [
		{ path: '/', marked: ['/'] }, // Create
		{ path: '/about', marked: ['/about'] },
		{ path: '/practice', marked: ['/practice'] },
		{ path: '/practice/ssc-cgl', marked: ['/practice'] }, // child route
		{ path: '/blog', marked: ['/blog'] },
		{ path: '/faq', marked: ['/faq'] },
		{ path: '/contact', marked: ['/contact'] },
		{ path: '/privacy', marked: [] }, // footer/menu only, not in the bar
		{ path: '/terms', marked: [] },
		// Hindi twins: the bar's hrefs are localized, so the marker must follow.
		{ path: '/hi', marked: ['/hi'] },
		{ path: '/hi/about', marked: ['/hi/about'] },
		{ path: '/hi/blog', marked: ['/hi/blog'] },
		{ path: '/hi/practice', marked: ['/hi/practice'] },
		{ path: '/hi/practice/ssc-cgl', marked: ['/hi/practice'] },
	];

	for (const route of routes) {
		await page.goto(route.path);
		await expectNav(page, '.desktop-nav', route.marked, 6);
	}
});

// The bug as reported: clicking About or Blog left Create looking selected.
test('desktop nav marker follows client-side clicks', async ({ page }) => {
	await page.setViewportSize(DESKTOP);
	await page.goto('/');
	await expectNav(page, '.desktop-nav', ['/'], 6);
	await waitForHydration(page);

	for (const [label, href] of [
		['About', '/about'],
		['Practice Exams', '/practice'],
		['Blog', '/blog'],
		['FAQ', '/faq'],
		['Contact', '/contact'],
	]) {
		await page.locator('.desktop-nav a', { hasText: new RegExp(`^${label}$`) }).click();
		await page.waitForURL(`**${href}`);
		await expectNav(page, '.desktop-nav', [href], 6);
	}

	await page.locator('.desktop-nav .create-link').click();
	await page.waitForURL('**/');
	await expectNav(page, '.desktop-nav', ['/'], 6);
});

// The phone hamburger grid already tracked the route; pin it so it cannot
// regress, and cover the entries the desktop bar does not carry.
test('phone hamburger grid marks only the current destination', async ({ page }) => {
	await page.setViewportSize(PHONE);

	for (const path of ['/about', '/privacy', '/terms', '/faq']) {
		await page.goto(path);
		await openMenu(page);
		await expectNav(page, '.mobile-menu', [path], 8);
	}
});

// The phone bottom bar. Home and Create share a destination, so they collapse to
// one marked path; /about has no tab in the bar, so nothing is marked there.
test('phone bottom nav marks only the current destination', async ({ page }) => {
	await page.setViewportSize(PHONE);

	const routes = [
		{ path: '/', marked: ['/'] },
		{ path: '/practice', marked: ['/practice'] },
		{ path: '/practice/ssc-cgl', marked: ['/practice'] },
		{ path: '/bookmarks', marked: ['/bookmarks'] },
		{ path: '/history', marked: ['/history'] },
		{ path: '/about', marked: [] },
		{ path: '/blog', marked: [] },
		{ path: '/hi/about', marked: [] },
	];

	for (const route of routes) {
		await page.goto(route.path);
		await expectNav(page, '.bottom-nav', route.marked, 5);
	}
});

// The bottom-bar Create entry shared a permanent brand colour with no way to
// express state, which is what made it read as always-selected. Its emphasis is
// now driven by the route; its bold weight stays, so it keeps reading as the
// bar's primary action.
test('bottom nav Create entry emphasis follows the route', async ({ page }, testInfo) => {
	await page.setViewportSize(PHONE);

	const createStyle = async (path) => {
		await page.goto(path);
		return page.locator('.bottom-nav .create-tab').evaluate((el) => {
			const own = getComputedStyle(el);
			// Compare against a sibling tab, so the assertion measures "looks
			// current because it is current" instead of pinning a theme colour
			// that a dark-mode token change would break.
			const sibling = [...document.querySelectorAll('.bottom-nav a')].find(
				(a) => !a.classList.contains('create-tab') && !a.classList.contains('active')
			);
			return {
				color: own.color,
				weight: own.fontWeight,
				marksCurrent: el.classList.contains('active'),
				siblingColor: getComputedStyle(sibling).color,
			};
		});
	};

	const onHome = await createStyle('/');
	const onAbout = await createStyle('/about');

	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ onHome, onAbout }, null, 2),
	});

	// On a page Create does not lead to, it must neither claim to be current nor
	// render in the current-route colour.
	expect(onAbout.marksCurrent).toBe(false);
	expect(onAbout.color).toBe(onAbout.siblingColor);

	// On its own route it takes the current-route colour and the marker.
	expect(onHome.marksCurrent).toBe(true);
	expect(onHome.color).not.toBe(onAbout.color);
	// Bold weight is the persistent cue that keeps it the primary action.
	expect(onHome.weight).toBe(onAbout.weight);
});