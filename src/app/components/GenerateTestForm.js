// src/app/components/GenerateTestForm.js

'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';

/**
 * Renders a form for generating a new test.
 * Allows users to input a topic and submit to generate a test.
 * Includes predefined prompts that users can select.
 */
const GenerateTestForm = () => {
	const [topic, setTopic] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const router = useRouter();
	// Reference to the submit button
	const submitButtonRef = useRef(null);

	// Predefined prompts that users can select
	const predefinedPrompts = [
		'JavaScript fundamentals: variables, functions, and objects',
		'Data structures and algorithms',
		'Mathematics: algebra, calculus, and statistics',
		'Biology: cell structure, genetics, and human anatomy',
		'World War II history',
		'Machine learning: supervised learning, neural networks, and data preprocessing',
		'English grammar, punctuation, and common writing mistakes',
	];

	/**
	 * Sets the selected prompt as the topic and scrolls to the submit button
	 * @param {string} prompt - The selected predefined prompt
	 */
	const handlePromptSelect = (prompt) => {
		setTopic(prompt);
		// Scroll the submit button into view with smooth behavior
		setTimeout(() => {
			if (submitButtonRef.current) {
				submitButtonRef.current.scrollIntoView({
					behavior: 'smooth',
					block: 'center',
				});
			}
		}, 100); // Small timeout to ensure state update completes
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		setLoading(true);
		setError(null);

		if (!topic) {
			setError('Please provide a description for the test.');
			setLoading(false);
			return;
		}

		try {
			const response = await fetch('/api/generate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ topic }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(
					errorData.error || 'An error occurred while generating the test.',
				);
			}

			const questionPaper = await response.json();
			localStorage.setItem(
				STORAGE_KEYS.UNSUBMITTED_TEST,
				JSON.stringify(questionPaper),
			);
			router.push('/test');
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className='container d-flex flex-column align-items-center justify-content-center bg-light text-dark'>
			<h1 className='display-4 mb-4'>Generate a Test</h1>
			<p className='lead mb-4'>
				Describe the test you want to generate or select a prompt below.
			</p>

			{/* Predefined prompts section */}
			<div className='mb-4 w-100 w-md-75'>
				<div className='d-flex flex-wrap gap-1'>
					{predefinedPrompts.map((prompt, index) => (
						<div
							key={index}
							className='card shadow border-0 shadow-sm prompt-card'
							style={{
								cursor: 'pointer',
								transition: 'all 0.2s ease',
								border:
									topic === prompt ? '2px solid #0d6efd' : '1px solid #dee2e6',
								backgroundColor: topic === prompt ? '#f0f7ff' : 'white',
							}}
							onClick={() => handlePromptSelect(prompt)}
							onMouseOver={(e) => {
								e.currentTarget.style.transform = 'translateY(-5px)';
								e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
							}}
							onMouseOut={(e) => {
								e.currentTarget.style.transform = 'translateY(0)';
								e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
							}}
						>
							<div className='card-body p-2 d-flex align-items-center justify-content-center'>
								<small>
									{prompt.length > 80
										? `${prompt.substring(0, 80)}...`
										: prompt}
								</small>
							</div>
						</div>
					))}
				</div>
			</div>

			<form onSubmit={handleSubmit} className='w-100 w-md-50'>
				<div className='form-group mb-3'>
					<label htmlFor='topic' className='form-label'>
						Test Description
					</label>
					<textarea
						id='topic'
						className='form-control'
						rows='5'
						value={topic}
						onChange={(e) => setTopic(e.target.value)}
						placeholder='e.g., Basics of React, including components, props, and state.'
					/>
				</div>
				{error && <div className='alert alert-danger'>{error}</div>}
				<button
					ref={submitButtonRef}
					type='submit'
					className='btn btn-primary w-100'
					disabled={loading}
				>
					{loading ? 'Generating...' : 'Generate Test'}
				</button>
			</form>
		</div>
	);
};

export default GenerateTestForm;
