import HomeContent from './HomeContent';
import { buildPageMetadata } from './utils/seo';

export const metadata = buildPageMetadata({
	title: 'AI Quiz & Exam Paper Generator for India',
	description:
		'Generate objective quiz practice and full-length exam papers for Indian competitive exams. Supports Hindi and English with instant scoring and AI explanations on demand.',
	path: '/',
	keywords: [
		'ai quiz generator india',
		'competitive exam mock tests',
		'objective exam paper generator',
		'hindi english practice tests',
	],
});

export default function Home() {
	return <HomeContent />;
}
