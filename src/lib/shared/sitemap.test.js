import { describe, expect, it } from 'vitest';
import { BLOG_POSTS_BY_DATE } from '$lib/data/blogPosts';
import { OBJECTIVE_ONLY_EXAMS } from '$lib/data/indianExams';
import { SITE_ORIGIN } from './seo.js';
import { STATIC_PATHS, buildSitemap } from './sitemap.js';

const xml = buildSitemap();
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const urlCount = (xml.match(/<url>/g) || []).length;

describe('buildSitemap', () => {
	it('declares the xhtml namespace needed for hreflang links', () => {
		expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
	});

	it('lists every page in both languages', () => {
		const expected = (STATIC_PATHS.length + OBJECTIVE_ONLY_EXAMS.length + BLOG_POSTS_BY_DATE.length) * 2;
		expect(urlCount).toBe(expected);
		expect(new Set(locs).size).toBe(locs.length);
	});

	it('has a Hindi twin for every English URL', () => {
		for (const path of STATIC_PATHS) {
			expect(locs).toContain(`${SITE_ORIGIN}${path}`);
			expect(locs).toContain(`${SITE_ORIGIN}${path === '/' ? '/hi' : `/hi${path}`}`);
		}
		for (const exam of OBJECTIVE_ONLY_EXAMS) {
			expect(locs).toContain(`${SITE_ORIGIN}/practice/${exam.id}`);
			expect(locs).toContain(`${SITE_ORIGIN}/hi/practice/${exam.id}`);
		}
		for (const post of BLOG_POSTS_BY_DATE) {
			expect(locs).toContain(`${SITE_ORIGIN}/blog/${post.slug}`);
			expect(locs).toContain(`${SITE_ORIGIN}/hi/blog/${post.slug}`);
		}
	});

	it('emits reciprocal alternates for a sample entry', () => {
		const entry = xml.split('  <url>').find((chunk) => chunk.includes('/hi/practice/ssc-cgl</loc>'));
		expect(entry).toContain('hreflang="en-IN" href="https://www.selftest.in/practice/ssc-cgl"');
		expect(entry).toContain('hreflang="hi-IN" href="https://www.selftest.in/hi/practice/ssc-cgl"');
		expect(entry).toContain('hreflang="x-default" href="https://www.selftest.in/practice/ssc-cgl"');
	});

	it('only dates blog entries', () => {
		expect(xml.match(/<lastmod>/g) || []).toHaveLength(BLOG_POSTS_BY_DATE.length * 2);
	});

	it('only emits absolute URLs on the site origin', () => {
		for (const loc of locs) {
			expect(loc.startsWith(`${SITE_ORIGIN}/`) || loc === SITE_ORIGIN).toBe(true);
		}
	});
});
