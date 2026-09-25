import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Public-pages gap suite: /contact, /terms and /privacy were only covered for
// layout width and glyphs, not for heading/overflow/console health at phone
// and desktop widths; and the header theme toggle had no end-to-end coverage
// for flip + persistence. Error collection and evidence attaches follow
// tests/e2e/taste-pass.e2e.js.

const PAGES = ['/contact', '/terms', '/privacy'];

const VIEWPORTS = [
	{ label: 'phone', width: 390, height: 844 },
	{ label: 'desktop', width: 1280, height: 900 },
];

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

async function waitForHydration(page) {
	await page.waitForFunction(
		() => Boolean(document.querySelector('.intent-input')?.__svelte_meta),
		undefined,
		{ timeout: 15000 }
	);
}

function localeLabel(language, key) {
	const file = new URL(`../../src/lib/locales/${language}.json`, import.meta.url);
	return JSON.parse(readFileSync(file, 'utf8'))[key];
}

// The theme control is icon-only and translated, so resolve its aria-label
// from the same locale files the layout renders. Position-based selectors are
// not stable here: .header-actions also holds the data-saver, language,
// history and menu controls.
const THEME_LABELS = ['english', 'hindi'].map((language) =>
	localeLabel(language, 'toggleThemeAria')
);
const THEME_SELECTOR = THEME_LABELS.map(
	(label) => `.header-actions button.header-icon[aria-label="${label}"]`
).join(', ');

async function readTheme(page) {
	return page.evaluate(() => ({
		dark: document.documentElement.classList.contains('dark'),
		themeAttribute: document.documentElement.getAttribute('data-bs-theme'),
	}));
}

test.describe('public pages render clean', () => {
	for (const path of PAGES) {
		for (const viewport of VIEWPORTS) {
			test(`${path} at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
				const errors = await collectErrors(page);
				await page.setViewportSize({ width: viewport.width, height: viewport.height });
				// Freeze entry animations: transforms contribute to the
				// scrollable overflow area, so a mid-flight card could read
				// as a false horizontal overflow. The init script runs before
				// the document exists, so guard it and re-apply after load.
				await page.addInitScript(() => {
					document.documentElement?.classList.add('reduce-motion');
				});
				await page.goto(path);
				await page.evaluate(() => document.documentElement.classList.add('reduce-motion'));
				await expect(page.locator('h1')).toBeVisible();
				await page.waitForLoadState('networkidle');
				await page.evaluate(() => document.fonts?.ready);

				const measurement = await page.evaluate(() => {
					const doc = document.documentElement;
					const headings = [...document.querySelectorAll('h1')];
					const visibleHeadings = headings.filter((heading) => {
						const rect = heading.getBoundingClientRect();
						const styles = getComputedStyle(heading);
						return (
							rect.width > 0 &&
							rect.height > 0 &&
							styles.display !== 'none' &&
							styles.visibility !== 'hidden'
						);
					});
					return {
						path: window.location.pathname,
						viewportWidth: window.innerWidth,
						viewportHeight: window.innerHeight,
						h1Count: headings.length,
						visibleH1Count: visibleHeadings.length,
						h1Text: (visibleHeadings[0]?.innerText || '').trim(),
						scrollWidth: doc.scrollWidth,
						clientWidth: doc.clientWidth,
						overflowX: doc.scrollWidth - doc.clientWidth,
					};
				});

				await testInfo.attach('evidence', {
					contentType: 'application/json',
					body: JSON.stringify({ ...measurement, errors }, null, 2),
				});
				expect(measurement.h1Count).toBe(1);
				expect(measurement.visibleH1Count).toBe(1);
				expect(measurement.h1Text.length).toBeGreaterThan(0);
				expect(measurement.scrollWidth).toBeLessThanOrEqual(measurement.clientWidth);
				expect(errors).toEqual([]);
			});
		}
	}
});

test.describe('theme toggle persistence', () => {
	test('flips the dark class and preserves it across reload at 390x844', async ({
		page,
	}, testInfo) => {
		const errors = await collectErrors(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');
		await waitForHydration(page);

		const themeButton = page.locator(THEME_SELECTOR);
		await expect(themeButton).toHaveCount(1);
		await expect(themeButton).toBeVisible();
		const ariaLabel = await themeButton.getAttribute('aria-label');
		expect(THEME_LABELS).toContain(ariaLabel);

		// The pre-paint inline script and initializePreferences both resolve
		// the stored/system theme; wait for the applied attribute so `before`
		// can never be read mid-initialization.
		await page.waitForFunction(() => document.documentElement.hasAttribute('data-bs-theme'));

		const before = await readTheme(page);
		await themeButton.click();
		await expect
			.poll(async () => (await readTheme(page)).dark, { timeout: 5000 })
			.toBe(!before.dark);
		const after = await readTheme(page);
		expect(after.dark).toBe(!before.dark);
		expect(after.themeAttribute).toBe(after.dark ? 'dark' : 'light');

		await page.reload();
		await waitForHydration(page);
		await page.waitForFunction(() => document.documentElement.hasAttribute('data-bs-theme'));
		const persisted = await readTheme(page);

		await testInfo.attach('evidence', {
			contentType: 'application/json',
			body: JSON.stringify({ ariaLabel, before, after, persisted, errors }, null, 2),
		});
		expect(persisted.dark).toBe(after.dark);
		expect(persisted.themeAttribute).toBe(after.themeAttribute);
		expect(errors).toEqual([]);
	});
});
