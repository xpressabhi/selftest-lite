import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import { Geist, Geist_Mono } from 'next/font/google';
import Navbar from './components/Navbar';
import 'bootstrap/dist/css/bootstrap.min.css';

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
				<link rel="manifest" href="/manifest.json" />
				<meta name="theme-color" content="#000000" />
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
				<Navbar />
				<main className='container-fluid mt-4'>{children}</main>
			</body>
		</html>
	);
}
