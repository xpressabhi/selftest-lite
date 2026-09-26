#!/usr/bin/env node
// Verifies the adapter-vercel build output the way Vercel serves it:
// every sitemap URL resolves to a static file or the SSR function, every
// prerendered page carries the right canonical, hreflang trio, language and
// robots tags, and the crawler files exist. Run after `vite build`
// (`npm run verify:vercel` does both). Fails loudly so a broken deploy is
// caught before it ships.

import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const OUT = process.env.VERCEL_OUTPUT_DIR ?? '.vercel/output';
const STATIC = path.join(OUT, 'static');
const ORIGIN = 'https://www.selftest.in';
const SSR_PATHS = new Set(['/', '/hi', '/exams', '/hi/exams']);

const failures = [];
const check = (ok, message) => {
	if (!ok) {
		failures.push(message);
	}
};

async function fileExists(candidate) {
	try {
		return (await stat(candidate)).isFile();
	} catch {
		return false;
	}
}

async function readText(file) {
	return readFile(file, 'utf8');
}

if (!existsSync(path.join(OUT, 'config.json'))) {
	console.error(`verify-vercel: ${OUT}/config.json not found — run \`npm run build\` first`);
	process.exit(1);
}

const config = JSON.parse(await readText(path.join(OUT, 'config.json')));
const overrides = config.overrides ?? {};
check(config.version === 3, `unexpected output config version: ${config.version}`);
check(existsSync(path.join(OUT, 'functions')), 'missing .vercel/output/functions');
check(existsSync(path.join(OUT, 'functions', '![-]', 'catchall.func')), 'missing SSR function');

/** Resolves a pathname to a static file the way Vercel's filesystem handle does. */
async function staticFileFor(pathname) {
	const clean = pathname.replace(/^\/+|\/+$/g, '');
	const candidates = [];
	for (const [file, meta] of Object.entries(overrides)) {
		if (meta.path === clean) {
			candidates.push(path.join(STATIC, file));
		}
	}
	candidates.push(path.join(STATIC, `${clean}.html`));
	candidates.push(path.join(STATIC, clean));
	for (const candidate of candidates) {
		if (await fileExists(candidate)) {
			return candidate;
		}
	}
	return null;
}

function twinPaths(pathname) {
	const english = pathname.startsWith('/hi') ? pathname.slice(3) || '/' : pathname;
	const hindi = english === '/' ? '/hi' : `/hi${english}`;
	return { english, hindi };
}

function tag(html, pattern) {
	const match = html.match(pattern);
	return match ? match[1] : null;
}

const sitemap = await readText(path.join(STATIC, 'sitemap.xml'));
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
check(locs.length > 0, 'sitemap has no <loc> entries');
check(locs.length === new Set(locs).size, 'sitemap contains duplicate URLs');
check(sitemap.includes('xmlns:xhtml='), 'sitemap is missing the xhtml namespace');

let prerendered = 0;
for (const loc of locs) {
	const pathname = loc.replace(ORIGIN, '');
	const { english, hindi } = twinPaths(pathname);
	const englishUrl = `${ORIGIN}${english}`;
	const hindiUrl = `${ORIGIN}${hindi}`;

	check(
		locs.includes(englishUrl) && locs.includes(hindiUrl),
		`${pathname}: twin URL missing from sitemap (${englishUrl} / ${hindiUrl})`
	);
	check(
		sitemap.includes(`hreflang="en-IN" href="${englishUrl}"`) &&
			sitemap.includes(`hreflang="hi-IN" href="${hindiUrl}"`),
		`${pathname}: sitemap alternates are not reciprocal`
	);

	const file = await staticFileFor(pathname);
	if (!file) {
		check(SSR_PATHS.has(pathname), `${pathname}: no static file and not an expected SSR path`);
		continue;
	}
	if (!file.endsWith('.html')) {
		continue;
	}

	prerendered += 1;
	const html = await readText(file);
	const titles = html.match(/<title>/g) ?? [];
	check(titles.length === 1, `${pathname}: expected exactly one <title>, found ${titles.length}`);

	const canonical = tag(html, /<link rel="canonical" href="([^"]+)"/);
	check(canonical === `${ORIGIN}${pathname}`, `${pathname}: canonical is ${canonical}`);

	const alternates = {
		english: tag(html, /<link rel="alternate" hreflang="en-IN" href="([^"]+)"/),
		hindi: tag(html, /<link rel="alternate" hreflang="hi-IN" href="([^"]+)"/),
		xDefault: tag(html, /<link rel="alternate" hreflang="x-default" href="([^"]+)"/)
	};
	check(alternates.english === englishUrl, `${pathname}: en-IN alternate is ${alternates.english}`);
	check(alternates.hindi === hindiUrl, `${pathname}: hi-IN alternate is ${alternates.hindi}`);
	check(alternates.xDefault === englishUrl, `${pathname}: x-default alternate is ${alternates.xDefault}`);

	const robots = tag(html, /<meta name="robots" content="([^"]*)"/);
	check(robots?.includes('index'), `${pathname}: robots meta is ${robots}`);

	const isHindi = pathname.startsWith('/hi');
	const htmlLang = tag(html, /<html lang="([a-z]+)"/);
	check(htmlLang === (isHindi ? 'hi' : 'en'), `${pathname}: <html lang> is ${htmlLang}`);
	if (isHindi) {
		check(/[\u0900-\u097F]/.test(html), `${pathname}: Hindi page contains no Devanagari text`);
	}
}

const robots = await readText(path.join(STATIC, 'robots.txt'));
check(robots.includes('Sitemap:'), 'robots.txt is missing the Sitemap line');
for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) {
	check(robots.includes(bot), `robots.txt is missing an allow group for ${bot}`);
}

const llms = await readText(path.join(STATIC, 'llms.txt'));
check(llms.startsWith('# selftest.in'), 'llms.txt is missing its H1');
check(llms.includes(`${ORIGIN}/hi/`), 'llms.txt does not document the Hindi URL space');

const rss = await readText(path.join(STATIC, 'rss.xml'));
check(rss.includes('<rss'), 'rss.xml is not an RSS document');

if (failures.length > 0) {
	console.error(`verify-vercel: ${failures.length} check(s) failed`);
	for (const failure of failures) {
		console.error(`  - ${failure}`);
	}
	process.exit(1);
}

console.log(
	`verify-vercel: OK — ${locs.length} sitemap URLs, ${prerendered} prerendered pages, ` +
		`${Object.keys(overrides).length} clean-URL overrides, SSR function present`
);
