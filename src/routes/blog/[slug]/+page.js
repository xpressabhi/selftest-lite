import { error } from '@sveltejs/kit';
import { BLOG_POSTS_BY_DATE, getBlogPost, getRelatedPosts } from '$lib/data/blogPosts';

export const prerender = true;

export function entries() {
	return BLOG_POSTS_BY_DATE.map((post) => ({ slug: post.slug }));
}

export function load({ params }) {
	const post = getBlogPost(params.slug);
	if (!post) {
		error(404, 'Blog post not found');
	}
	return {
		slug: params.slug,
		post,
		related: getRelatedPosts(params.slug, 3),
	};
}
