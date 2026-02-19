'use client';

import Link from 'next/link';
import Icon from '../components/Icon';
import { useLanguage } from '../context/LanguageContext';

export default function BlogIndexContent() {
	const { t } = useLanguage();

	const blogPosts = [
		{
			id: 1,
			slug: 'how-to-study-effectively',
			title: t('blogPost1Title'),
			excerpt: t('blogPost1Excerpt'),
			category: t('blogPost1Category'),
			readTime: t('blogPost1ReadTime'),
			date: t('blogPost1Date'),
		},
		{
			id: 2,
			slug: 'overcoming-exam-anxiety',
			title: t('blogPost2Title'),
			excerpt: t('blogPost2Excerpt'),
			category: t('blogPost2Category'),
			readTime: t('blogPost2ReadTime'),
			date: t('blogPost2Date'),
		},
		{
			id: 3,
			slug: 'spaced-repetition-explained',
			title: t('blogPost3Title'),
			excerpt: t('blogPost3Excerpt'),
			category: t('blogPost3Category'),
			readTime: t('blogPost3ReadTime'),
			date: t('blogPost3Date'),
		},
		{
			id: 4,
			slug: 'best-prompts-for-learning',
			title: t('blogPost4Title'),
			excerpt: t('blogPost4Excerpt'),
			category: t('blogPost4Category'),
			readTime: t('blogPost4ReadTime'),
			date: t('blogPost4Date'),
		},
	];

	return (
		<main className='container py-5'>
			<div className='text-center mb-5'>
				<h1 className='display-4 fw-bold mb-3'>{t('blogHeroTitle')}</h1>
				<p className='lead text-muted'>{t('blogHeroBody')}</p>
			</div>

			<div className='row g-4 mb-5'>
				{blogPosts.map((post) => (
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

			<div className='row justify-content-center'>
				<div className='col-lg-8'>
					<div className='card border-0 shadow-sm rounded-4 bg-primary text-white overflow-hidden position-relative'>
						<div className='card-body p-5 position-relative z-1 text-center'>
							<div className='d-inline-flex align-items-center justify-content-center p-3 bg-white bg-opacity-25 rounded-circle mb-4'>
								<Icon name='envelope' size={32} />
							</div>
							<h2 className='h3 fw-bold mb-3'>{t('blogNewsletterTitle')}</h2>
							<p className='mb-4 opacity-75 mx-auto' style={{ maxWidth: '500px' }}>
								{t('blogNewsletterBody')}
							</p>
							<form className='d-flex gap-2 justify-content-center mx-auto' style={{ maxWidth: '400px' }}>
								<label htmlFor='newsletterEmail' className='visually-hidden'>
									{t('blogNewsletterEmailLabel')}
								</label>
								<input
									id='newsletterEmail'
									type='email'
									className='form-control rounded-pill border-0'
									placeholder={t('blogNewsletterPlaceholder')}
									aria-label={t('blogNewsletterEmailLabel')}
								/>
								<button className='btn btn-dark rounded-pill px-4 fw-bold' type='button'>
									{t('blogNewsletterButton')}
								</button>
							</form>
						</div>

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
