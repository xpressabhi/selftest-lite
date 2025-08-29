import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { Geist, Geist_Mono } from 'next/font/google';
import CustomNavbar from './components/Navbar';
import 'katex/dist/katex.min.css';

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
				<div className='container-fluid mt-4'>
					<div className='row'>
						{/* Spacer for desktop sidebar */}
						<div className='col-lg-4 d-none d-lg-block' style={{ width: '400px' }} />
						{/* Main content */}
						<div className='col-lg-8 flex-grow-1'>
							{children}
						</div>
					</div>
				</div>
				<Analytics />
			</body>
		</html>
	);
}
