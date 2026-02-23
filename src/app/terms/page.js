import TermsContent from './TermsContent';
import { buildPageMetadata } from '../utils/seo';

export const metadata = buildPageMetadata({
	title: 'Terms of Service',
	description:
		'Read the terms and acceptable use policy for using selftest.in quiz and exam paper tools.',
	path: '/terms',
	keywords: ['selftest terms', 'quiz app terms of service'],
});

export default function TermsPage() {
	return <TermsContent />;
}
