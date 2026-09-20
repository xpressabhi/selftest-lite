import { BLOG_POSTS_BY_DATE } from '$lib/data/blogPosts';
import { OBJECTIVE_ONLY_EXAMS } from '$lib/data/indianExams';

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

// Keep static lastmod fresh without a rebuild-time clock dependency:
// pages are app-shell rendered, so a fixed recent date is honest enough
// for crawlers and avoids `new Date()` churn on every request.
const STATIC_LASTMOD = '2026-09-20';

function urlEntry(loc, lastmod) {
	const lastmodTag = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : '';
	return `  <url>\n    <loc>${loc}</loc>${lastmodTag}\n  </url>`;
}

export function GET() {
	const entries = [
		...STATIC_PATHS.map((path) =>
			urlEntry(`https://selftest.in${path}`, STATIC_LASTMOD)
		),
		...OBJECTIVE_ONLY_EXAMS.map((exam) =>
			urlEntry(`https://selftest.in/practice/${exam.id}`, STATIC_LASTMOD)
		),
		...BLOG_POSTS_BY_DATE.map((post) =>
			urlEntry(`https://selftest.in/blog/${post.slug}`, post.modified || post.date)
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
