// src/app/components/GenerateTestForm.js

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import useLocalStorage from '../hooks/useLocalStorage';
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
	InputGroup,
} from 'react-bootstrap';

/**
 * Renders a form for generating a new test.
 * Allows users to input a topic and submit to generate a test.
 * Also provides an option to directly navigate to an existing test by ID.
 */
const GenerateTestForm = () => {
	const [testHistory, _, updateHistory] = useLocalStorage(
		STORAGE_KEYS.TEST_HISTORY,
		[],
	);

	const [testId, setTestId] = useState('');
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
	const [elapsed, setElapsed] = useState(0);
	const timerRef = useRef(null);
	const [retryCount, setRetryCount] = useState(0);
	const MAX_RETRIES = 3;

	const [selectedCategory, setSelectedCategory] = useState('');

	/**
	 * Handles navigation to a test by ID
	 * @param {Event} e - Form submit event
	 */
	const handleTestIdSubmit = (e) => {
		e.preventDefault();
		if (testId && testId.trim()) {
			router.push(`/test?id=${testId.trim()}`);
		} else {
			setError('Please enter a valid test ID');
		}
	};

	/**
	 * Handles test generation submission with automatic retry logic
	 * @param {Event} e - Form submit event (optional during retries)
	 */
	const handleSubmit = async (e) => {
		// Only prevent default and reset retry count on initial submission
		if (e) {
			e.preventDefault();
			setRetryCount(0);
		}

		setLoading(true);
		setError(null);

		if (!topic) {
			setError('Please provide a description for the test.');
			setLoading(false);
			return;
		}

		try {
			// Get previous tests from history
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

			// Show retry attempt message if this is a retry
			if (retryCount > 0) {
				setError(`Retrying... (Attempt ${retryCount} of ${MAX_RETRIES})`);
			}

			const response = await fetch('/api/generate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					...requestParams,
					previousTests: testHistory.slice(0, 10),
				}),
			});

			if (!response.ok) {
				const errorData = await response.json();

				if (response.status === 429) {
					// Rate limit error - don't retry
					setError(errorData.error || 'Rate limit exceeded');
					setLoading(false);
					setRetryCount(0);
				} else {
					// Other API errors - attempt retry
					if (retryCount < MAX_RETRIES - 1) {
						// Increment retry count
						const nextRetryCount = retryCount + 1;
						setRetryCount(nextRetryCount);

						// Wait before retrying
						setTimeout(() => {
							handleSubmit(); // No event parameter for retries
						}, 1500);
					} else {
						// Max retries reached
						setError(
							'Failed to generate test after multiple attempts. Please try again later.',
						);
						setRetryCount(0);
						setLoading(false);
					}
				}
				return;
			}

			// Success! Process response
			const questionPaper = await response.json();
			questionPaper.requestParams = requestParams;
			updateHistory(questionPaper);

			// Reset retry count on success
			setRetryCount(0);
			setLoading(false);

			// Navigate to test page
			router.push('/test?id=' + questionPaper.id);
		} catch (err) {
			// Handle unexpected errors
			if (retryCount < MAX_RETRIES - 1) {
				// Increment retry count
				const nextRetryCount = retryCount + 1;
				setRetryCount(nextRetryCount);
				setError(
					`Error: ${err.message}. Retrying... (Attempt ${nextRetryCount} of ${MAX_RETRIES})`,
				);

				// Wait before retrying
				setTimeout(() => {
					handleSubmit(); // No event parameter for retries
				}, 1500);
			} else {
				// Max retries reached
				setError(
					`Failed after ${MAX_RETRIES} attempts: ${err.message}. Please try again later.`,
				);
				setRetryCount(0);
				setLoading(false);
			}
		} finally {
			// Only clear timer if we're done (success or max retries reached)
			if (retryCount === 0) {
				setStartTime(null);
			}
		}
	};

	useEffect(() => {
		// start or stop the elapsed timer whenever startTime changes
		if (startTime) {
			setElapsed(Date.now() - startTime);
			// clear any existing timer
			if (timerRef.current) clearInterval(timerRef.current);
			timerRef.current = setInterval(() => {
				setElapsed(Date.now() - startTime);
			}, 100);
			return () => {
				if (timerRef.current) {
					clearInterval(timerRef.current);
					timerRef.current = null;
				}
			};
		} else {
			// cleared
			setElapsed(0);
			if (timerRef.current) {
				clearInterval(timerRef.current);
				timerRef.current = null;
			}
		}
	}, [startTime]);

	return (
		<Container className='pb-3 d-flex flex-column align-items-center justify-content-center'>
			<h1 className='text-center mb-4 display-5 display-md-4 text-dark'>
				Create Personalized Quiz (अपना क्विज़ बनाएं)
			</h1>

			<Card className='w-100 border-0' style={{ maxWidth: '720px' }}>
				<Card.Body>
					{/* Test ID Input Form */}
					<Form onSubmit={handleTestIdSubmit} className='mb-4'>
						<Form.Group>
							<InputGroup>
								<Form.Control
									type='text'
									placeholder='Test ID (टेस्ट आईडी डालें)'
									value={testId}
									onChange={(e) => setTestId(e.target.value)}
								/>
								<Button variant='outline-primary' type='submit'>
									Go to Test
								</Button>
							</InputGroup>
							<Form.Text
								className='text-muted small d-block mt-1'
								style={{ fontSize: '0.8rem' }}
							>
								Have a Test ID? Enter here (अगर आपके पास टेस्ट आईडी है तो यहाँ
								डालें)
							</Form.Text>
						</Form.Group>
					</Form>

					<hr className='my-4' />

					<Form onSubmit={handleSubmit}>
						<Form.Group className='mb-3'>
							<Form.Control
								as='textarea'
								id='topic'
								rows={4}
								value={topic}
								onChange={(e) => setTopic(e.target.value)}
								placeholder='What do you want to test yourself on today? (आज आप किस टॉपिक पर टेस्ट देना चाहते हैं? जैसे "हिंदी व्याकरण", "भारत का इतिहास", या "गणित के सवाल")'
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
										? 'Hide advanced settings (कम विकल्प दिखाएं)'
										: 'Show advanced settings (अधिक विकल्प दिखाएं)'}
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
									{!loading && <Icon name='sparkles' />}
									{loading ? (
										<div className='d-flex align-items-center justify-content-center gap-2'>
											<Spinner as='span' animation='border' size='sm' />
											<span>
												Generating... (बनाया जा रहा है...){' '}
												<span style={{ width: '24px' }}>
													{Math.max(0, (elapsed / 1000).toFixed(1))}s
												</span>
											</span>
										</div>
									) : (
										'Generate Quiz (क्विज़ बनाएं)'
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
													Question Format (प्रश्न का प्रकार)
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
													How many questions? (कितने प्रश्न चाहिए?)
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
													Select Difficulty (कठिनाई स्तर चुनें)
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
													Select Language (भाषा चुनें)
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
											<span>Pick a Category (श्रेणी चुनें - वैकल्पिक)</span>
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
													<span>
														Suggested {selectedCategory} Topics (सुझाए गए टॉपिक)
													</span>
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

			<Card className='mt-4 shadow-sm border-0 bg-light'>
				<Card.Body className='text-center p-3'>
					<div className='d-flex flex-column align-items-center'>
						<Icon name='lightbulb' className='mb-2 text-warning' />
						<h6 className='fw-bold mb-3'>💡 सलाह (Tip)</h6>
						<p className='text-muted mb-2'>
							जब आप टेस्ट का टॉपिक लिखें तो साफ-साफ लिखें कि आप किस चीज़ पर
							क्विज़ बनाना चाहते हैं।
						</p>
						<ul className='list-unstyled text-muted small mb-2'>
							<li>👉 भारत का स्वतंत्रता संग्राम</li>
							<li>👉 गणित के सूत्र (Formulas)</li>
							<li>👉 कंप्यूटर के बेसिक सवाल</li>
						</ul>
						<p className='fw-semibold text-secondary mb-0'>
							जितना साफ़ टॉपिक बताएँगे, उतना सही और आसान क्विज़ बनेगा।
						</p>
					</div>
				</Card.Body>
			</Card>
		</Container>
	);
};

export default GenerateTestForm;
