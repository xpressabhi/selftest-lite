import React from 'react';
import Icon from '../components/Icon';

export const metadata = {
	title: 'Privacy Policy — selftest.in',
	description:
		'Privacy policy for selftest.in. Learn how we collect and use data.',
};

export default function PrivacyPage() {
	return (
		<main className='container py-5'>
			<div className='row justify-content-center'>
				<div className='col-lg-10'>
					<div className='text-center mb-5'>
						<h1 className='display-4 fw-bold mb-3'>Privacy Policy</h1>
						<p className='lead text-muted'>
							Transparency is key. Here is how we handle your data.
						</p>
					</div>

					<div className='row'>
						{/* Sidebar Navigation (Desktop) */}
						<div className='col-lg-3 d-none d-lg-block'>
							<div className='sticky-top' style={{ top: '100px' }}>
								<nav id='privacy-nav' className='nav flex-column'>
									<a className='nav-link text-muted active fw-bold' href='#collection'>Data Collection</a>
									<a className='nav-link text-muted' href='#usage'>Data Usage</a>
									<a className='nav-link text-muted' href='#cookies'>Cookies</a>
									<a className='nav-link text-muted' href='#rights'>Your Rights</a>
									<a className='nav-link text-muted' href='#contact'>Contact Us</a>
								</nav>
							</div>
						</div>

						{/* Content */}
						<div className='col-lg-9'>
							<div className='card border-0 shadow-sm rounded-4 p-4 p-md-5'>
								<div className='mb-5' id='collection'>
									<div className='d-flex align-items-center mb-3'>
										<div className='p-2 bg-primary-subtle text-primary rounded-circle me-3'>
											<Icon name='file' size={20} />
										</div>
										<h2 className='h3 fw-bold mb-0'>1. Data we collect</h2>
									</div>
									<p className='text-muted mb-4'>
										We believe in minimizing data collection. We only collect what is strictly necessary
										to provide our service.
									</p>
									<div className='bg-light rounded-4 p-4'>
										<ul className='list-unstyled mb-0'>
											<li className='mb-3 d-flex align-items-start'>
												<Icon name='checkCircle' className='text-success me-2 mt-1' size={18} />
												<div>
													<strong>Test History:</strong> Stored locally in your browser&apos;s LocalStorage.
													We do not sync this data to our servers unless you explicitly sign in (feature coming soon).
												</div>
											</li>
											<li className='mb-3 d-flex align-items-start'>
												<Icon name='checkCircle' className='text-success me-2 mt-1' size={18} />
												<div>
													<strong>Contact Information:</strong> Optional. If you reach out via our contact form,
													we collect your name and email to respond to your inquiry.
												</div>
											</li>
											<li className='d-flex align-items-start'>
												<Icon name='checkCircle' className='text-success me-2 mt-1' size={18} />
												<div>
													<strong>Analytics:</strong> We use anonymous analytics tools (like Vercel Analytics)
													to understand how our site is used and to improve performance.
												</div>
											</li>
										</ul>
									</div>
								</div>

								<div className='mb-5' id='usage'>
									<div className='d-flex align-items-center mb-3'>
										<div className='p-2 bg-primary-subtle text-primary rounded-circle me-3'>
											<Icon name='lightbulb' size={20} />
										</div>
										<h2 className='h3 fw-bold mb-0'>2. How we use data</h2>
									</div>
									<p className='text-muted'>
										Data is used solely to improve quiz quality, measure usage trends, and help diagnose technical issues.
										We do <strong>not</strong> sell user data to third parties.
									</p>
								</div>

								<div className='mb-5' id='cookies'>
									<div className='d-flex align-items-center mb-3'>
										<div className='p-2 bg-primary-subtle text-primary rounded-circle me-3'>
											<Icon name='info' size={20} />
										</div>
										<h2 className='h3 fw-bold mb-0'>3. Cookies and tracking</h2>
									</div>
									<p className='text-muted'>
										We may use cookies and third-party analytics to enhance your experience.
										You can opt out via your browser settings where applicable.
									</p>
								</div>

								<div className='mb-5' id='rights'>
									<div className='d-flex align-items-center mb-3'>
										<div className='p-2 bg-primary-subtle text-primary rounded-circle me-3'>
											<Icon name='lock' size={20} />
										</div>
										<h2 className='h3 fw-bold mb-0'>4. Your Rights</h2>
									</div>
									<p className='text-muted'>
										Since most data is stored locally on your device, you have full control over it.
										You can delete your test history at any time by clearing your browser cache or using the
										&quot;Clear History&quot; button in the app settings.
									</p>
								</div>

								<div className='mb-0' id='contact'>
									<div className='d-flex align-items-center mb-3'>
										<div className='p-2 bg-primary-subtle text-primary rounded-circle me-3'>
											<Icon name='envelope' size={20} />
										</div>
										<h2 className='h3 fw-bold mb-0'>5. Contact Us</h2>
									</div>
									<p className='text-muted mb-3'>
										If you have any questions about this Privacy Policy, please contact us:
									</p>
									<a href='/contact' className='btn btn-outline-primary rounded-pill px-4'>
										Contact Support
									</a>
								</div>

								<div className='text-muted small border-top pt-4 mt-5'>
									Last updated: November 2024
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</main>
	);
}
