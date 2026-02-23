import AboutContent from './AboutContent';
import { buildPageMetadata } from '../utils/seo';

export const metadata = buildPageMetadata({
	title: 'About',
	description:
		'Learn about selftest.in, our mission, and how we build AI-powered quiz practice and exam paper experiences for learners in India.',
	path: '/about',
	keywords: ['about selftest', 'ai learning platform india', 'exam practice app'],
});

export default function AboutPage() {
	return <AboutContent />;
}
