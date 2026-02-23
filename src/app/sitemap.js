import { SITE_URL } from './utils/seo';

const STATIC_ROUTES = [
	{ path: '/', changeFrequency: 'daily', priority: 1.0 },
	{ path: '/about', changeFrequency: 'monthly', priority: 0.8 },
	{ path: '/blog', changeFrequency: 'weekly', priority: 0.85 },
	{ path: '/faq', changeFrequency: 'monthly', priority: 0.75 },
	{ path: '/contact', changeFrequency: 'monthly', priority: 0.7 },
	{ path: '/privacy', changeFrequency: 'yearly', priority: 0.55 },
	{ path: '/terms', changeFrequency: 'yearly', priority: 0.55 },
];

const BLOG_ROUTES = [
	{ slug: 'how-to-study-effectively', date: '2024-11-24' },
	{ slug: 'overcoming-exam-anxiety', date: '2024-11-20' },
	{ slug: 'spaced-repetition-explained', date: '2024-11-15' },
	{ slug: 'best-prompts-for-learning', date: '2024-11-10' },
];

export default function sitemap() {
	const now = new Date();

	const staticEntries = STATIC_ROUTES.map((route) => ({
		url: `${SITE_URL}${route.path}`,
		lastModified: now,
		changeFrequency: route.changeFrequency,
		priority: route.priority,
	}));

	const blogEntries = BLOG_ROUTES.map((route) => ({
		url: `${SITE_URL}/blog/${route.slug}`,
		lastModified: new Date(route.date),
		changeFrequency: 'yearly',
		priority: 0.7,
	}));

	return [...staticEntries, ...blogEntries];
}
