// src/app/components/GenerateTestForm.js

'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import { FaPencilAlt, FaSpinner } from 'react-icons/fa';

/**
 * Renders a form for generating a new test.
 * Allows users to input a topic and submit to generate a test.
 */
const GenerateTestForm = () => {
	const [topic, setTopic] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const router = useRouter();
	// Reference to the submit button
	const submitButtonRef = useRef(null);

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
			// Get previous tests from history
			const testHistory = JSON.parse(
				localStorage.getItem(STORAGE_KEYS.TEST_HISTORY) || '[]',
			);

			const response = await fetch('/api/generate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					topic,
					previousTests: testHistory,
				}),
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
		<div className='container d-flex flex-column align-items-center justify-content-center text-dark'>
			<h1 className='display-4 fw-bold text-center mb-3'>Generate a Test</h1>
			<p className='lead text-center mb-4'>
				Describe the test you want to generate.
			</p>
			<p className='text-center text-muted mb-5'>
				💡 Tip: Think outside the box — it works for history, coding, science,
				hobbies, or even fun trivia!
			</p>

			<form
				onSubmit={handleSubmit}
				className='w-100'
				style={{ maxWidth: '800px' }}
			>
				<div className='form-group mb-3'>
					<label
						htmlFor='topic'
						className='form-label d-flex align-items-center gap-2'
					>
						<FaPencilAlt /> Topic Description
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
					className='btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2'
					disabled={loading}
				>
					{loading ? (
						<>
							<FaSpinner className='spinner' /> Generating...
						</>
					) : (
						'Generate Test'
					)}
				</button>
			</form>
		</div>
	);
};

export default GenerateTestForm;
