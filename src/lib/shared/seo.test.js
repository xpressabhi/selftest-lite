import { describe, expect, it } from 'vitest';
import {
	HINDI_PREFIX,
	NOINDEX_PREFIXES,
	SITE_ORIGIN,
	buildSeo,
	isNoindexPath,
	languageHref,
	splitLang,
} from './seo.js';

describe('seo constants', () => {
	it('uses the www origin that all canonical URLs are built from', () => {
		expect(SITE_ORIGIN).toBe('https://www.selftest.in');
	});

	it('lists only app-shell prefixes', () => {
		expect(NOINDEX_PREFIXES).toEqual(
			expect.arrayContaining(['/test', '/results', '/history', '/bookmarks', '/profile', '/admin'])
		);
	});
});

describe('isNoindexPath', () => {
	it('matches every noindex root exactly', () => {
		for (const prefix of NOINDEX_PREFIXES) {
			expect(isNoindexPath(prefix)).toBe(true);
		}
	});

	it('matches nested app paths', () => {
		expect(isNoindexPath('/test/anything')).toBe(true);
		expect(isNoindexPath('/test/')).toBe(true);
		expect(isNoindexPath('/results/abc')).toBe(true);
		expect(isNoindexPath('/admin/login')).toBe(true);
	});

	it('does not match lookalike indexable paths', () => {
		expect(isNoindexPath('/')).toBe(false);
		expect(isNoindexPath('/testing')).toBe(false);
		expect(isNoindexPath('/administrator')).toBe(false);
		expect(isNoindexPath('/profile-tips')).toBe(false);
		expect(isNoindexPath('/blog/results')).toBe(false);
	});
});

describe('splitLang', () => {
	it('leaves English paths untouched', () => {
		expect(splitLang('/')).toEqual({ lang: 'english', path: '/' });
		expect(splitLang('/practice/ssc-cgl')).toEqual({
			lang: 'english',
			path: '/practice/ssc-cgl',
		});
	});

	it('maps the Hindi root to the English root', () => {
		expect(splitLang(HINDI_PREFIX)).toEqual({ lang: 'hindi', path: '/' });
	});

	it('strips the Hindi prefix for nested paths', () => {
		expect(splitLang('/hi/practice/ssc-cgl')).toEqual({
			lang: 'hindi',
			path: '/practice/ssc-cgl',
		});
		expect(splitLang('/hi/blog')).toEqual({ lang: 'hindi', path: '/blog' });
	});
});

describe('languageHref', () => {
	it('round-trips between twins', () => {
		expect(languageHref('/practice/ssc-cgl', 'hindi')).toBe('/hi/practice/ssc-cgl');
		expect(languageHref('/hi/practice/ssc-cgl', 'english')).toBe('/practice/ssc-cgl');
	});

	it('round-trips the home page', () => {
		expect(languageHref('/', 'hindi')).toBe('/hi');
		expect(languageHref('/hi', 'english')).toBe('/');
	});

	it('returns null for app-shell pages in either language', () => {
		expect(languageHref('/test', 'hindi')).toBeNull();
		expect(languageHref('/hi/test', 'english')).toBeNull();
		expect(languageHref('/admin/login', 'hindi')).toBeNull();
	});
});

describe('buildSeo', () => {
	it('builds an absolute canonical and reciprocal hreflang pairs', () => {
		const seo = buildSeo({ path: '/blog/study-tips', lang: 'english', type: 'article' });
		expect(seo.canonical).toBe(`${SITE_ORIGIN}/blog/study-tips`);
		expect(seo.ogUrl).toBe(seo.canonical);
		expect(seo.alternates).toEqual([
			{ hreflang: 'en-IN', href: `${SITE_ORIGIN}/blog/study-tips` },
			{ hreflang: 'hi-IN', href: `${SITE_ORIGIN}/hi/blog/study-tips` },
			{ hreflang: 'x-default', href: `${SITE_ORIGIN}/blog/study-tips` },
		]);
		expect(seo.ogType).toBe('article');
	});

	it('takes the twin URLs from the Hindi page the same way', () => {
		const seo = buildSeo({ path: '/hi/practice/ssc-cgl', lang: 'hindi' });
		expect(seo.canonical).toBe(`${SITE_ORIGIN}/hi/practice/ssc-cgl`);
		expect(seo.alternates).toEqual([
			{ hreflang: 'en-IN', href: `${SITE_ORIGIN}/practice/ssc-cgl` },
			{ hreflang: 'hi-IN', href: `${SITE_ORIGIN}/hi/practice/ssc-cgl` },
			{ hreflang: 'x-default', href: `${SITE_ORIGIN}/practice/ssc-cgl` },
		]);
	});

	it('sets locale and alternate per language', () => {
		expect(buildSeo({ path: '/about', lang: 'english' }).ogLocale).toBe('en_IN');
		expect(buildSeo({ path: '/about', lang: 'english' }).ogLocaleAlternate).toBe('hi_IN');
		expect(buildSeo({ path: '/hi/about', lang: 'hindi' }).ogLocale).toBe('hi_IN');
		expect(buildSeo({ path: '/hi/about', lang: 'hindi' }).ogLocaleAlternate).toBe('en_IN');
	});

	it('emits no canonical, og:url or alternates for noindex paths', () => {
		const seo = buildSeo({ path: '/history' });
		expect(seo.canonical).toBeNull();
		expect(seo.ogUrl).toBeNull();
		expect(seo.alternates).toEqual([]);
		expect(seo.indexable).toBe(false);
	});
});
