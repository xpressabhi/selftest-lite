import React from 'react';

export const metadata = {
	title: 'FAQ — selftest.in',
	description:
		'Frequently asked questions about selftest.in, quizzes, privacy, and features.',
};

export default function FAQPage() {
	return (
		<main className='container py-5'>
			<div className='row justify-content-center'>
				<div className='col-lg-8'>
					<div className='text-center mb-5'>
						<h1 className='display-4 fw-bold mb-3'>Frequently Asked Questions</h1>
						<p className='lead text-muted'>
							Everything you need to know about selftest.in
						</p>
					</div>

					<div className='accordion' id='faqAccordion'>
						{/* General Section */}
						<div className='mb-4'>
							<h2 className='h5 fw-bold text-primary mb-3 px-2'>General</h2>

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
											What is selftest.in?
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
										selftest.in is a lightweight, AI-powered quiz generator designed to help you learn faster.
										It creates multiple-choice tests on any topic you choose, allowing you to practice
										<strong>Active Recall</strong>—one of the most effective study techniques.
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
											Is it free to use?
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
										Yes! selftest.in is currently free to use. We may introduce premium features in the future
										for power users, but our core mission is to make learning accessible to everyone.
									</div>
								</div>
							</div>
						</div>

						{/* Privacy & Data Section */}
						<div className='mb-4'>
							<h2 className='h5 fw-bold text-primary mb-3 px-2'>Privacy & Data</h2>

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
											Do you store my personal data?
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
										No. We prioritize your privacy. Your test history and generated quizzes are stored locally
										in your browser&apos;s storage. We do not sell your personal data to third parties.
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
											Can I save my quizzes?
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
										Since data is stored locally, your quizzes are saved on your device.
										If you clear your browser cache, your history will be lost.
										We are working on an optional account feature to let you sync quizzes across devices.
									</div>
								</div>
							</div>
						</div>

						{/* Technical Section */}
						<div className='mb-4'>
							<h2 className='h5 fw-bold text-primary mb-3 px-2'>Technical</h2>

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
											How does the AI generation work?
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
										We use advanced Large Language Models (LLMs) to analyze your topic and generate
										relevant questions. Our system is prompted to create clear stems, plausible distractors,
										and helpful explanations to ensure a high-quality learning experience.
									</div>
								</div>
							</div>
						</div>

					</div>

					<div className='text-center mt-5'>
						<p className='text-muted'>
							Still have questions? <a href='/contact' className='text-primary text-decoration-none fw-bold'>Contact us</a>
						</p>
					</div>
				</div>
			</div>
		</main>
	);
}
