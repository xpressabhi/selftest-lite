import './globals.css';
import MobileOptimizedLayout from './components/MobileOptimizedLayout';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { DataSaverProvider } from './context/DataSaverContext';
import { AuthProvider } from './context/AuthContext';
import UserDataSyncManager from './components/UserDataSyncManager';
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, toAbsoluteUrl } from './utils/seo';

export const metadata = {
	metadataBase: new URL(SITE_URL),
	title: {
		default: 'AI Quiz & Exam Paper Generator for India',
		template: '%s | selftest.in',
	},
	applicationName: 'selftest.in',
	description:
		'Create AI-powered quiz practice and full objective exam papers for Indian competitive exams in Hindi and English.',
	keywords: [
		'selftest',
		'selftest.in',
		'ai quiz generator',
		'exam paper generator india',
		'objective exam practice',
		'upsc quiz',
		'ssc quiz',
		'banking exam practice',
		'railway exam practice',
		'india government exam mock test',
		'hindi english quiz',
		'multiple choice test generator',
		'study practice tests',
	],
	category: 'education',
	referrer: 'origin-when-cross-origin',
	alternates: {
		canonical: '/',
	},
	openGraph: {
		type: 'website',
		siteName: SITE_NAME,
		url: SITE_URL,
		title: 'AI Quiz & Exam Paper Generator for India',
		description:
			'Generate objective quiz practice and full-length exam papers for Indian exams with AI. Supports Hindi and English.',
		locale: 'en_IN',
		images: [
			{
				url: DEFAULT_OG_IMAGE,
				width: 512,
				height: 512,
				alt: 'selftest.in logo',
			},
		],
	},
	twitter: {
		card: 'summary_large_image',
		title: 'AI Quiz & Exam Paper Generator for India',
		description:
			'Generate objective quiz practice and full-length exam papers for Indian exams with AI.',
		images: [DEFAULT_OG_IMAGE],
		creator: '@selftest_in',
	},
	icons: {
		icon: '/icons/192.png',
		apple: '/icons/192.png',
	},
	manifest: '/manifest.json',
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			'max-video-preview': -1,
			'max-image-preview': 'large',
			'max-snippet': -1,
		},
	},
};

export default function RootLayout({ children }) {
	const organizationJsonLd = {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: SITE_NAME,
		url: SITE_URL,
		logo: toAbsoluteUrl('/icons/512.png'),
		sameAs: ['https://x.com/selftest_in'],
	};

	const websiteJsonLd = {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: SITE_NAME,
		url: SITE_URL,
		inLanguage: ['en-IN', 'hi-IN'],
		potentialAction: {
			'@type': 'SearchAction',
			target: `${SITE_URL}/?q={search_term_string}`,
			'query-input': 'required name=search_term_string',
		},
	};

	return (
		<html lang='en' suppressHydrationWarning>
			<head>
				{/* Preconnect to external domains for faster loading */}
				<link rel='preconnect' href='https://cdn.jsdelivr.net' />
				<link rel='dns-prefetch' href='https://cdn.jsdelivr.net' />

				{/* Bootstrap CSS from CDN - avoids bundling */}
				<link
					rel='stylesheet'
					href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css'
				/>

				{/* PWA manifest and icons */}
				<link rel='manifest' href='/manifest.json' />
				<link rel='icon' href='/icons/192.png' />
				<link rel='apple-touch-icon' href='/icons/192.png' />

					{/* Viewport and mobile settings */}
					<meta
						name='viewport'
						content='width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content, maximum-scale=5, user-scalable=yes'
					/>
					<meta name='theme-color' content='#6366f1' media='(prefers-color-scheme: light)' />
					<meta name='theme-color' content='#0f0f1a' media='(prefers-color-scheme: dark)' />
					<meta name='color-scheme' content='light dark' />
					<meta name='apple-mobile-web-app-capable' content='yes' />
					<meta name='apple-mobile-web-app-title' content='selftest.in' />
					<meta name='apple-mobile-web-app-status-bar-style' content='default' />
					<meta name='mobile-web-app-capable' content='yes' />
					<meta name='format-detection' content='telephone=no' />

				{/* AdSense */}
				<meta name='google-adsense-account' content='ca-pub-7214001284506571' />
				<script
					type='application/ld+json'
					dangerouslySetInnerHTML={{
						__html: JSON.stringify(organizationJsonLd),
					}}
				/>
				<script
					type='application/ld+json'
					dangerouslySetInnerHTML={{
						__html: JSON.stringify(websiteJsonLd),
					}}
				/>
			</head>
			<body>
				<ThemeProvider>
					<DataSaverProvider>
						<LanguageProvider>
							<AuthProvider>
								<UserDataSyncManager />
								<MobileOptimizedLayout>
									{children}
								</MobileOptimizedLayout>
								<Analytics />
								<SpeedInsights />
							</AuthProvider>
						</LanguageProvider>
					</DataSaverProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
