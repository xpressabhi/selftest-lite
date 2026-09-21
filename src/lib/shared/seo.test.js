import { describe, expect, it } from 'vitest';
import { NOINDEX_PREFIXES, SITE_ORIGIN, isNoindexPath } from './seo.js';

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
