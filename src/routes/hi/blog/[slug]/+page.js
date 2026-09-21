import { error } from '@sveltejs/kit';
import { blogEntries, findBlogPostPage } from '$lib/data/routeLoads';

export const prerender = true;

export function entries() {
	return blogEntries();
}

export function load({ params }) {
	const page = findBlogPostPage(params.slug);
	if (!page) {
		error(404, 'Blog post not found');
	}
	return page;
}
