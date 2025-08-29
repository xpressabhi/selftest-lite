import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { Geist, Geist_Mono } from 'next/font/google';
import CustomNavbar from './components/Navbar';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'katex/dist/katex.min.css';
import { Container, Row, Col } from 'react-bootstrap';

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
});

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
});

export const metadata = {
	title: 'selftest.in',
	description:
		'A web application that allows you to generate and take multiple-choice quizzes on any topic you can imagine.',
};

export default function RootLayout({ children }) {
	return (
		<html lang='en'>
			<body className={`${geistSans.variable} ${geistMono.variable}`}>
				<link rel='manifest' href='/manifest.json' />
				<meta name='theme-color' content='#000000' />
				<script
					dangerouslySetInnerHTML={{
						__html: `
							if ('serviceWorker' in navigator) {
								window.addEventListener('load', function() {
									navigator.serviceWorker.register('/sw.js').then(function(registration) {
										console.log('Service Worker registration successful with scope: ', registration.scope);
									}, function(err) {
										console.log('Service Worker registration failed: ', err);
									});
								});
							}
						`,
					}}
				/>
				<CustomNavbar />
				<Container fluid className='mt-4'>
					<Row>
						{/* Spacer for desktop sidebar */}
						<Col lg={4} className='d-none d-lg-block' style={{ width: '400px' }} />
						{/* Main content */}
						<Col lg={8} className='flex-grow-1'>
							{children}
						</Col>
					</Row>
				</Container>
				<Analytics />
			</body>
		</html>
	);
}
