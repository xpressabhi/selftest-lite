'use client';

import React from 'react';

// export const metadata = {
// 	title: 'Contact — selftest.in',
// 	description:
// 		'Contact selftest.in for support, feedback, or partnership inquiries.',
// };

export default function ContactPage() {
	return (
		<main className='container py-5'>
			<h1>Contact</h1>
			<p>
				If you have questions or feedback, please connect via LinkedIn or review
				the contact preview below.
			</p>

			<section className='my-4'>
				<h2>About me</h2>
				<p>
					Hi — I&apos;m Abhishek Maurya. I build simple tools and educational
					apps to help people learn more effectively. You can connect with me on{' '}
					<a
						href='https://www.linkedin.com/in/akm85/'
						target='_blank'
						rel='noopener noreferrer'
					>
						LinkedIn
					</a>
					.
				</p>
			</section>
		</main>
	);
}
