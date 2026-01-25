import './globals.css';
import ClientNavbarWrapper from './components/ClientNavbarWrapper';
import OfflineIndicator from './components/OfflineIndicator';
import { Container, Row, Col } from 'react-bootstrap';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';

// ClientNavbarWrapper and LazyMetrics are client components that will
// perform dynamic imports on the client. Importing them here is allowed
// because they are simple components (no ssr:false in this file).

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
		<html lang='en'>
			<body>
				<ThemeProvider>
					<LanguageProvider>
						{/* Load bootstrap from CDN to avoid bundling the CSS into client JS */}
						<link rel='preconnect' href='https://fonts.googleapis.com' />
						<link rel='preconnect' href='https://fonts.gstatic.com' crossOrigin='anonymous' />
						<link
							href='https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap'
							rel='stylesheet'
						/>
						<link rel='preconnect' href='https://cdn.jsdelivr.net' />
						<link rel='dns-prefetch' href='https://cdn.jsdelivr.net' />
						<link
							rel='stylesheet'
							href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css'
						/>
						<link rel='manifest' href='/manifest.json' />
						<link rel='icon' href='/icons/192.png' />
						<meta name='viewport' content='width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5' />
						<meta name='theme-color' content='#6366f1' />
						<meta name='apple-mobile-web-app-capable' content='yes' />
						<meta name='apple-mobile-web-app-status-bar-style' content='default' />
						<meta name='mobile-web-app-capable' content='yes' />
						<meta name='keywords' content={metadata.keywords.join(', ')} />
						<link rel='canonical' href='https://selftest.in' />
						<meta
							name='google-adsense-account'
							content='ca-pub-7214001284506571'
						></meta>
						{/* Navbar is client-heavy; load it dynamically on the client to defer its JS */}
						{/* placeholder keeps layout height until client loads the full navbar */}
						{/* client Navbar (dynamically loaded) */}
						<ClientNavbarWrapper />
						<Container fluid className='mt-4'>
							<Row>
								{/* Spacer for desktop sidebar */}
								<Col
									lg={4}
									className='d-none d-lg-block'
									style={{ width: '400px' }}
								/>
								{/* Main content */}
								<Col lg={8} className='flex-grow-1'>
									{children}
								</Col>
							</Row>
						</Container>
						<Analytics />
						<SpeedInsights />
						<OfflineIndicator />
					</LanguageProvider>
				</ThemeProvider>
			</body>
		</html>
	);
}
