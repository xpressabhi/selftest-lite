import { describe, expect, it } from 'vitest';
import { BLOG_POSTS_BY_DATE } from '$lib/data/blogPosts';
import { OBJECTIVE_ONLY_EXAMS } from '$lib/data/indianExams';
import { SITE_ORIGIN } from './seo.js';
import { buildLlmsTxt } from './llms.js';

const text = buildLlmsTxt();

describe('buildLlmsTxt', () => {
	it('starts with the H1 and a blockquote summary', () => {
		expect(text.startsWith('# selftest.in\n\n> ')).toBe(true);
	});

	it('lists every exam landing page exactly once', () => {
		for (const exam of OBJECTIVE_ONLY_EXAMS) {
			const url = `${SITE_ORIGIN}/practice/${exam.id}`;
			expect(text.split(url).length - 1).toBe(1);
		}
	});

	it('lists every blog post', () => {
		for (const post of BLOG_POSTS_BY_DATE) {
			expect(text).toContain(`${SITE_ORIGIN}/blog/${post.slug}`);
		}
	});

	it('only links absolute https URLs on the site origin', () => {
		const urls = text.match(/https?:\/\/\S+/g) ?? [];
		expect(urls.length).toBeGreaterThan(0);
		for (const url of urls) {
			expect(url.startsWith(`${SITE_ORIGIN}/`)).toBe(true);
		}
	});

	it('ends with a trailing newline', () => {
		expect(text.endsWith('\n')).toBe(true);
	});

	it('documents the Hindi URL space', () => {
		expect(text).toContain(`${SITE_ORIGIN}/hi/practice/ssc-cgl`);
	});
});
