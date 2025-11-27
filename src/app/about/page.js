import React from 'react';
import Link from 'next/link';
import Icon from '../components/Icon';

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
				<div className='d-inline-flex align-items-center justify-content-center p-3 bg-primary-subtle text-primary rounded-circle mb-4'>
					<Icon name='sparkles' size={32} />
				</div>
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
					<p className='fs-5 text-secondary mb-4'>
						We believe learning should be active, not passive. Whether you&apos;re
						preparing for a high-stakes exam or mastering a new hobby,
						selftest.in gives you the tools to practice effectively using{' '}
						<strong>Active Recall</strong> and <strong>Spaced Repetition</strong>.
					</p>
					<div className='d-flex gap-3'>
						<div className='d-flex align-items-center text-primary'>
							<Icon name='checkCircle' className='me-2' />
							<span className='fw-medium'>Free for everyone</span>
						</div>
						<div className='d-flex align-items-center text-primary'>
							<Icon name='checkCircle' className='me-2' />
							<span className='fw-medium'>Privacy focused</span>
						</div>
					</div>
				</div>
				<div className='col-lg-6'>
					<div className='p-5 bg-light rounded-4 border position-relative overflow-hidden'>
						<div className='position-absolute top-0 end-0 p-3 opacity-10'>
							<Icon name='trophy' size={120} />
						</div>
						<h3 className='h4 fw-bold mb-4 position-relative'>Why it works</h3>
						<ul className='list-unstyled mb-0 position-relative'>
							<li className='mb-3 d-flex align-items-start'>
								<div className='mt-1 me-3 text-primary'>
									<Icon name='repeat1' size={20} />
								</div>
								<span>
									<strong>Active Recall:</strong> Testing yourself strengthens
									memory far more than re-reading notes.
								</span>
							</li>
							<li className='mb-3 d-flex align-items-start'>
								<div className='mt-1 me-3 text-primary'>
									<Icon name='checkCircle' size={20} />
								</div>
								<span>
									<strong>Instant Feedback:</strong> Know what you know (and
									what you don&apos;t) immediately.
								</span>
							</li>
							<li className='d-flex align-items-start'>
								<div className='mt-1 me-3 text-primary'>
									<Icon name='lightbulb' size={20} />
								</div>
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
						<div className='h-100 p-4 border rounded-4 shadow-sm bg-white position-relative overflow-hidden group-hover-effect'>
							<div className='mb-4 text-primary'>
								<Icon name='bookOpen' size={48} />
							</div>
							<h3 className='h4 fw-bold'>1. Choose a Topic</h3>
							<p className='text-muted'>
								Enter any subject, book chapter, or concept you want to master.
								The more specific, the better.
							</p>
						</div>
					</div>
					<div className='col-md-4'>
						<div className='h-100 p-4 border rounded-4 shadow-sm bg-white position-relative overflow-hidden'>
							<div className='mb-4 text-primary'>
								<Icon name='sparkles' size={48} />
							</div>
							<h3 className='h4 fw-bold'>2. Generate Quiz</h3>
							<p className='text-muted'>
								Our AI creates a unique set of multiple-choice questions just
								for you in seconds.
							</p>
						</div>
					</div>
					<div className='col-md-4'>
						<div className='h-100 p-4 border rounded-4 shadow-sm bg-white position-relative overflow-hidden'>
							<div className='mb-4 text-primary'>
								<Icon name='trophy' size={48} />
							</div>
							<h3 className='h4 fw-bold'>3. Practice & Review</h3>
							<p className='text-muted'>
								Take the test, review explanations, and track your improvement
								over time.
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* Values / Future Section */}
			<section className='mb-5 py-5 border-top border-bottom'>
				<div className='row align-items-center'>
					<div className='col-lg-5 mb-4 mb-lg-0'>
						<h2 className='h2 fw-bold mb-3'>Built for Learners</h2>
						<p className='text-muted'>
							We are constantly improving selftest.in to be the best study companion.
							Here is what we value:
						</p>
					</div>
					<div className='col-lg-7'>
						<div className='row g-4'>
							<div className='col-sm-6'>
								<h4 className='h6 fw-bold d-flex align-items-center mb-2'>
									<Icon name='lock' className='me-2 text-primary' size={18} />
									Privacy First
								</h4>
								<p className='small text-muted'>
									Your learning data belongs to you. We minimize data collection.
								</p>
							</div>
							<div className='col-sm-6'>
								<h4 className='h6 fw-bold d-flex align-items-center mb-2'>
									<Icon name='zap' className='me-2 text-primary' size={18} />
									Speed & Simplicity
								</h4>
								<p className='small text-muted'>
									No complex setups. Just type a topic and start learning.
								</p>
							</div>
						</div>
					</div>
				</div>
			</section>

			{/* Call to Action */}
			<section className='text-center py-5 bg-light rounded-4 position-relative overflow-hidden'>
				<div className='position-relative z-1'>
					<h2 className='h3 fw-bold mb-3'>Ready to start learning?</h2>
					<p className='mb-4 text-muted'>
						Create your first quiz in seconds. No sign-up required.
					</p>
					<Link href='/' className='btn btn-primary btn-lg px-5 rounded-pill shadow-sm'>
						Generate a Test
					</Link>
				</div>
			</section>
		</main>
	);
}
