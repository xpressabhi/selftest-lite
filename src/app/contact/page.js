import ContactContent from './ContactContent';
import { buildPageMetadata } from '../utils/seo';

export const metadata = buildPageMetadata({
	title: 'Contact',
	description:
		'Contact selftest.in for product feedback, support, partnerships, or questions about AI quiz and exam paper generation.',
	path: '/contact',
	keywords: ['contact selftest', 'selftest support', 'quiz app support'],
});

export default function ContactPage() {
	return <ContactContent />;
}
