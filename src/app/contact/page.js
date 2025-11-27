'use client';

import React, { useState } from 'react';
import Icon from '../components/Icon';

export default function ContactPage() {
	const [formState, setFormState] = useState({
		name: '',
		email: '',
		message: '',
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitted, setSubmitted] = useState(false);

	const handleSubmit = async (e) => {
		e.preventDefault();
		setIsSubmitting(true);
		// Simulate API call
		await new Promise((resolve) => setTimeout(resolve, 1500));
		setIsSubmitting(false);
		setSubmitted(true);
		setFormState({ name: '', email: '', message: '' });
	};

	const handleChange = (e) => {
		setFormState({
			...formState,
			[e.target.name]: e.target.value,
		});
	};

	return (
		<main className='container py-5'>
			<div className='row justify-content-center'>
				<div className='col-lg-10'>
					<div className='text-center mb-5'>
						<h1 className='display-4 fw-bold mb-3'>Get in Touch</h1>
						<p className='lead text-muted'>
							Have questions, feedback, or just want to say hello? We&apos;d love to hear from you.
						</p>
					</div>

					<div className='row g-4'>
						{/* Contact Info */}
						<div className='col-lg-5'>
							<div className='card border-0 shadow-sm rounded-4 h-100 bg-primary text-white overflow-hidden position-relative'>
								<div className='card-body p-5 position-relative z-1'>
									<h2 className='h3 fw-bold mb-4'>Contact Information</h2>
									<p className='mb-5 opacity-75'>
										Fill out the form or reach out to us directly. We try to respond within 24 hours.
									</p>

									<div className='d-flex align-items-center mb-4'>
										<div className='bg-white bg-opacity-25 p-2 rounded-circle me-3'>
											<Icon name='envelope' size={20} />
										</div>
										<span>hello@selftest.in</span>
									</div>

									<div className='d-flex align-items-center mb-5'>
										<div className='bg-white bg-opacity-25 p-2 rounded-circle me-3'>
											<Icon name='share' size={20} />
										</div>
										<span>@selftest_in</span>
									</div>

									<div className='mt-auto'>
										<h3 className='h5 fw-bold mb-3'>Connect with the Creator</h3>
										<div className='d-flex align-items-center bg-white bg-opacity-10 p-3 rounded-3'>
											<div
												className='bg-white text-primary rounded-circle d-flex align-items-center justify-content-center me-3 fw-bold'
												style={{ width: '40px', height: '40px' }}
											>
												AM
											</div>
											<div>
												<div className='fw-bold'>Abhishek Maurya</div>
												<div className='small opacity-75'>Creator</div>
											</div>
											<a
												href='https://www.linkedin.com/in/akm85/'
												target='_blank'
												rel='noopener noreferrer'
												className='btn btn-sm btn-light ms-auto rounded-pill px-3 text-primary fw-bold'
											>
												Connect
											</a>
										</div>
									</div>
								</div>

								{/* Decorative circles */}
								<div className='position-absolute bottom-0 end-0 translate-middle-y opacity-10' style={{ marginRight: '-50px', marginBottom: '-50px' }}>
									<Icon name='circle' size={200} />
								</div>
							</div>
						</div>

						{/* Contact Form */}
						<div className='col-lg-7'>
							<div className='card border-0 shadow-sm rounded-4 h-100'>
								<div className='card-body p-5'>
									{submitted ? (
										<div className='text-center py-5'>
											<div className='mb-4 text-success'>
												<Icon name='checkCircle' size={64} />
											</div>
											<h3 className='h3 fw-bold mb-3'>Message Sent!</h3>
											<p className='text-muted mb-4'>
												Thanks for reaching out. We&apos;ll get back to you shortly.
											</p>
											<button
												onClick={() => setSubmitted(false)}
												className='btn btn-outline-primary rounded-pill px-4'
											>
												Send another message
											</button>
										</div>
									) : (
										<form onSubmit={handleSubmit}>
											<div className='mb-4'>
												<label htmlFor='name' className='form-label fw-bold small text-uppercase text-muted'>
													Your Name
												</label>
												<input
													type='text'
													className='form-control form-control-lg bg-light border-0'
													id='name'
													name='name'
													placeholder='John Doe'
													value={formState.name}
													onChange={handleChange}
													required
												/>
											</div>
											<div className='mb-4'>
												<label htmlFor='email' className='form-label fw-bold small text-uppercase text-muted'>
													Email Address
												</label>
												<input
													type='email'
													className='form-control form-control-lg bg-light border-0'
													id='email'
													name='email'
													placeholder='john@example.com'
													value={formState.email}
													onChange={handleChange}
													required
												/>
											</div>
											<div className='mb-4'>
												<label htmlFor='message' className='form-label fw-bold small text-uppercase text-muted'>
													Message
												</label>
												<textarea
													className='form-control form-control-lg bg-light border-0'
													id='message'
													name='message'
													rows='4'
													placeholder='How can we help you?'
													value={formState.message}
													onChange={handleChange}
													required
												></textarea>
											</div>
											<div className='d-grid'>
												<button
													type='submit'
													className='btn btn-primary btn-lg rounded-pill'
													disabled={isSubmitting}
												>
													{isSubmitting ? (
														<span className='d-flex align-items-center justify-content-center'>
															<span className='spinner-border spinner-border-sm me-2' role='status' aria-hidden='true'></span>
															Sending...
														</span>
													) : (
														'Send Message'
													)}
												</button>
											</div>
										</form>
									)}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</main>
	);
}
