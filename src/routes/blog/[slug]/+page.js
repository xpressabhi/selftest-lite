import { error } from '@sveltejs/kit';
import { getBlogPost, getRelatedPosts } from '$lib/data/blogPosts';

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
