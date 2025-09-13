// src/app/components/GenerateTestForm.js

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS, TOPIC_CATEGORIES } from '../constants';
import Icon from './Icon';
import {
	Container,
	Form,
	Button,
	Alert,
	Card,
	Row,
	Col,
	Spinner,
} from 'react-bootstrap';

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
	const [language, setLanguage] = useState('english');
	const router = useRouter();
	const [startTime, setStartTime] = useState(null);
	// Reference to the submit button

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
			setStartTime(Date.now());

			const requestParams = {
				topic,
				category: selectedCategory,
				selectedTopics,
				testType,
				numQuestions,
				difficulty,
				language,
			};

			const response = await fetch('/api/generate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ ...requestParams, previousTests: testHistory }),
			});
			setStartTime(null);

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
			questionPaper.requestParams = requestParams;

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
		<Container className='py-3 d-flex flex-column align-items-center justify-content-center'>
			<h1 className='text-center mb-4 display-5 display-md-4 text-dark'>
				Create Personalized Quiz
			</h1>

			<Card className='w-100 border-0' style={{ maxWidth: '720px' }}>
				<Card.Body>
					<Form onSubmit={handleSubmit}>
						<Form.Group className='mb-3'>
							<Form.Control
								as='textarea'
								id='topic'
								rows={4}
								value={topic}
								onChange={(e) => setTopic(e.target.value)}
								placeholder='What do you want to test yourself on today? (e.g., "Spanish travel phrases", "Marvel movie trivia", or "System Design basics")'
							/>
						</Form.Group>
						{error && <Alert variant='danger'>{error}</Alert>}

						<div className='d-flex flex-column flex-sm-row justify-content-between align-items-center gap-2 mb-4'>
							<div className='d-flex flex-wrap gap-2 align-items-center order-1 order-sm-0'>
								<Button
									variant='outline-secondary'
									size='sm'
									onClick={() => setShowAdvanced(!showAdvanced)}
									style={{
										width: 'auto',
										whiteSpace: 'nowrap',
									}}
								>
									{showAdvanced
										? 'Hide advanced settings'
										: 'Show advanced settings'}
								</Button>

								{!showAdvanced && (
									<>
										<Form.Select
											size='sm'
											value={numQuestions}
											onChange={(e) => setNumQuestions(Number(e.target.value))}
											style={{ width: 'auto', minWidth: '120px' }}
										>
											{[5, 10, 15, 20].map((num) => (
												<option key={num} value={num}>
													{num} questions
												</option>
											))}
										</Form.Select>
										<Form.Select
											size='sm'
											value={difficulty}
											onChange={(e) => setDifficulty(e.target.value)}
											style={{ width: 'auto', minWidth: '120px' }}
										>
											<option value='beginner'>Beginner</option>
											<option value='intermediate'>Intermediate</option>
											<option value='advanced'>Advanced</option>
											<option value='expert'>Expert</option>
										</Form.Select>
										<Form.Select
											size='sm'
											value={language}
											onChange={(e) => setLanguage(e.target.value)}
											style={{ width: 'auto', minWidth: '120px' }}
										>
											<option value='english'>English</option>
											<option value='hindi'>Hindi</option>
											<option value='spanish'>Spanish</option>
										</Form.Select>
									</>
								)}
							</div>

							<Button
								variant='primary'
								type='submit'
								disabled={loading || !topic.trim()}
							>
								<div className='d-flex align-items-center gap-1'>
									<Icon name='sparkles' />{' '}
									{loading ? (
										<div className='d-flex align-items-center justify-content-center gap-2'>
											<Spinner as='span' animation='border' size='sm' />
											<span>Generating...</span>
										</div>
									) : (
										'Generate Quiz'
									)}
								</div>
							</Button>
						</div>

						{showAdvanced && (
							<div className='advanced-options bg-light p-3 rounded shadow-sm mb-4'>
								<Row className='g-3'>
									<Col xs={12}>
										<div className='d-flex flex-column flex-sm-row gap-2'>
											<div className='flex-grow-1'>
												<Form.Label className='small text-muted'>
													Question Format
												</Form.Label>
												<Form.Select
													size='sm'
													value={testType}
													onChange={(e) => setTestType(e.target.value)}
												>
													<option value='multiple-choice'>
														Multiple Choice
													</option>
													<option value='true-false'>True/False</option>
													<option value='coding'>Coding Problems</option>
													<option value='mixed'>Mixed Format</option>
												</Form.Select>
											</div>
											<div className='flex-grow-1'>
												<Form.Label className='small text-muted'>
													How many questions?
												</Form.Label>
												<Form.Select
													size='sm'
													value={numQuestions}
													onChange={(e) =>
														setNumQuestions(Number(e.target.value))
													}
												>
													{[5, 10, 15, 20, 25, 30].map((num) => (
														<option key={num} value={num}>
															{num} questions
														</option>
													))}
												</Form.Select>
											</div>
											<div className='flex-grow-1'>
												<Form.Label className='small text-muted'>
													Select Difficulty
												</Form.Label>
												<Form.Select
													size='sm'
													value={difficulty}
													onChange={(e) => setDifficulty(e.target.value)}
												>
													<option value='beginner'>Beginner</option>
													<option value='intermediate'>Intermediate</option>
													<option value='advanced'>Advanced</option>
													<option value='expert'>Expert</option>
												</Form.Select>
											</div>
											<div className='flex-grow-1'>
												<Form.Label className='small text-muted'>
													Select Language
												</Form.Label>
												<Form.Select
													size='sm'
													value={language}
													onChange={(e) => setLanguage(e.target.value)}
												>
													<option value='english'>English</option>
													<option value='hindi'>Hindi</option>
													<option value='spanish'>Spanish</option>
												</Form.Select>
											</div>
										</div>
									</Col>

									<Col xs={12}>
										<Form.Label className='small text-muted d-flex justify-content-between align-items-center mb-2'>
											<span>Pick a Category (optional)</span>
											{selectedCategory && (
												<Button
													variant='link'
													size='sm'
													className='p-0 text-muted'
													style={{
														fontSize: '0.8rem',
														textDecoration: 'none',
													}}
													onClick={() => {
														setSelectedCategory('');
														setSelectedTopics([]);
													}}
												>
													Reset
												</Button>
											)}
										</Form.Label>
										<Row xs={2} sm={3} md={4} className='g-3'>
											{Object.keys(TOPIC_CATEGORIES).map((category) => (
												<Col key={category}>
													<Button
														variant={
															selectedCategory === category
																? 'primary'
																: 'outline-secondary'
														}
														size='sm'
														className='w-100 text-truncate'
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
													</Button>
												</Col>
											))}
										</Row>

										{selectedCategory && (
											<div className='selected-topics mt-3'>
												<Form.Label className='small text-muted d-flex justify-content-between align-items-center'>
													<span>Suggested {selectedCategory} Topics</span>
													<Button
														variant='link'
														size='sm'
														className='p-0 text-muted'
														style={{
															fontSize: '0.8rem',
															textDecoration: 'none',
														}}
														onClick={() => {
															setSelectedCategory('');
															setSelectedTopics([]);
														}}
													>
														Change Category
													</Button>
												</Form.Label>
												<div className='d-flex flex-wrap gap-2'>
													{TOPIC_CATEGORIES[selectedCategory]?.map((topic) => (
														<Button
															key={topic}
															variant={
																selectedTopics.includes(topic)
																	? 'primary'
																	: 'outline-secondary'
															}
															size='sm'
															onClick={() => {
																setSelectedTopics((prev) =>
																	prev.includes(topic)
																		? prev.filter((t) => t !== topic)
																		: [...prev, topic],
																);
															}}
														>
															{topic}
														</Button>
													))}
												</div>
											</div>
										)}
									</Col>
								</Row>
							</div>
						)}
					</Form>
				</Card.Body>
			</Card>

			<p className='text-center text-muted mt-4 small'>
				💡 Tip: Be as specific as possible. Try “Advanced React Hooks” for depth
				or “World History” for breadth.
			</p>
		</Container>
	);
};

export default GenerateTestForm;
