export const SITE_URL = 'https://selftest.in';
export const SITE_NAME = 'selftest.in';
export const DEFAULT_OG_IMAGE = '/icons/512.png';

export function toAbsoluteUrl(path = '/') {
	if (!path) return SITE_URL;
	if (/^https?:\/\//i.test(path)) return path;
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	return `${SITE_URL}${normalizedPath}`;
}

export function buildPageMetadata({
	title,
	description,
	path = '/',
	keywords = [],
	type = 'website',
	publishedTime,
	modifiedTime,
} = {}) {
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	const canonicalUrl = toAbsoluteUrl(normalizedPath);

	const openGraph = {
		title,
		description,
		url: canonicalUrl,
		type,
		siteName: SITE_NAME,
		locale: 'en_IN',
		images: [
			{
				url: DEFAULT_OG_IMAGE,
				width: 512,
				height: 512,
				alt: `${SITE_NAME} logo`,
			},
		],
	};

	if (publishedTime) {
		openGraph.publishedTime = publishedTime;
	}
	if (modifiedTime) {
		openGraph.modifiedTime = modifiedTime;
	}

	return {
		title,
		description,
		keywords: Array.isArray(keywords) && keywords.length > 0 ? keywords : undefined,
		alternates: {
			canonical: normalizedPath,
		},
		openGraph,
		twitter: {
			card: 'summary_large_image',
			title,
			description,
			images: [DEFAULT_OG_IMAGE],
			creator: '@selftest_in',
		},
	};
}
