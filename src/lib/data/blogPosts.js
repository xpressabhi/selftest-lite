/**
 * Blog content registry - the single source of truth for the blog index and
 * post pages.
 *
 * Every user-facing field is stored as a locale key (`titleKey`, ...) so both
 * English and Hindi stay in sync, and `locales.test.js` can assert that every
 * referenced key exists in both locale files.
 */

export const BLOG_CATEGORIES = [
	{ id: 'study-tips', labelKey: 'blogCategoryStudyTips' },
	{ id: 'exams', labelKey: 'blogCategoryExams' },
	{ id: 'science', labelKey: 'blogCategoryScience' },
	{ id: 'wellness', labelKey: 'blogCategoryWellness' },
	{ id: 'guide', labelKey: 'blogCategoryGuide' },
];

export const BLOG_POSTS = [
	{
		slug: 'how-to-study-effectively',
		categoryId: 'study-tips',
		date: '2024-11-24',
		readTimeKey: 'blogPost1ReadTime',
		titleKey: 'blogPost1Title',
		excerptKey: 'blogPost1Excerpt',
		pointKeys: [
			'blogPost1Point1',
			'blogPost1Point2',
			'blogPost1Point3',
			'blogPost1Point4',
			'blogPost1Point5',
		],
	},
	{
		slug: 'what-to-do-with-wrong-answers',
		categoryId: 'study-tips',
		date: '2026-08-16',
		modified: '2026-09-20',
		readTimeKey: 'blogPost8ReadTime',
		titleKey: 'blogPost8Title',
		excerptKey: 'blogPost8Excerpt',
		bodyKeys: [
			'blogPost8Body1',
			'blogPost8Body2',
			'blogPost8Body3',
			'blogPost8Body4',
			'blogPost8Body5',
			'blogPost8Body6',
		],
		pointKeys: [
			'blogPost8Point1',
			'blogPost8Point2',
			'blogPost8Point3',
			'blogPost8Point4',
			'blogPost8Point5',
		],
	},
	{
		slug: 'study-in-30-minute-blocks',
		categoryId: 'study-tips',
		date: '2026-06-07',
		readTimeKey: 'blogPost7ReadTime',
		titleKey: 'blogPost7Title',
		excerptKey: 'blogPost7Excerpt',
		pointKeys: [
			'blogPost7Point1',
			'blogPost7Point2',
			'blogPost7Point3',
			'blogPost7Point4',
			'blogPost7Point5',
		],
	},
	{
		slug: 'mock-tests-for-ssc-banking-railways',
		categoryId: 'exams',
		date: '2026-04-19',
		modified: '2026-09-20',
		readTimeKey: 'blogPost6ReadTime',
		titleKey: 'blogPost6Title',
		excerptKey: 'blogPost6Excerpt',
		bodyKeys: [
			'blogPost6Body1',
			'blogPost6Body2',
			'blogPost6Body3',
			'blogPost6Body4',
			'blogPost6Body5',
			'blogPost6Body6',
		],
		pointKeys: [
			'blogPost6Point1',
			'blogPost6Point2',
			'blogPost6Point3',
			'blogPost6Point4',
			'blogPost6Point5',
		],
	},
	{
		slug: 'board-exam-revision-plan',
		categoryId: 'exams',
		date: '2026-03-08',
		modified: '2026-09-20',
		readTimeKey: 'blogPost5ReadTime',
		titleKey: 'blogPost5Title',
		excerptKey: 'blogPost5Excerpt',
		bodyKeys: [
			'blogPost5Body1',
			'blogPost5Body2',
			'blogPost5Body3',
			'blogPost5Body4',
			'blogPost5Body5',
			'blogPost5Body6',
		],
		pointKeys: [
			'blogPost5Point1',
			'blogPost5Point2',
			'blogPost5Point3',
			'blogPost5Point4',
			'blogPost5Point5',
		],
	},
	{
		slug: 'spaced-repetition-explained',
		categoryId: 'science',
		date: '2024-11-15',
		readTimeKey: 'blogPost3ReadTime',
		titleKey: 'blogPost3Title',
		excerptKey: 'blogPost3Excerpt',
		pointKeys: [
			'blogPost3Point1',
			'blogPost3Point2',
			'blogPost3Point3',
			'blogPost3Point4',
			'blogPost3Point5',
		],
	},
	{
		slug: 'overcoming-exam-anxiety',
		categoryId: 'wellness',
		date: '2024-11-20',
		readTimeKey: 'blogPost2ReadTime',
		titleKey: 'blogPost2Title',
		excerptKey: 'blogPost2Excerpt',
		pointKeys: [
			'blogPost2Point1',
			'blogPost2Point2',
			'blogPost2Point3',
			'blogPost2Point4',
			'blogPost2Point5',
		],
	},
	{
		slug: 'best-prompts-for-learning',
		categoryId: 'guide',
		date: '2024-11-10',
		readTimeKey: 'blogPost4ReadTime',
		titleKey: 'blogPost4Title',
		excerptKey: 'blogPost4Excerpt',
		pointKeys: [
			'blogPost4Point1',
			'blogPost4Point2',
			'blogPost4Point3',
			'blogPost4Point4',
			'blogPost4Point5',
		],
	},
];

/** Newest first - keeps the index, related posts and JSON-LD consistent. */
export const BLOG_POSTS_BY_DATE = [...BLOG_POSTS].sort((a, b) => (a.date < b.date ? 1 : -1));

export function getBlogPost(slug) {
	return BLOG_POSTS.find((post) => post.slug === slug) || null;
}

export function getBlogCategory(categoryId) {
	return BLOG_CATEGORIES.find((category) => category.id === categoryId) || null;
}

/**
 * Related reading: same category first, then the most recent posts. Always
 * excludes the post being viewed so links never point at the current page.
 */
export function getRelatedPosts(slug, limit = 3) {
	const current = getBlogPost(slug);
	if (!current) {
		return [];
	}
	return BLOG_POSTS_BY_DATE.filter(
		(post) => post.slug !== slug && post.categoryId === current.categoryId
	)
		.concat(BLOG_POSTS_BY_DATE.filter((post) => post.categoryId !== current.categoryId))
		.slice(0, limit);
}

/** Localised medium date for an ISO `YYYY-MM-DD` string, noon to avoid TZ drift. */
export function formatBlogDate(isoDate, language) {
	return new Intl.DateTimeFormat(language === 'hindi' ? 'hi-IN' : 'en-IN', {
		dateStyle: 'medium',
	}).format(new Date(`${isoDate}T12:00:00`));
}
