// llms.txt builder (https://llmstxt.org) — a plain-text map of the site for
// AI search crawlers. Generated from the same registries as the sitemap so it
// cannot drift. Pure: no SvelteKit imports, unit-tested directly.

import { BLOG_POSTS_BY_DATE } from '$lib/data/blogPosts';
import { OBJECTIVE_ONLY_EXAMS } from '$lib/data/indianExams';
import english from '$lib/locales/english.json';
import { SITE_ORIGIN } from './seo.js';

const CORE_PAGES = [
	{ path: '/', label: 'AI quiz generator', note: 'generate a custom practice paper in seconds' },
	{ path: '/practice', label: 'Practice hub', note: 'all supported exams with syllabus and pattern' },
	{ path: '/blog', label: 'Blog', note: 'study tips, exam guides and science explainers' },
	{ path: '/faq', label: 'FAQ', note: 'how generation, scoring and privacy work' },
	{ path: '/about', label: 'About selftest.in', note: 'why it exists and how it works' },
	{ path: '/contact', label: 'Contact', note: 'akm.nitt@gmail.com or the portfolio link' },
];

function link(path, label, note) {
	const suffix = note ? `: ${note}` : '';
	return `- [${label}](${SITE_ORIGIN}${path})${suffix}`;
}

export function buildLlmsTxt() {
	const core = CORE_PAGES.map((page) => link(page.path, page.label, page.note));
	const exams = OBJECTIVE_ONLY_EXAMS.map((exam) =>
		link(`/practice/${exam.id}`, `${exam.name} mock tests`, 'syllabus, pattern and full-length tests')
	);
	const posts = BLOG_POSTS_BY_DATE.map((post) =>
		link(`/blog/${post.slug}`, english[post.titleKey] || post.slug)
	);

	return (
		[
			'# selftest.in',
			'',
			'> selftest.in is a free AI quiz and mock-test generator for Indian competitive exams ' +
				'(SSC, banking, railway, UPSC, JEE, NEET, state PSC and more). Practice papers are ' +
				'generated on demand with explanations, in English and Hindi.',
			'',
			'## Core pages',
			'',
			...core,
			'',
			'## Exams',
			'',
			...exams,
			'',
			'## Blog',
			'',
			...posts,
			'',
			'## Notes',
			'',
			'- Exam landing pages are stable, indexable URLs; generated test papers are private',
			'  application state and are not archived at public URLs.',
			'- Every page also exists in Hindi at the same path under /hi, e.g.',
			`  ${SITE_ORIGIN}/hi/practice/ssc-cgl.`,
			'',
		].join('\n')
	);
}
