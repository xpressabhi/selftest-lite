import React from 'react';
import Link from 'next/link';
import Icon from '../components/Icon';

export const metadata = {
	title: 'Blog — selftest.in',
	description:
		'Articles on learning techniques, test preparation, and how to use selftest.in effectively.',
};

const BLOG_POSTS = [
	{
		id: 1,
		slug: 'how-to-study-effectively',
		title: 'How to study effectively with Active Recall',
		excerpt:
			'Evidence-backed study techniques: active recall, spaced repetition, and how to use selftest.in to improve retention.',
		category: 'Study Tips',
		readTime: '5 min read',
		date: 'Nov 24, 2024',
	},
	{
		id: 2,
		slug: 'overcoming-exam-anxiety',
		title: 'Overcoming Exam Anxiety: A Practical Guide',
		excerpt:
			'Simple strategies to manage stress and perform your best when it matters most.',
		category: 'Wellness',
		readTime: '4 min read',
		date: 'Nov 20, 2024',
	},
	{
		id: 3,
		slug: 'spaced-repetition-explained',
		title: 'Spaced Repetition: The Secret to Long-Term Memory',
		excerpt:
			'Why cramming fails and how spacing out your review sessions can double your retention.',
		category: 'Science',
		readTime: '6 min read',
		date: 'Nov 15, 2024',
	},
	{
		id: 4,
		slug: 'best-prompts-for-learning',
		title: 'Best AI Prompts for Generating Study Quizzes',
		excerpt:
			'How to craft the perfect prompt to get the most relevant and challenging questions from selftest.in.',
		category: 'Guide',
		readTime: '3 min read',
		date: 'Nov 10, 2024',
	},
];

export default function BlogIndex() {
	return (
		<main className='container py-5'>
			<div className='text-center mb-5'>
				<h1 className='display-4 fw-bold mb-3'>Blog</h1>
				<p className='lead text-muted'>
					Tips, tricks, and techniques to help you learn smarter.
				</p>
			</div>

			<div className='row g-4 mb-5'>
				{BLOG_POSTS.map((post) => (
					<div key={post.id} className='col-md-6 col-lg-4'>
						<div className='card h-100 border-0 shadow-sm rounded-4 overflow-hidden group-hover-effect'>
							<div className='card-body p-4 d-flex flex-column'>
								<div className='d-flex justify-content-between align-items-center mb-3'>
									<span className='badge bg-primary-subtle text-primary rounded-pill px-3 py-2'>
										{post.category}
									</span>
									<span className='small text-muted'>{post.date}</span>
								</div>
								<h2 className='h4 fw-bold mb-3'>
									<Link
										href={`/blog/${post.slug}`}
										className='text-decoration-none text-dark stretched-link'
									>
										{post.title}
									</Link>
								</h2>
								<p className='card-text text-muted mb-4 flex-grow-1'>
									{post.excerpt}
								</p>
								<div className='d-flex align-items-center text-muted small mt-auto'>
									<Icon name='clock' size={16} className='me-2' />
									<span>{post.readTime}</span>
								</div>
							</div>
						</div>
					</div>
				))}
			</div>

			{/* Newsletter Section */}
			<div className='row justify-content-center'>
				<div className='col-lg-8'>
					<div className='card border-0 shadow-sm rounded-4 bg-primary text-white overflow-hidden position-relative'>
						<div className='card-body p-5 position-relative z-1 text-center'>
							<div className='d-inline-flex align-items-center justify-content-center p-3 bg-white bg-opacity-25 rounded-circle mb-4'>
								<Icon name='envelope' size={32} />
							</div>
							<h2 className='h3 fw-bold mb-3'>Subscribe to our newsletter</h2>
							<p className='mb-4 opacity-75 mx-auto' style={{ maxWidth: '500px' }}>
								Get the latest study tips and product updates delivered straight to your inbox.
								No spam, ever.
							</p>
							<form className='d-flex gap-2 justify-content-center mx-auto' style={{ maxWidth: '400px' }}>
								<input
									type='email'
									className='form-control rounded-pill border-0'
									placeholder='Enter your email'
									aria-label='Email address'
								/>
								<button className='btn btn-dark rounded-pill px-4 fw-bold' type='button'>
									Subscribe
								</button>
							</form>
						</div>

						{/* Decorative elements */}
						<div className='position-absolute top-0 start-0 translate-middle opacity-10' style={{ marginLeft: '20px', marginTop: '20px' }}>
							<Icon name='sparkles' size={150} />
						</div>
						<div className='position-absolute bottom-0 end-0 translate-middle-y opacity-10' style={{ marginRight: '-30px' }}>
							<Icon name='circle' size={100} />
						</div>
					</div>
				</div>
			</div>
		</main>
	);
}
