import React from 'react';

export const metadata = {
	title: 'Privacy Policy — selftest.in',
	description:
		'Privacy policy for selftest.in. Learn how we collect and use data.',
};

export default function PrivacyPage() {
	return (
		<main className='container py-5'>
			<div className='row justify-content-center'>
				<div className='col-lg-8'>
					<h1 className='display-4 fw-bold mb-4'>Privacy Policy</h1>
					<p className='lead text-muted mb-5'>
						This page describes how selftest.in collects, uses, and protects your
						personal information.
					</p>

					<div className='mb-5'>
						<h2 className='h3 fw-bold mb-3'>Data we collect</h2>
						<ul className='list-group list-group-flush'>
							<li className='list-group-item bg-transparent px-0 py-3'>
								<strong>Test History:</strong> Stored locally in your browser. We
								do not sync this data to our servers unless you explicitly sign
								in (feature coming soon).
							</li>
							<li className='list-group-item bg-transparent px-0 py-3'>
								<strong>Contact Information:</strong> Optional. If you reach out
								via our contact form, we collect your name and email to respond
								to your inquiry.
							</li>
							<li className='list-group-item bg-transparent px-0 py-3'>
								<strong>Analytics:</strong> We use anonymous analytics tools
								(like Vercel Analytics) to understand how our site is used and
								to improve performance.
							</li>
						</ul>
					</div>

					<div className='mb-5'>
						<h2 className='h3 fw-bold mb-3'>How we use data</h2>
						<p className='text-muted'>
							Data is used solely to improve quiz quality, measure usage trends,
							and help diagnose technical issues. We do <strong>not</strong>{' '}
							sell user data to third parties.
						</p>
					</div>

					<div className='mb-5'>
						<h2 className='h3 fw-bold mb-3'>Cookies and tracking</h2>
						<p className='text-muted'>
							We may use cookies and third-party analytics to enhance your
							experience. You can opt out via your browser settings where
							applicable.
						</p>
					</div>

					<div className='text-muted small border-top pt-4 mt-5'>
						Last updated: November 2024
					</div>
				</div>
			</div>
		</main>
	);
}
