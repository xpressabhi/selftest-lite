import { BLOG_POSTS_BY_DATE } from '$lib/data/blogPosts';
import english from '$lib/locales/english.json';
import { SITE_ORIGIN } from '$lib/shared/seo';

export const prerender = true;

function escapeXml(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function GET() {
	const items = BLOG_POSTS_BY_DATE.map((post) => {
		const title = english[post.titleKey] || post.slug;
		const description = english[post.excerptKey] || '';
		const pubDate = new Date(`${post.date}T12:00:00Z`).toUTCString();
		return [
			'    <item>',
			`      <title>${escapeXml(title)}</title>`,
			`      <link>${SITE_ORIGIN}/blog/${post.slug}</link>`,
			`      <guid>${SITE_ORIGIN}/blog/${post.slug}</guid>`,
			`      <pubDate>${pubDate}</pubDate>`,
			`      <description>${escapeXml(description)}</description>`,
			'    </item>',
		].join('\n');
	}).join('\n');
	const xml = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<rss version="2.0">',
		'  <channel>',
		'    <title>selftest.in Blog</title>',
		'    <link>' + SITE_ORIGIN + '/blog</link>',
		'    <description>Study tips, active recall guides and AI quiz strategy for Indian exams.</description>',
		'    <language>en-IN</language>',
		items,
		'  </channel>',
		'</rss>',
		'',
	].join('\n');
	return new Response(xml, {
		headers: {
			'Content-Type': 'application/rss+xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
		},
	});
}
