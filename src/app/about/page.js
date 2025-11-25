import React from 'react';
import Link from 'next/link';

export const metadata = {
	title: 'About — selftest.in',
	description:
		'Learn about selftest.in — mission, features, and how we generate custom quizzes for learning and assessment.',
};

export default function AboutPage() {
	return (
		<main className='container py-5'>
			{/* Hero Section */}
			<section className='text-center mb-5'>
				<h1 className='display-4 fw-bold mb-3'>About selftest.in</h1>
				<p className='lead text-muted mx-auto' style={{ maxWidth: '700px' }}>
					Your personal AI tutor. We help you learn faster and remember longer
					through customized quizzes and evidence-based study techniques.
				</p>
			</section>

			{/* Mission Section */}
			<section className='row align-items-center mb-5'>
				<div className='col-lg-6 mb-4 mb-lg-0'>
					<h2 className='h2 fw-bold mb-3'>Our Mission</h2>
					<p className='fs-5 text-secondary'>
						We believe learning should be active, not passive. Whether you&apos;re
						preparing for a high-stakes exam or mastering a new hobby,
						selftest.in gives you the tools to practice effectively using{' '}
						<strong>Active Recall</strong> and <strong>Spaced Repetition</strong>.
					</p>
				</div>
				<div className='col-lg-6'>
					<div className='p-4 bg-light rounded-4 border'>
						<h3 className='h5 fw-bold mb-3'>Why it works</h3>
						<ul className='list-unstyled mb-0'>
							<li className='mb-2 d-flex align-items-start'>
								<span className='me-2'>✅</span>
								<span>
									<strong>Active Recall:</strong> Testing yourself strengthens
									memory far more than re-reading notes.
								</span>
							</li>
							<li className='mb-2 d-flex align-items-start'>
								<span className='me-2'>✅</span>
								<span>
									<strong>Instant Feedback:</strong> Know what you know (and
									what you don&apos;t) immediately.
								</span>
							</li>
							<li className='d-flex align-items-start'>
								<span className='me-2'>✅</span>
								<span>
									<strong>Customized Learning:</strong> Generate questions on
									exactly what you need to study.
								</span>
							</li>
						</ul>
					</div>
				</div>
			</section>

			{/* How it Works Section */}
			<section className='mb-5'>
				<h2 className='text-center h2 fw-bold mb-5'>How it Works</h2>
				<div className='row g-4 text-center'>
					<div className='col-md-4'>
						<div className='h-100 p-4 border rounded-4 shadow-sm'>
							<div className='display-1 mb-3'>🎯</div>
							<h3 className='h4 fw-bold'>1. Choose a Topic</h3>
							<p className='text-muted'>
								Enter any subject, book chapter, or concept you want to master.
							</p>
						</div>
					</div>
					<div className='col-md-4'>
						<div className='h-100 p-4 border rounded-4 shadow-sm'>
							<div className='display-1 mb-3'>✨</div>
							<h3 className='h4 fw-bold'>2. Generate Quiz</h3>
							<p className='text-muted'>
								Our AI creates a unique set of multiple-choice questions just
								for you.
							</p>
						</div>
					</div>
					<div className='col-md-4'>
						<div className='h-100 p-4 border rounded-4 shadow-sm'>
							<div className='display-1 mb-3'>🚀</div>
							<h3 className='h4 fw-bold'>3. Practice & Review</h3>
							<p className='text-muted'>
								Take the test, review explanations, and track your improvement
								over time.
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* Call to Action */}
			<section className='text-center py-5 bg-light rounded-4'>
				<h2 className='h3 fw-bold mb-3'>Ready to start learning?</h2>
				<p className='mb-4 text-muted'>
					Create your first quiz in seconds. No sign-up required.
				</p>
				<Link href='/' className='btn btn-primary btn-lg px-5 rounded-pill'>
					Generate a Test
				</Link>
			</section>
		</main>
	);
}
