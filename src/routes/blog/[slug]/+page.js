import { error } from '@sveltejs/kit';

const posts = {
	'how-to-study-effectively': {
		titleKey: 'blogPost1Title',
		excerptKey: 'blogPost1Excerpt',
		categoryKey: 'blogPost1Category',
		dateKey: 'blogPost1Date',
		readTimeKey: 'blogPost1ReadTime',
		pointKeys: ['blogPost1Point1', 'blogPost1Point2', 'blogPost1Point3'],
	},
	'overcoming-exam-anxiety': {
		titleKey: 'blogPost2Title',
		excerptKey: 'blogPost2Excerpt',
		categoryKey: 'blogPost2Category',
		dateKey: 'blogPost2Date',
		readTimeKey: 'blogPost2ReadTime',
		pointKeys: ['blogPost2Point1', 'blogPost2Point2', 'blogPost2Point3'],
	},
	'spaced-repetition-explained': {
		titleKey: 'blogPost3Title',
		excerptKey: 'blogPost3Excerpt',
		categoryKey: 'blogPost3Category',
		dateKey: 'blogPost3Date',
		readTimeKey: 'blogPost3ReadTime',
		pointKeys: ['blogPost3Point1', 'blogPost3Point2', 'blogPost3Point3'],
	},
	'best-prompts-for-learning': {
		titleKey: 'blogPost4Title',
		excerptKey: 'blogPost4Excerpt',
		categoryKey: 'blogPost4Category',
		dateKey: 'blogPost4Date',
		readTimeKey: 'blogPost4ReadTime',
		pointKeys: ['blogPost4Point1', 'blogPost4Point2', 'blogPost4Point3'],
	},
};

export function load({ params }) {
	const post = posts[params.slug];
	if (!post) {
		error(404, 'Blog post not found');
	}
	return {
		slug: params.slug,
		post,
	};
}
