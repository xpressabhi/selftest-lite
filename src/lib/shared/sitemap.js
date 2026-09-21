// Bilingual sitemap builder: English and /hi URLs with reciprocal xhtml:link
// alternates, generated from the same registries as the pages themselves.
// Pure so it can be unit-tested.

import { BLOG_POSTS_BY_DATE } from '$lib/data/blogPosts';
import { OBJECTIVE_ONLY_EXAMS } from '$lib/data/indianExams';
import { SITE_ORIGIN, localizedPath } from './seo.js';

export const STATIC_PATHS = [
	'/',
	'/about',
	'/blog',
	'/faq',
	'/contact',
	'/privacy',
	'/terms',
	'/practice',
];

function urlEntry(loc, alternates, lastmod) {
	const lines = ['  <url>', `    <loc>${loc}</loc>`];
	for (const alternate of alternates) {
		lines.push(
			`    <xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${alternate.href}"/>`
		);
	}
	if (lastmod) {
		lines.push(`    <lastmod>${lastmod}</lastmod>`);
	}
	lines.push('  </url>');
	return lines.join('\n');
}

export function buildSitemap() {
	const pages = [
		...STATIC_PATHS.map((path) => ({ path, lastmod: null })),
		...OBJECTIVE_ONLY_EXAMS.map((exam) => ({ path: `/practice/${exam.id}`, lastmod: null })),
		...BLOG_POSTS_BY_DATE.map((post) => ({
			path: `/blog/${post.slug}`,
			lastmod: post.modified || post.date,
		})),
	];

	const entries = [];
	for (const page of pages) {
		const english = `${SITE_ORIGIN}${page.path}`;
		const hindi = `${SITE_ORIGIN}${localizedPath(page.path, 'hindi')}`;
		const alternates = [
			{ hreflang: 'en-IN', href: english },
			{ hreflang: 'hi-IN', href: hindi },
			{ hreflang: 'x-default', href: english },
		];
		entries.push(urlEntry(english, alternates, page.lastmod));
		entries.push(urlEntry(hindi, alternates, page.lastmod));
	}

	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
		...entries,
		'</urlset>',
		'',
	].join('\n');
}
