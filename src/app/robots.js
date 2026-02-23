import { SITE_URL } from './utils/seo';

export default function robots() {
	return {
		rules: [
			{
				userAgent: '*',
				allow: '/',
				disallow: ['/api/', '/test', '/results', '/history', '/bookmarks'],
			},
		],
		sitemap: `${SITE_URL}/sitemap.xml`,
		host: SITE_URL,
	};
}
