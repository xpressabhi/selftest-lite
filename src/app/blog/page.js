import React from 'react';
import Link from 'next/link';

export const metadata = {
	title: 'Blog — selftest.in',
	description:
		'Articles on learning techniques, test preparation, and how to use selftest.in effectively.',
};

export default function BlogIndex() {
	return (
		<main className='container py-5'>
			<h1>Blog</h1>
			<p>Helpful articles about learning, quizzes, and exam preparation.</p>

			<ul>
				<li>
					<Link href='/blog/how-to-study-effectively'>
						How to study effectively
					</Link>
				</li>
			</ul>
		</main>
	);
}
