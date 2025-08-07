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
				<Navbar />
				<main className='container-fluid mt-4'>{children}</main>
			</body>
		</html>
	);
}
