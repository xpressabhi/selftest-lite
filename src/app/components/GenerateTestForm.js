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
		<div className='container d-flex flex-column align-items-center justify-content-center bg-light text-dark'>
			<h1 className='display-4 mb-4'>Generate a Test</h1>
			<p className='lead mb-4'>
				Describe the test you want to generate or select a prompt below.
			</p>

			{/* User prompts and Predefined prompts section */}
			<div className='mb-4 w-100 w-md-75'>
				<div className='d-flex flex-wrap gap-1'>
					{/* User prompts first */}
					{userPrompts.map((prompt, index) => (
						<div
							key={`user-${index}`}
							className='card shadow border-0 shadow-sm prompt-card position-relative'
							style={{
								cursor: 'pointer',
								transition: 'all 0.2s ease',
								border:
									topic === prompt ? '2px solid #0d6efd' : '1px solid #dee2e6',
								backgroundColor: topic === prompt ? '#f0f7ff' : '#fff5e6', // Slightly different background for user prompts
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
							<button
								className='position-absolute top-0 end-0 btn btn-sm btn-danger rounded-circle d-flex align-items-center justify-content-center'
								style={{
									width: '12px',
									height: '12px',
									padding: '0',
									margin: '2px',
									fontSize: '8px',
									transform: 'translate(50%, -50%)',
								}}
								title='Delete prompt'
								onClick={(e) => {
									e.stopPropagation(); // Prevent prompt selection when deleting
									const updatedPrompts = userPrompts.filter(
										(_, i) => i !== index,
									);
									setUserPrompts(updatedPrompts);
									localStorage.setItem(
										STORAGE_KEYS.USER_PROMPTS,
										JSON.stringify(updatedPrompts),
									);
								}}
							>
								<FaTimes size={12} />
							</button>
						</div>
					))}

					{/* Then predefined prompts, only if space remains in 5 total */}
					{userPrompts.length < 5 &&
						predefinedPrompts
							.slice(0, 5 - userPrompts.length)
							.map((prompt, index) => (
								<div
									key={index}
									className='card shadow border-0 shadow-sm prompt-card'
									style={{
										cursor: 'pointer',
										transition: 'all 0.2s ease',
										border:
											topic === prompt.text
												? '2px solid #0d6efd'
												: '1px solid #dee2e6',
										backgroundColor:
											topic === prompt.text ? '#f0f7ff' : 'white',
									}}
									onClick={() => handlePromptSelect(prompt.text)}
									onMouseOver={(e) => {
										e.currentTarget.style.transform = 'translateY(-5px)';
										e.currentTarget.style.boxShadow =
											'0 4px 8px rgba(0,0,0,0.1)';
									}}
									onMouseOut={(e) => {
										e.currentTarget.style.transform = 'translateY(0)';
										e.currentTarget.style.boxShadow =
											'0 1px 3px rgba(0,0,0,0.1)';
									}}
								>
									<div className='card-body p-2 d-flex align-items-center gap-2'>
										{prompt.icon}
										<small>
											{prompt.text.length > 80
												? `${prompt.text.substring(0, 80)}...`
												: prompt.text}
										</small>
									</div>
								</div>
							))}
				</div>
			</div>

			<form onSubmit={handleSubmit} className='w-100 w-md-50'>
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
