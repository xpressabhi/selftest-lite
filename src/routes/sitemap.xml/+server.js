import { BLOG_POSTS_BY_DATE } from '$lib/data/blogPosts';

// Generated from the blog registry so new posts cannot fall out of the
// sitemap the way they did when it was a hand-maintained static file.
export const prerender = true;

const STATIC_PATHS = ['/', '/about', '/blog', '/faq', '/contact', '/privacy', '/terms'];

function urlEntry(loc, lastmod) {
	const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : '';
	return `  <url>\n    <loc>${loc}</loc>${lastmodTag}\n  </url>`;
}

export function GET() {
	const entries = [
		...STATIC_PATHS.map((path) => urlEntry(`https://selftest.in${path}`)),
		...BLOG_POSTS_BY_DATE.map((post) =>
			urlEntry(`https://selftest.in/blog/${post.slug}`, post.date)
		),
	];
	const xml = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...entries,
		'</urlset>',
		'',
	].join('\n');
	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'public, max-age=3600',
		},
	});
}
