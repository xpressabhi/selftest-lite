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
			<div className='row justify-content-center'>
				<div className='col-lg-8'>
					<div className='text-center mb-5'>
						<h1 className='display-4 fw-bold mb-3'>Get in Touch</h1>
						<p className='lead text-muted'>
							Have questions, feedback, or just want to say hello? I&apos;d love
							to hear from you.
						</p>
					</div>

					<div className='card border-0 shadow-sm rounded-4 overflow-hidden'>
						<div className='card-body p-5'>
							<div className='row align-items-center'>
								<div className='col-md-4 text-center mb-4 mb-md-0'>
									<div
										className='bg-primary text-white rounded-circle d-flex align-items-center justify-content-center mx-auto'
										style={{ width: '100px', height: '100px', fontSize: '2.5rem' }}
									>
										AM
									</div>
								</div>
								<div className='col-md-8'>
									<h2 className='h3 fw-bold mb-2'>Abhishek Maurya</h2>
									<p className='text-muted mb-4'>
										Creator of selftest.in
									</p>
									<p className='mb-4'>
										Hi! I build simple tools and educational apps to help people
										learn more effectively. If you have any suggestions for
										improving selftest.in, please reach out.
									</p>
									<a
										href='https://www.linkedin.com/in/akm85/'
										target='_blank'
										rel='noopener noreferrer'
										className='btn btn-primary rounded-pill px-4'
									>
										Connect on LinkedIn
									</a>
								</div>
							</div>
						</div>
						<div className='card-footer bg-light p-4 text-center border-top-0'>
							<p className='mb-0 text-muted small'>
								Looking for support? You can also message me directly on LinkedIn
								for the fastest response.
							</p>
						</div>
					</div>
				</div>
			</div>
		</main>
	);
}
