import './globals.css';
import MobileOptimizedLayout from './components/MobileOptimizedLayout';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { DataSaverProvider } from './context/DataSaverContext';

export const metadata = {
	title: 'selftest.in',
	description:
		'A web application that allows you to generate and take multiple-choice quizzes on any topic you can imagine.',
	keywords: [
		'quizzes',
		'practice tests',
		'study',
		'learning',
		'selftest',
		'multiple choice',
	],
};

export default function RootLayout({ children }) {
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
					content='width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5, user-scalable=yes'
				/>
				<meta name='theme-color' content='#6366f1' media='(prefers-color-scheme: light)' />
				<meta name='theme-color' content='#0f0f1a' media='(prefers-color-scheme: dark)' />
				<meta name='apple-mobile-web-app-capable' content='yes' />
				<meta name='apple-mobile-web-app-status-bar-style' content='default' />
				<meta name='mobile-web-app-capable' content='yes' />
				<meta name='format-detection' content='telephone=no' />

				{/* SEO metadata */}
				<meta name='keywords' content={metadata.keywords.join(', ')} />
				<link rel='canonical' href='https://selftest.in' />

				{/* AdSense */}
				<meta name='google-adsense-account' content='ca-pub-7214001284506571' />
			</head>
			<body>
				<ThemeProvider>
					<DataSaverProvider>
						<LanguageProvider>
							<MobileOptimizedLayout>
								{children}
							</MobileOptimizedLayout>
							<Analytics />
							<SpeedInsights />
						</LanguageProvider>
					</DataSaverProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
