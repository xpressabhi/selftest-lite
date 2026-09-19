import { describe, expect, it } from 'vitest';
import {
	BLOG_CATEGORIES,
	BLOG_POSTS,
	BLOG_POSTS_BY_DATE,
	formatBlogDate,
	getBlogCategory,
	getBlogPost,
	getRelatedPosts,
} from './blogPosts.js';
import { FAQ_ITEMS, FAQ_SECTIONS, faqAnchorId, getFaqItems } from './faqs.js';

describe('blog registry', () => {
	it('has unique, URL-safe slugs', () => {
		const slugs = BLOG_POSTS.map((post) => post.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		for (const slug of slugs) {
			expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
		}
	});

	it('gives every post the fields the pages render', () => {
		for (const post of BLOG_POSTS) {
			expect(post.titleKey).toBeTruthy();
			expect(post.excerptKey).toBeTruthy();
			expect(post.readTimeKey).toBeTruthy();
			expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(post.pointKeys.length).toBeGreaterThanOrEqual(3);
			expect(BLOG_CATEGORIES.some((category) => category.id === post.categoryId)).toBe(true);
		}
	});

	it('sorts the by-date view newest first', () => {
		const dates = BLOG_POSTS_BY_DATE.map((post) => post.date);
		expect([...dates].sort((a, b) => (a < b ? 1 : -1))).toEqual(dates);
	});

	it('resolves posts and categories, returning null for unknown ids', () => {
		expect(getBlogPost(BLOG_POSTS[0].slug)?.slug).toBe(BLOG_POSTS[0].slug);
		expect(getBlogPost('does-not-exist')).toBeNull();
		expect(getBlogCategory(BLOG_POSTS[0].categoryId)).toBeTruthy();
		expect(getBlogCategory('does-not-exist')).toBeNull();
	});

	it('never links related posts back to the current post', () => {
		const related = getRelatedPosts(BLOG_POSTS[0].slug, 3);
		expect(related.length).toBe(3);
		expect(related.some((post) => post.slug === BLOG_POSTS[0].slug)).toBe(false);
		expect(getRelatedPosts('does-not-exist')).toEqual([]);
	});

	it('formats dates for both interface languages', () => {
		expect(formatBlogDate('2026-08-16', 'english')).toContain('2026');
		expect(formatBlogDate('2026-08-16', 'hindi')).toContain('2026');
	});
});

describe('faq registry', () => {
	it('has unique item ids and non-empty sections', () => {
		const ids = FAQ_ITEMS.map((item) => item.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const section of FAQ_SECTIONS) {
			expect(section.id).toBeTruthy();
			expect(section.titleKey).toBeTruthy();
			expect(section.items.length).toBeGreaterThan(0);
		}
	});

	it('uses plain (1 key) or emphasised (3 key) answers only', () => {
		for (const item of FAQ_ITEMS) {
			expect([1, 3]).toContain(item.answerKeys.length);
			expect(item.answerKeys.every((key) => typeof key === 'string' && key)).toBe(true);
			expect(item.questionKey).toBeTruthy();
		}
	});

	it('builds stable anchors and filters unknown ids', () => {
		expect(faqAnchorId('offline')).toBe('q-offline');
		expect(getFaqItems(['offline', 'nope']).map((item) => item.id)).toEqual(['offline']);
	});
});
