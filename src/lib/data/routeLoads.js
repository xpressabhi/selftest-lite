// Route loaders shared by the English and /hi dynamic routes. Keeping lookup
// and related-item logic here means the two language trees cannot drift, and
// the logic is unit-testable without a SvelteKit runtime.

import { BLOG_POSTS_BY_DATE, getBlogPost, getRelatedPosts } from './blogPosts.js';
import { OBJECTIVE_ONLY_EXAMS } from './indianExams.js';

export function examEntries() {
	return OBJECTIVE_ONLY_EXAMS.map((exam) => ({ examId: exam.id }));
}

export function blogEntries() {
	return BLOG_POSTS_BY_DATE.map((post) => ({ slug: post.slug }));
}

export function findExamPage(examId) {
	const exam = OBJECTIVE_ONLY_EXAMS.find((item) => item.id === examId);
	if (!exam) {
		return null;
	}
	const related = OBJECTIVE_ONLY_EXAMS.filter(
		(item) => item.id !== exam.id && (item.stream === exam.stream || item.group === exam.group)
	).slice(0, 3);
	return { exam, related };
}

export function findBlogPostPage(slug) {
	const post = getBlogPost(slug);
	if (!post) {
		return null;
	}
	return { slug, post, related: getRelatedPosts(slug, 3) };
}
