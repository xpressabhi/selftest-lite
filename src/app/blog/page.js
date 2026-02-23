import BlogIndexContent from './BlogIndexContent';
import { buildPageMetadata } from '../utils/seo';

export const metadata = buildPageMetadata({
	title: 'Blog',
	description:
		'Read practical study strategies, exam preparation guides, and AI quiz tips from selftest.in.',
	path: '/blog',
	keywords: ['study tips blog', 'exam preparation blog india', 'active recall tips'],
});

export default function BlogIndex() {
	return <BlogIndexContent />;
}
