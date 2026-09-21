import { BLOG_POSTS_BY_DATE } from '$lib/data/blogPosts';
import { OBJECTIVE_ONLY_EXAMS } from '$lib/data/indianExams';
import { SITE_ORIGIN } from '$lib/shared/seo';

// Generated from the blog registry so new posts cannot fall out of the
// sitemap the way they did when it was a hand-maintained static file.
export const prerender = true;

const STATIC_PATHS = [
	'/',
	'/about',
	'/blog',
	'/faq',
	'/contact',
	'/privacy',
	'/terms',
	'/practice',
];

// No fabricated lastmod: static and exam pages have no meaningful
// single-file modification date, and a stale constant is worse than none.
// Blog entries carry the real post date so Google can trust it.

function urlEntry(loc, lastmod) {
	const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : '';
	return `  <url>\n    <loc>${loc}</loc>${lastmodTag}\n  </url>`;
}

export function GET() {
	const entries = [
		...STATIC_PATHS.map((path) => urlEntry(`${SITE_ORIGIN}${path}`)),
		...OBJECTIVE_ONLY_EXAMS.map((exam) =>
			urlEntry(`${SITE_ORIGIN}/practice/${exam.id}`)
		),
		...BLOG_POSTS_BY_DATE.map((post) =>
			urlEntry(`${SITE_ORIGIN}/blog/${post.slug}`, post.modified || post.date)
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
