import FAQContent from './FAQContent';
import { buildPageMetadata } from '../utils/seo';

export const metadata = buildPageMetadata({
	title: 'FAQ',
	description:
		'Find answers about test generation, privacy, language support, and app usage on selftest.in.',
	path: '/faq',
	keywords: ['selftest faq', 'quiz generator faq', 'exam paper app questions'],
});

export default function FAQPage() {
	return <FAQContent />;
}
