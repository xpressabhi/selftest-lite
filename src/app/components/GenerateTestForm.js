// src/app/components/GenerateTestForm.js

'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '../constants';
import {
	FaPencilAlt,
	FaSpinner,
	FaTimes,
	FaCode,
	FaCalculator,
	FaDna,
	FaHistory,
	FaLanguage,
} from 'react-icons/fa';

/**
 * Renders a form for generating a new test.
 * Allows users to input a topic and submit to generate a test.
 * Includes predefined prompts that users can select.
 */
const GenerateTestForm = () => {
	const [topic, setTopic] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const [userPrompts, setUserPrompts] = useState([]);
	const router = useRouter();
	// Reference to the submit button
	const submitButtonRef = useRef(null);

	// Load user prompts from localStorage on component mount
	useEffect(() => {
		const savedPrompts = localStorage.getItem(STORAGE_KEYS.USER_PROMPTS);
		if (savedPrompts) {
			setUserPrompts(JSON.parse(savedPrompts));
		}
	}, []);

	// Base predefined prompts with their icons
	const predefinedPrompts = [
		{
			text: 'JavaScript fundamentals: variables, functions, and objects',
			icon: <FaCode />,
		},
		{
			text: 'Mathematics: algebra, calculus, and statistics',
			icon: <FaCalculator />,
		},
		{
			text: 'Biology: cell structure, genetics, and human anatomy',
			icon: <FaDna />,
		},
		{ text: 'World War II history for UPSC exams', icon: <FaHistory /> },
		{
			text: 'English grammar, punctuation, and common writing mistakes',
			icon: <FaLanguage />,
		},
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

			// Save the topic to user prompts if it's not already there
			if (!predefinedPrompts.includes(topic)) {
				// Remove any existing duplicate of this topic
				const filteredPrompts = userPrompts.filter(
					(p) => p.trim().toLowerCase() !== topic.trim().toLowerCase(),
				);
				const updatedPrompts = [topic, ...filteredPrompts].slice(0, 5); // Keep only last 5 user prompts
				setUserPrompts(updatedPrompts);
				localStorage.setItem(
					STORAGE_KEYS.USER_PROMPTS,
					JSON.stringify(updatedPrompts),
				);
			}

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
				Describe the test you want to generate or select a prompt below.
			</p>
			<p className='text-center text-muted mb-5'>
				💡 Tip: Think outside the box — it works for history, coding, science,
				hobbies, or even fun trivia!
			</p>

			<div className='mb-5 w-100' style={{ maxWidth: '800px' }}>
				<div className='d-flex flex-wrap justify-content-center gap-2 mb-4 d-none'>
					{userPrompts.map((prompt, index) => (
						<div
							key={`user-${index}`}
							className={`prompt-card user-prompt ${
								topic === prompt ? 'selected' : ''
							}`}
							onClick={() => handlePromptSelect(prompt)}
						>
							<small>
								{prompt.length > 80 ? `${prompt.substring(0, 80)}...` : prompt}
							</small>
							<button
								className='delete-prompt-btn'
								title='Delete prompt'
								onClick={(e) => {
									e.stopPropagation();
									const updatedPrompts = userPrompts.filter(
										(_, i) => i !== index,
									);
									setUserPrompts(updatedPrompts);
									localStorage.setItem(
										STORAGE_KEYS.USER_PROMPTS,
										JSON.stringify(updatedPrompts),
									);
									if (topic === prompt) {
										setTopic('');
									}
								}}
							>
								<FaTimes />
							</button>
						</div>
					))}
				</div>

				<div className='d-flex flex-wrap justify-content-center gap-2 d-none'>
					{predefinedPrompts.map((prompt, index) => (
						<div
							key={`predefined-${index}`}
							className={`prompt-card ${
								topic === prompt.text ? 'selected' : ''
							}`}
							onClick={() => handlePromptSelect(prompt.text)}
						>
							{prompt.icon} <small>{prompt.text}</small>
						</div>
					))}
				</div>
			</div>

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
