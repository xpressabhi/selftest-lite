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
		<div className='container py-3 d-flex flex-column align-items-center justify-content-center'>
			<h1 className='text-center mb-4 display-5 display-md-4 text-dark'>
				Create Your Personalized Quiz
			</h1>

			<form
				onSubmit={handleSubmit}
				className='w-100 card border-0'
				style={{ maxWidth: '720px' }}
			>
				<div className='form-group mb-3'>
					<textarea
						id='topic'
						className='form-control mb-3'
						rows='4'
						value={topic}
						onChange={(e) => setTopic(e.target.value)}
						placeholder='What do you want to test yourself on today? (e.g., "Spanish travel phrases", "Marvel movie trivia", or "System Design basics")'
						autoFocus
					/>
				</div>

				<div className='d-flex flex-column flex-sm-row justify-content-between align-items-center gap-2 mb-4'>
					<div className='d-flex gap-2 align-items-center order-1 order-sm-0'>
						<button
							type='button'
							onClick={() => setShowAdvanced(!showAdvanced)}
							className='btn btn-outline-secondary btn-sm'
							style={{
								width: 'auto',
								whiteSpace: 'nowrap',
							}}
						>
							{showAdvanced
								? 'Hide advanced settings'
								: 'Show advanced settings'}
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
						className='btn btn-primary'
						disabled={loading || !topic.trim()}
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
					<div className='advanced-options bg-light p-3 rounded shadow-sm mb-4'>
						<div className='row g-3'>
							<div className='col-12'>
								<div className='d-flex flex-column flex-sm-row gap-2'>
									<div className='flex-grow-1'>
										<label className='form-label small text-muted'>
											Question Format
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
											How many questions?
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
											Select Difficulty
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
									<span>Pick a Category (optional)</span>
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
											Reset
										</button>
									)}
								</label>
								<div className='categories-grid row row-cols-2 row-cols-sm-3 row-cols-md-4 g-3'>
									{Object.keys(topicCategories).map((category) => (
										<div className='col' key={category}>
											<button
												type='button'
												className={`btn btn-sm w-100 text-truncate ${
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
											<span>Suggested {selectedCategory} Topics</span>
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

			<p className='text-center text-muted mt-4 small'>
				💡 Tip: Be as specific as possible. Try “Advanced React Hooks” for depth
				or “World History” for breadth. <br />
				💡 सुझाव: और अधिक स्पष्ट लिखें। जैसे “Advanced React Hooks” गहराई के लिए
				या “World History” व्यापकता के लिए। <br />✨ Add “Hindi medium” in your
				topic to generate quizzes in Hindi.
			</p>
		</div>
	);
};

export default GenerateTestForm;
