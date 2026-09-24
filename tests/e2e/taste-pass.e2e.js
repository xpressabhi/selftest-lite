import { expect, test } from '@playwright/test';

// Taste-pass contract suite: the shell and public pages use one icon family (no
// text glyphs or emoji as icons), the documented radius/contrast system holds,
// reduced motion is honoured, and the public pages render clean.
// Spec: docs/superpowers/specs/2026-09-24-frontend-taste-pass-design.md

const GLYPH_RANGES =
	'\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{25A0}-\\u{25FF}\\u{2300}-\\u{23FF}\\u{2190}-\\u{21FF}';

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

test('shell icons are real SVGs with 44px targets and no glyph text', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	await waitForHydration(page);

	const shell = await page.evaluate(() => {
		const iconControls = [...document.querySelectorAll('.header-icon')];
		const bottomItems = [...document.querySelectorAll('.bottom-nav a')];
		const glyphText = [];
		for (const el of [...iconControls, ...bottomItems]) {
			const svgCount = el.querySelectorAll('svg').length;
			const nonSvgText = [...el.childNodes]
				.filter((node) => node.nodeType === Node.TEXT_NODE)
				.map((node) => node.textContent)
				.join('')
				.trim();
			if (svgCount === 0) glyphText.push(el.getAttribute('aria-label') || el.textContent.trim());
			// Bottom-nav labels live in text nodes; icon controls must be empty.
			if (el.classList.contains('header-icon') && nonSvgText) glyphText.push(nonSvgText);
		}
		const tooSmall = [...document.querySelectorAll('.header-icon, .bottom-nav a')]
			.filter((el) => {
				const height = el.getBoundingClientRect().height;
				return height > 0 && height < 44;
			})
			.map((el) => el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20));
		return {
			iconControlCount: iconControls.length,
			bottomItemCount: bottomItems.length,
			glyphText,
			tooSmall,
			legacyGlow: document.querySelectorAll('.ai-glow').length,
		};
	});

	// The signed-out shell always ships the language and theme controls.
	expect(shell.iconControlCount).toBeGreaterThanOrEqual(2);
	expect(shell.bottomItemCount).toBe(4);
	expect(shell.glyphText).toEqual([]);
	expect(shell.tooSmall).toEqual([]);
	expect(shell.legacyGlow).toBe(0);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(shell, null, 2),
	});
	expect(errors).toEqual([]);
});

test('desktop navigation renders on one line under 80px', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto('/');
	const nav = page.locator('.desktop-nav');
	await expect(nav).toBeVisible();
	const header = await page.locator('.app-header').boundingBox();
	const navBox = await nav.boundingBox();
	expect(navBox.height).toBeLessThanOrEqual(56);
	expect(header.height).toBeLessThanOrEqual(80);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ headerHeight: header.height, navHeight: navBox.height }, null, 2),
	});
});

for (const path of ['/', '/practice', '/about', '/faq', '/blog', '/contact']) {
	test(`no emoji, glyphs or em dashes render on ${path}`, async ({ page }, testInfo) => {
		await page.goto(path);
		const found = await page.evaluate((ranges) => {
			const pattern = new RegExp(`[${ranges}]`, 'gu');
			const text = document.body.innerText;
			return {
				glyphs: [...new Set(text.match(pattern) || [])],
				dashes: [...new Set(text.match(/[\u2013\u2014]/g) || [])],
			};
		}, GLYPH_RANGES);
		await testInfo.attach('evidence', {
			contentType: 'application/json',
			body: JSON.stringify({ path, ...found }, null, 2),
		});
		expect(found.glyphs).toEqual([]);
		expect(found.dashes).toEqual([]);
	});
}

test('primary buttons keep WCAG AA contrast in both themes', async ({ page }, testInfo) => {
	await page.goto('/');
	const ratios = await page.evaluate(() => {
		const parse = (value) => {
			const match = value.match(/rgba?\(([^)]+)\)/);
			if (!match) return [0, 0, 0];
			return match[1].split(',').slice(0, 3).map((part) => Number(part.trim()));
		};
		const luminance = ([r, g, b]) => {
			const channel = (c) => {
				const s = c / 255;
				return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
			};
			return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
		};
		const contrast = (a, b) => {
			const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
			return (l1 + 0.05) / (l2 + 0.05);
		};
		const probe = document.createElement('button');
		probe.className = 'btn btn-primary';
		probe.textContent = 'Contrast probe';
		probe.id = 'contrast-probe';
		document.body.appendChild(probe);
		const measure = () => {
			const styles = getComputedStyle(probe);
			return contrast(parse(styles.color), parse(styles.backgroundColor));
		};
		const light = measure();
		document.documentElement.classList.add('dark');
		const dark = measure();
		document.documentElement.classList.remove('dark');
		probe.remove();
		return { light, dark };
	});
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(ratios, null, 2),
	});
	expect(ratios.light).toBeGreaterThanOrEqual(4.5);
	expect(ratios.dark).toBeGreaterThanOrEqual(4.5);
});

test('reduced motion collapses animations', async ({ page }, testInfo) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/');
	const durations = await page.evaluate(() => {
		const host = document.createElement('div');
		host.className = 'thinking-dots';
		host.innerHTML = '<span></span><span></span><span></span>';
		document.body.appendChild(host);
		const values = [...host.querySelectorAll('span')].map(
			(span) => getComputedStyle(span).animationDuration
		);
		host.remove();
		return values;
	});
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ durations }, null, 2),
	});
	// Chromium serializes 0.01ms as "1e-05s"; normalize before comparing.
	const ms = (value) =>
		value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1000;
	expect(durations.every((value) => ms(value) <= 0.02)).toBe(true);
});

test('public pages render without console errors', async ({ page }) => {
	const errors = await collectErrors(page);
	for (const path of ['/', '/practice', '/about', '/faq', '/blog', '/contact', '/bookmarks', '/history']) {
		await page.goto(path);
		await page.waitForLoadState('networkidle');
	}
	expect(errors).toEqual([]);
});

const seededHistory = [
	{
		id: 'seed-1',
		topic: 'SSC CGL general awareness practice',
		timestamp: Date.now() - 2 * 60 * 60 * 1000,
		totalQuestions: 10,
		questions: Array.from({ length: 10 }, (_, i) => ({ q: i })),
		userAnswers: { 0: 'a' },
		score: 7
	},
	{
		id: 'seed-2',
		topic: 'UPSC prelims polity: constitutional bodies',
		timestamp: Date.now() - 26 * 60 * 60 * 1000,
		totalQuestions: 20,
		questions: Array.from({ length: 20 }, (_, i) => ({ q: i })),
		userAnswers: { 0: 'a' },
		score: 14
	},
	{
		id: 'seed-3',
		topic: 'Class 10 CBSE Science: life processes',
		timestamp: Date.now() - 4 * 24 * 60 * 60 * 1000,
		totalQuestions: 15,
		questions: Array.from({ length: 15 }, (_, i) => ({ q: i })),
		score: 11,
		userAnswers: {}
	},
	{
		id: 'seed-4',
		topic: 'English grammar: tenses practice',
		timestamp: Date.now() - 9 * 24 * 60 * 60 * 1000,
		totalQuestions: 10,
		questions: Array.from({ length: 10 }, (_, i) => ({ q: i }))
	}
];

test('history groups rows by day and keeps destructive actions quiet', async ({
	page
}, testInfo) => {
	const errors = await collectErrors(page);
	await page.addInitScript((history) => {
		window.localStorage.setItem('selftest_history', JSON.stringify(history));
	}, seededHistory);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/history');

	await expect(page.locator('.stat-strip')).toBeVisible();
	await expect(page.locator('.stat-cell')).toHaveCount(4);
	await expect(page.locator('.group-label')).toHaveCount(3);
	await expect(page.locator('.group-label').first()).toHaveText(/Today|आज/);
	const rows = page.locator('.history-row');
	await expect(rows).toHaveCount(4);
	await expect(rows.first().locator('.score-chip')).toBeVisible();

	const remove = rows.first().locator('button.fuse-button');
	await expect(remove).toHaveAttribute('aria-label', /Remove from history|इतिहास से/);
	const box = await remove.boundingBox();
	const text = (await remove.innerText()).trim();
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify({ groups: await page.locator('.group-label').allInnerTexts(), removeHeight: box.height, removeText: text }, null, 2),
	});
	expect(box.height).toBeGreaterThanOrEqual(44);
	// Icon-only destructive control: the label lives in aria-label.
	expect(text).toBe('');
	expect(errors).toEqual([]);
});

test('bookmark rows are quiet, labeled and actionable', async ({ page }, testInfo) => {
	const errors = await collectErrors(page);
	await page.addInitScript(() => {
		window.localStorage.setItem(
			'selftest_bookmarked_exams',
			JSON.stringify(['ssc-cgl', 'ibps-po'])
		);
		window.localStorage.setItem(
			'selftest_bookmarked_quiz_presets',
			JSON.stringify([
				{ id: 'preset-1', label: 'Daily current affairs', numQuestions: 10, difficulty: 'intermediate' }
			])
		);
		window.localStorage.setItem(
			'selftest_bookmarks',
			JSON.stringify([
				{ question: 'The SI unit of magnetic flux is:', answer: 'Weber (Wb)', topic: 'Class 12 Physics' }
			])
		);
	});
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/bookmarks');

	await expect(page.locator('.bm-section')).toHaveCount(3);
	await expect(page.locator('.bm-item')).toHaveCount(3);
	const removeButtons = page.locator('.bm-remove');
	// Two exams + one preset + one saved question.
	await expect(removeButtons).toHaveCount(4);
	const audit = await removeButtons.evaluateAll((els) =>
		els.map((el) => ({
			label: el.getAttribute('aria-label') || '',
			text: (el.textContent || '').trim(),
			height: el.getBoundingClientRect().height
		}))
	);
	await expect(page.locator('a.bm-row').first()).toHaveAttribute('href', /\?exam=/);
	await testInfo.attach('evidence', {
		contentType: 'application/json',
		body: JSON.stringify(audit, null, 2),
	});
	expect(audit.every((item) => item.label.startsWith('Remove bookmark'))).toBe(true);
	expect(new Set(audit.map((item) => item.label)).size).toBe(audit.length);
	expect(audit.every((item) => item.text === '')).toBe(true);
	expect(audit.every((item) => item.height >= 44)).toBe(true);
	expect(errors).toEqual([]);
});
