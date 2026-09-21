import { describe, expect, it } from 'vitest';
import { BLOG_POSTS_BY_DATE } from './blogPosts.js';
import { OBJECTIVE_ONLY_EXAMS } from './indianExams.js';
import { blogEntries, examEntries, findBlogPostPage, findExamPage } from './routeLoads.js';

describe('route entries', () => {
	it('enumerates every exam exactly once', () => {
		const entries = examEntries();
		expect(entries).toHaveLength(OBJECTIVE_ONLY_EXAMS.length);
		expect(new Set(entries.map((entry) => entry.examId)).size).toBe(entries.length);
	});

	it('enumerates every blog post exactly once', () => {
		const entries = blogEntries();
		expect(entries).toHaveLength(BLOG_POSTS_BY_DATE.length);
		expect(new Set(entries.map((entry) => entry.slug)).size).toBe(entries.length);
	});
});

describe('findExamPage', () => {
	it('returns the exam with at most three related exams excluding itself', () => {
		const result = findExamPage('ssc-cgl');
		expect(result.exam.id).toBe('ssc-cgl');
		expect(result.related.length).toBeGreaterThan(0);
		expect(result.related.length).toBeLessThanOrEqual(3);
		expect(result.related.some((exam) => exam.id === 'ssc-cgl')).toBe(false);
	});

	it('returns null for unknown ids', () => {
		expect(findExamPage('not-an-exam')).toBeNull();
	});
});

describe('findBlogPostPage', () => {
	it('returns the post with related posts', () => {
		const slug = BLOG_POSTS_BY_DATE[0].slug;
		const result = findBlogPostPage(slug);
		expect(result.slug).toBe(slug);
		expect(result.post.slug).toBe(slug);
		expect(result.related.length).toBeLessThanOrEqual(3);
		expect(result.related.some((post) => post.slug === slug)).toBe(false);
	});

	it('returns null for unknown slugs', () => {
		expect(findBlogPostPage('not-a-post')).toBeNull();
	});
});
