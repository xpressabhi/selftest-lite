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
			<div className='text-center mb-5'>
				<h1 className='display-4 fw-bold mb-3'>Blog</h1>
				<p className='lead text-muted'>
					Tips, tricks, and techniques to help you learn smarter.
				</p>
			</div>

			<div className='row g-4'>
				{/* Blog Post Card */}
				<div className='col-md-6 col-lg-4'>
					<div className='card h-100 border-0 shadow-sm rounded-4 overflow-hidden'>
						<div className='card-body p-4 d-flex flex-column'>
							<div className='mb-3'>
								<span className='badge bg-primary-subtle text-primary rounded-pill px-3 py-2'>
									Study Tips
								</span>
							</div>
							<h2 className='h4 fw-bold mb-3'>
								<Link
									href='/blog/how-to-study-effectively'
									className='text-decoration-none text-dark stretched-link'
								>
									How to study effectively
								</Link>
							</h2>
							<p className='card-text text-muted mb-4 flex-grow-1'>
								Evidence-backed study techniques: active recall, spaced
								repetition, and how to use selftest.in to improve retention.
							</p>
							<div className='d-flex align-items-center text-muted small'>
								<span>5 min read</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</main>
	);
}
