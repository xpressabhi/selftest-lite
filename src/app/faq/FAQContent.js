'use client';

import Link from 'next/link';
import { useLanguage } from '../context/LanguageContext';

export default function FAQContent() {
	const { t } = useLanguage();

	return (
		<main className='container py-5'>
			<div className='row justify-content-center'>
				<div className='col-lg-8'>
					<div className='text-center mb-5'>
						<h1 className='display-4 fw-bold mb-3'>{t('faqHeroTitle')}</h1>
						<p className='lead text-muted'>{t('faqHeroBody')}</p>
					</div>

					<div className='accordion' id='faqAccordion'>
						<div className='mb-4'>
							<h2 className='h5 fw-bold text-primary mb-3 px-2'>
								{t('faqSectionGeneral')}
							</h2>

							<div className='card border-0 shadow-sm rounded-4 mb-3 overflow-hidden'>
								<div className='card-header bg-white border-0 p-0' id='headingOne'>
									<h3 className='mb-0'>
										<button
											className='btn btn-link w-100 text-start text-decoration-none text-dark p-4 fw-bold d-flex justify-content-between align-items-center'
											type='button'
											data-bs-toggle='collapse'
											data-bs-target='#collapseOne'
											aria-expanded='true'
											aria-controls='collapseOne'
										>
											{t('faqQWhatIs')}
											<span className='text-primary'>+</span>
										</button>
									</h3>
								</div>
								<div
									id='collapseOne'
									className='collapse show'
									aria-labelledby='headingOne'
									data-bs-parent='#faqAccordion'
								>
									<div className='card-body px-4 pb-4 pt-0 text-muted'>
										{t('faqAWhatIs1')}{' '}
										<strong>{t('faqAWhatIsHighlight')}</strong>
										{t('faqAWhatIs2')}
									</div>
								</div>
							</div>

							<div className='card border-0 shadow-sm rounded-4 mb-3 overflow-hidden'>
								<div className='card-header bg-white border-0 p-0' id='headingTwo'>
									<h3 className='mb-0'>
										<button
											className='btn btn-link w-100 text-start text-decoration-none text-dark p-4 fw-bold d-flex justify-content-between align-items-center'
											type='button'
											data-bs-toggle='collapse'
											data-bs-target='#collapseTwo'
											aria-expanded='false'
											aria-controls='collapseTwo'
										>
											{t('faqQIsFree')}
											<span className='text-primary'>+</span>
										</button>
									</h3>
								</div>
								<div
									id='collapseTwo'
									className='collapse'
									aria-labelledby='headingTwo'
									data-bs-parent='#faqAccordion'
								>
									<div className='card-body px-4 pb-4 pt-0 text-muted'>
										{t('faqAIsFree')}
									</div>
								</div>
							</div>
						</div>

						<div className='mb-4'>
							<h2 className='h5 fw-bold text-primary mb-3 px-2'>
								{t('faqSectionPrivacyData')}
							</h2>

							<div className='card border-0 shadow-sm rounded-4 mb-3 overflow-hidden'>
								<div className='card-header bg-white border-0 p-0' id='headingThree'>
									<h3 className='mb-0'>
										<button
											className='btn btn-link w-100 text-start text-decoration-none text-dark p-4 fw-bold d-flex justify-content-between align-items-center'
											type='button'
											data-bs-toggle='collapse'
											data-bs-target='#collapseThree'
											aria-expanded='false'
											aria-controls='collapseThree'
										>
											{t('faqQStoreData')}
											<span className='text-primary'>+</span>
										</button>
									</h3>
								</div>
								<div
									id='collapseThree'
									className='collapse'
									aria-labelledby='headingThree'
									data-bs-parent='#faqAccordion'
								>
									<div className='card-body px-4 pb-4 pt-0 text-muted'>
										{t('faqAStoreData')}
									</div>
								</div>
							</div>

							<div className='card border-0 shadow-sm rounded-4 mb-3 overflow-hidden'>
								<div className='card-header bg-white border-0 p-0' id='headingFour'>
									<h3 className='mb-0'>
										<button
											className='btn btn-link w-100 text-start text-decoration-none text-dark p-4 fw-bold d-flex justify-content-between align-items-center'
											type='button'
											data-bs-toggle='collapse'
											data-bs-target='#collapseFour'
											aria-expanded='false'
											aria-controls='collapseFour'
										>
											{t('faqQSaveQuizzes')}
											<span className='text-primary'>+</span>
										</button>
									</h3>
								</div>
								<div
									id='collapseFour'
									className='collapse'
									aria-labelledby='headingFour'
									data-bs-parent='#faqAccordion'
								>
									<div className='card-body px-4 pb-4 pt-0 text-muted'>
										{t('faqASaveQuizzes')}
									</div>
								</div>
							</div>
						</div>

						<div className='mb-4'>
							<h2 className='h5 fw-bold text-primary mb-3 px-2'>
								{t('faqSectionTechnical')}
							</h2>

							<div className='card border-0 shadow-sm rounded-4 mb-3 overflow-hidden'>
								<div className='card-header bg-white border-0 p-0' id='headingFive'>
									<h3 className='mb-0'>
										<button
											className='btn btn-link w-100 text-start text-decoration-none text-dark p-4 fw-bold d-flex justify-content-between align-items-center'
											type='button'
											data-bs-toggle='collapse'
											data-bs-target='#collapseFive'
											aria-expanded='false'
											aria-controls='collapseFive'
										>
											{t('faqQAiGeneration')}
											<span className='text-primary'>+</span>
										</button>
									</h3>
								</div>
								<div
									id='collapseFive'
									className='collapse'
									aria-labelledby='headingFive'
									data-bs-parent='#faqAccordion'
								>
									<div className='card-body px-4 pb-4 pt-0 text-muted'>
										{t('faqAAiGeneration')}
									</div>
								</div>
							</div>
						</div>
					</div>

					<div className='text-center mt-5'>
						<p className='text-muted'>
							{t('faqStillHaveQuestions')}{' '}
							<Link
								href='/contact'
								className='text-primary text-decoration-none fw-bold'
							>
								{t('faqContactUs')}
							</Link>
						</p>
					</div>
				</div>
			</div>
		</main>
	);
}
