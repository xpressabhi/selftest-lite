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
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [testType, setTestType] = useState('multiple-choice');
	const [numQuestions, setNumQuestions] = useState(10);
	const [selectedTopics, setSelectedTopics] = useState([]);
	const [difficulty, setDifficulty] = useState('intermediate');
	const router = useRouter();
	// Reference to the submit button
	const submitButtonRef = useRef(null);

	const topicCategories = {
		'Programming & Tech': [
			'JavaScript',
			'Python',
			'Web Development',
			'Data Structures',
			'System Design',
		],
		'Academic': ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'History'],
		'Interview Prep': [
			'Behavioral Questions',
			'Problem Solving',
			'Leadership Skills',
			'System Design',
			'Coding Challenges',
		],
		'Professional Skills': [
			'Project Management',
			'Communication',
			'Team Leadership',
			'Agile Methodology',
			'Public Speaking',
		],
		'Fun & Trivia': [
			'Movies & TV Shows',
			'Video Games',
			'Sports',
			'Music',
			'Pop Culture',
		],
		'Hobbies & Lifestyle': [
			'Photography',
			'Cooking',
			'Fitness',
			'Gardening',
			'Travel',
		],
		'Language Learning': [
			'English',
			'Spanish',
			'Japanese',
			'German',
			'Mandarin',
		],
		'Creative Arts': [
			'Drawing',
			'Writing',
			'Music Theory',
			'Design',
			'Animation',
		],
	};

	const [selectedCategory, setSelectedCategory] = useState('');

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
					category: selectedCategory,
					selectedTopics,
					previousTests: testHistory,
					testType,
					numQuestions,
					difficulty,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();
				if (response.status === 429) {
					// Rate limit error
					const resetTime = new Date(errorData.resetTime);
					const minutes = Math.ceil((resetTime - new Date()) / 60000);
					setError(errorData.error || 'Rate limit exceeded');
					setLoading(false);
				} else {
					setError(
						errorData.error ||
							'An error occurred while generating the explanation.',
					);
				}
				return;
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
			<h1 className='display-4 fw-bold text-center mb-3'>
				Test your Knowledge
			</h1>

			<form
				onSubmit={handleSubmit}
				className='w-100'
				style={{ maxWidth: '800px' }}
			>
				<div className='form-group mb-3'>
					<textarea
						id='topic'
						className='form-control shadow-sm'
						rows='3'
						value={topic}
						onChange={(e) => setTopic(e.target.value)}
						placeholder='Describe what you want to learn about... (e.g., "Basic Spanish phrases for travel" or "Marvel movies trivia 2020-2023")'
						style={{
							border: '1px solid #e5e7eb',
							borderRadius: '0.5rem',
							padding: '1rem',
							fontSize: '1rem',
							resize: 'none',
						}}
					/>
				</div>

				<div className='d-flex flex-column flex-sm-row justify-content-between align-items-stretch align-items-sm-center gap-2 mb-3'>
					<div className='d-flex gap-2 align-items-center order-1 order-sm-0'>
						<button
							type='button'
							onClick={() => setShowAdvanced(!showAdvanced)}
							className='btn btn-outline-secondary btn-sm text-decoration-none'
							style={{
								fontSize: '0.9rem',
								width: 'auto',
								whiteSpace: 'nowrap',
							}}
						>
							{showAdvanced ? '− Less options' : '+ More options'}
						</button>

						{!showAdvanced && (
							<select
								className='form-select form-select-sm'
								value={numQuestions}
								onChange={(e) => setNumQuestions(Number(e.target.value))}
								style={{ width: 'auto', minWidth: '120px' }}
							>
								{[5, 10, 15, 20].map((num) => (
									<option key={num} value={num}>
										{num} questions
									</option>
								))}
							</select>
						)}
					</div>

					<button
						ref={submitButtonRef}
						type='submit'
						className='btn btn-primary w-100 w-sm-auto order-0 order-sm-1'
						disabled={loading}
					>
						{loading ? (
							<div className='d-flex align-items-center justify-content-center gap-2'>
								<FaSpinner className='spinner' />
								<span>Generating...</span>
							</div>
						) : (
							'Generate Quiz'
						)}
					</button>
				</div>

				{showAdvanced && (
					<div
						className='advanced-options p-3 mb-3 rounded shadow-sm'
						style={{ backgroundColor: '#f8f9fa' }}
					>
						<div className='row g-3'>
							<div className='col-12'>
								<div className='d-flex flex-column flex-sm-row gap-2'>
									<div className='flex-grow-1'>
										<label className='form-label small text-muted'>
											Test Type
										</label>
										<select
											className='form-select form-select-sm'
											value={testType}
											onChange={(e) => setTestType(e.target.value)}
										>
											<option value='multiple-choice'>Multiple Choice</option>
											<option value='true-false'>True/False</option>
											<option value='coding'>Coding Problems</option>
											<option value='mixed'>Mixed Format</option>
										</select>
									</div>
									<div className='flex-grow-1'>
										<label className='form-label small text-muted'>
											Number of Questions
										</label>
										<select
											className='form-select form-select-sm'
											value={numQuestions}
											onChange={(e) => setNumQuestions(Number(e.target.value))}
										>
											{[5, 10, 15, 20, 25, 30].map((num) => (
												<option key={num} value={num}>
													{num} questions
												</option>
											))}
										</select>
									</div>
									<div className='flex-grow-1'>
										<label className='form-label small text-muted'>
											Difficulty Level
										</label>
										<select
											className='form-select form-select-sm'
											value={difficulty}
											onChange={(e) => setDifficulty(e.target.value)}
										>
											<option value='beginner'>Beginner</option>
											<option value='intermediate'>Intermediate</option>
											<option value='advanced'>Advanced</option>
											<option value='expert'>Expert</option>
										</select>
									</div>
								</div>
							</div>

							<div className='col-12'>
								<label className='form-label small text-muted d-flex justify-content-between align-items-center mb-2'>
									<span>Select a Category</span>
									{selectedCategory && (
										<button
											type='button'
											className='btn btn-link btn-sm p-0 text-muted'
											style={{ fontSize: '0.8rem', textDecoration: 'none' }}
											onClick={() => {
												setSelectedCategory('');
												setSelectedTopics([]);
											}}
										>
											Clear Selection
										</button>
									)}
								</label>
								<div className='categories-grid row row-cols-2 row-cols-sm-3 row-cols-md-4 g-2'>
									{Object.keys(topicCategories).map((category) => (
										<div className='col' key={category}>
											<button
												type='button'
												className={`btn btn-sm w-100 ${
													selectedCategory === category
														? 'btn-primary'
														: 'btn-outline-secondary'
												}`}
												style={{
													whiteSpace: 'normal',
													height: '100%',
													minHeight: '44px',
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'center',
													textAlign: 'center',
													padding: '0.5rem',
												}}
												onClick={() =>
													setSelectedCategory(
														selectedCategory === category ? '' : category,
													)
												}
											>
												{category}
											</button>
										</div>
									))}
								</div>

								{selectedCategory && (
									<div className='selected-topics mt-3'>
										<label className='form-label small text-muted d-flex justify-content-between align-items-center'>
											<span>Popular {selectedCategory} Topics</span>
											<button
												type='button'
												className='btn btn-link btn-sm p-0 text-muted'
												style={{ fontSize: '0.8rem', textDecoration: 'none' }}
												onClick={() => {
													setSelectedCategory('');
													setSelectedTopics([]);
												}}
											>
												Change Category
											</button>
										</label>
										<div className='d-flex flex-wrap gap-2'>
											{topicCategories[selectedCategory]?.map((topic) => (
												<button
													key={topic}
													type='button'
													className={`btn btn-sm ${
														selectedTopics.includes(topic)
															? 'btn-primary'
															: 'btn-outline-secondary'
													}`}
													onClick={() => {
														setSelectedTopics((prev) =>
															prev.includes(topic)
																? prev.filter((t) => t !== topic)
																: [...prev, topic],
														);
													}}
												>
													{topic}
												</button>
											))}
										</div>
									</div>
								)}
							</div>
						</div>
					</div>
				)}

				{error && <div className='alert alert-danger'>{error}</div>}
			</form>

			<p className='text-center text-muted mt-4' style={{ fontSize: '0.9rem' }}>
				💡 Try specific topics like &ldquo;Advanced React Hooks&rdquo; or
				broader ones like &ldquo;World History&rdquo;
			</p>
		</div>
	);
};

export default GenerateTestForm;
