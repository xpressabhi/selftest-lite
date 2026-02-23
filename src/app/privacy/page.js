import PrivacyContent from './PrivacyContent';
import { buildPageMetadata } from '../utils/seo';

export const metadata = buildPageMetadata({
	title: 'Privacy Policy',
	description:
		'Review how selftest.in handles data, local storage, account sync, analytics, and user privacy rights.',
	path: '/privacy',
	keywords: ['selftest privacy policy', 'data privacy education app'],
});

export default function PrivacyPage() {
	return <PrivacyContent />;
}
