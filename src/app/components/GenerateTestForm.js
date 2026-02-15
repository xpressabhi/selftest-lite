// src/app/components/GenerateTestForm.js

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import useLocalStorage from '../hooks/useLocalStorage';
import useNetworkStatus from '../hooks/useNetworkStatus';
import { STORAGE_KEYS, TOPIC_CATEGORIES } from '../constants';
import Icon from './Icon';
import { useLanguage } from '../context/LanguageContext';
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
	Badge,
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
	const [language, setLanguage] = useState('hindi');
	const router = useRouter();
	const [startTime, setStartTime] = useState(null);
	const [elapsed, setElapsed] = useState(0);
	const timerRef = useRef(null);
	const [retryCount, setRetryCount] = useState(0);
	const MAX_RETRIES = 3;
	const { t, language: uiLanguage } = useLanguage();
	const { isSlowConnection, isOffline, shouldSaveData } = useNetworkStatus();
	const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	const [selectedCategory, setSelectedCategory] = useState('');

	// Auto-reduce questions on slow connection
	useEffect(() => {
		if (shouldSaveData && numQuestions > 5) {
			setNumQuestions(5);
		}
	}, [shouldSaveData]);

	// Sync test language with UI language
	useEffect(() => {
		setLanguage(uiLanguage);
	}, [uiLanguage]);

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
		if (e) {
			e.preventDefault();
		}

		setLoading(true);
		setError(null);
		setRetryCount(0);

		if (!topic.trim()) {
			setError('Please provide a description for the test.');
			setLoading(false);
			return;
		}

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

		try {
			for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
				if (attempt > 1) {
					setRetryCount(attempt - 1);
					setError(`Retrying... (Attempt ${attempt} of ${MAX_RETRIES})`);
				}

				try {
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
						const errorData = await response.json().catch(() => ({}));
						if (response.status === 429) {
							setError(errorData.error || 'Rate limit exceeded');
							return;
						}

						if (attempt === MAX_RETRIES) {
							setError(
								errorData.error ||
									'Failed to generate test after multiple attempts. Please try again later.',
							);
							return;
						}
					} else {
						const questionPaper = await response.json();
						questionPaper.requestParams = requestParams;
						updateHistory(questionPaper);
						setError(null);
						router.push('/test?id=' + questionPaper.id);
						return;
					}
				} catch (err) {
					if (attempt === MAX_RETRIES) {
						setError(
							`Failed after ${MAX_RETRIES} attempts: ${err.message}. Please try again later.`,
						);
						return;
					}
				}

				await wait(1500);
			}
		} finally {
			setLoading(false);
			setRetryCount(0);
			setStartTime(null);
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
			<div className='text-center mb-5'>
				<h1 className='display-4 fw-bold mb-2' style={{ letterSpacing: '-1px' }}>
					{t('createQuiz')}
				</h1>
				<p className='text-muted fs-5'>
					{t('createQuizSubtitle')}
				</p>
			</div>

			<Card className='w-100 border-0 glass-card mb-4' style={{ maxWidth: '720px' }}>
				<Card.Body className='p-4 p-md-5'>
					{/* Test ID Input Form */}
					<Form onSubmit={handleTestIdSubmit} className='mb-4'>
						<Form.Group>
							<InputGroup className='mb-1'>
								<Form.Control
									type='text'
									placeholder={t('enterTestId')}
									value={testId}
									onChange={(e) => setTestId(e.target.value)}
									className='glass-input border-end-0'
									style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
								/>
								<Button
									variant='outline-primary'
									type='submit'
									className='border-start-0 px-4'
									style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
								>
									{t('go')}
								</Button>
							</InputGroup>
							<Form.Text className='text-muted small'>
								{t('haveTestId')}
							</Form.Text>
						</Form.Group>
					</Form>

					<div className='d-flex align-items-center mb-4'>
						<hr className='flex-grow-1 opacity-25' />
						<span className='px-3 text-muted small text-uppercase fw-semibold'>{t('or')}</span>
						<hr className='flex-grow-1 opacity-25' />
					</div>

					<Form onSubmit={handleSubmit}>
						<Form.Group className='mb-4'>
							<Form.Label className='fw-medium'>{t('whatToLearn')}</Form.Label>
							<Form.Control
								as='textarea'
								id='topic'
								rows={4}
								value={topic}
								onChange={(e) => setTopic(e.target.value)}
								placeholder={t('placeholderTopic')}
								className='glass-input'
								style={{ resize: 'none' }}
							/>
						</Form.Group>
						{/* Error message */}
						{error && (
							<Alert variant='danger' className='border-0 shadow-sm'>
								{error}
							</Alert>
						)}

						{/* Network status warning */}
						{shouldSaveData && !isOffline && (
							<Alert variant='info' className='border-0 py-2 px-3 d-flex align-items-center gap-2 small'>
								<Icon name='signal' size={16} />
								<span>
									Slow connection detected. Reduced to {numQuestions} questions for faster loading.
								</span>
							</Alert>
						)}

						{isOffline && (
							<Alert variant='warning' className='border-0 py-2 px-3 d-flex align-items-center gap-2 small'>
								<Icon name='wifiOff' size={16} />
								<span>
									You're offline. You can still access previously generated quizzes from history.
								</span>
							</Alert>
						)}

						<div className='d-flex flex-column gap-3 mt-3'>
							<div className='d-flex flex-wrap justify-content-between align-items-center gap-2'>
								<Button
									variant='link'
									className='text-decoration-none p-0 text-muted d-flex align-items-center gap-2'
									onClick={() => setShowAdvanced(!showAdvanced)}
								>
									<Icon name={showAdvanced ? 'chevronUp' : 'chevronDown'} size={14} />
									{showAdvanced ? t('hideOptions') : t('moreOptions')}
								</Button>

								{!showAdvanced && (
									<div className='d-flex flex-wrap gap-2 w-100 w-sm-auto mt-2 mt-sm-0'>
										<Form.Select
											size='sm'
											value={numQuestions}
											onChange={(e) => setNumQuestions(Number(e.target.value))}
											className='glass-input flex-grow-1 flex-sm-grow-0'
											style={{ minWidth: '80px' }}
										>
											{[5, 10, 15, 20].map((num) => (
												<option key={num} value={num}>{num} Qs</option>
											))}
										</Form.Select>
										<Form.Select
											size='sm'
											value={difficulty}
											onChange={(e) => setDifficulty(e.target.value)}
											className='glass-input flex-grow-1 flex-sm-grow-0'
											style={{ textTransform: 'capitalize', minWidth: '110px' }}
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
											className='glass-input flex-grow-1 flex-sm-grow-0'
											style={{ minWidth: '90px' }}
										>
											<option value='english'>English</option>
											<option value='hindi'>Hindi</option>
										</Form.Select>
									</div>
								)}
							</div>

							{showAdvanced && (
								<div className='p-4 rounded-3 bg-light bg-opacity-50 border border-light mb-2 fade-slide fade-in'>
									<Row className='g-3'>
										<Col xs={12} sm={6}>
											<Form.Label className='small text-muted fw-semibold'>Format</Form.Label>
											<Form.Select
												size='sm'
												value={testType}
												onChange={(e) => setTestType(e.target.value)}
												className='glass-input'
											>
												<option value='multiple-choice'>Multiple Choice</option>
												<option value='true-false'>True/False</option>
												<option value='coding'>Coding Problems</option>
												<option value='mixed'>Mixed Format</option>
												<option value='speed-challenge'>⚡ Speed Challenge</option>
											</Form.Select>
										</Col>
										<Col xs={6} sm={3}>
											<Form.Label className='small text-muted fw-semibold'>Questions</Form.Label>
											<Form.Select
												size='sm'
												value={numQuestions}
												onChange={(e) => setNumQuestions(Number(e.target.value))}
												className='glass-input'
											>
												{[5, 10, 15, 20, 25, 30].map((num) => (
													<option key={num} value={num}>{num}</option>
												))}
											</Form.Select>
										</Col>
										<Col xs={6} sm={3}>
											<Form.Label className='small text-muted fw-semibold'>Difficulty</Form.Label>
											<Form.Select
												size='sm'
												value={difficulty}
												onChange={(e) => setDifficulty(e.target.value)}
												className='glass-input'
											>
												<option value='beginner'>Beginner</option>
												<option value='intermediate'>Intermediate</option>
												<option value='advanced'>Advanced</option>
												<option value='expert'>Expert</option>
											</Form.Select>
										</Col>
										<Col xs={12}>
											<Form.Label className='small text-muted fw-semibold'>Language</Form.Label>
											<Form.Select
												size='sm'
												value={language}
												onChange={(e) => setLanguage(e.target.value)}
												className='glass-input'
											>
												<option value='english'>English</option>
												<option value='hindi'>Hindi</option>
												<option value='spanish'>Spanish</option>
											</Form.Select>
										</Col>
									</Row>

									<hr className='my-3 opacity-25' />

									<Form.Label className='small text-muted fw-semibold d-flex justify-content-between'>
										<span>Category (Optional)</span>
										{selectedCategory && (
											<Button
												variant='link'
												size='sm'
												className='p-0 text-muted text-decoration-none'
												onClick={() => {
													setSelectedCategory('');
													setSelectedTopics([]);
												}}
											>
												Clear
											</Button>
										)}
									</Form.Label>
									<div className='d-flex flex-wrap gap-2 mb-3'>
										{Object.keys(TOPIC_CATEGORIES).map((category) => (
											<Button
												key={category}
												variant={selectedCategory === category ? 'primary' : 'outline-secondary'}
												size='sm'
												className={`rounded-pill px-3 ${selectedCategory !== category ? 'border-0 bg-white' : ''}`}
												onClick={() => setSelectedCategory(selectedCategory === category ? '' : category)}
											>
												{category}
											</Button>
										))}
									</div>

									{selectedCategory && (
										<div className='fade-slide fade-in'>
											<Form.Label className='small text-muted fw-semibold'>Suggested Topics</Form.Label>
											<div className='d-flex flex-wrap gap-2'>
												{TOPIC_CATEGORIES[selectedCategory]?.map((topic) => (
													<Button
														key={topic}
														variant={selectedTopics.includes(topic) ? 'primary' : 'light'}
														size='sm'
														className='rounded-pill'
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
								</div>
							)}

							<Button
								variant='primary'
								type='submit'
								disabled={loading || !topic.trim()}
								className='w-100 py-3 fw-semibold fs-5 mt-2'
							>
								<div className='d-flex align-items-center justify-content-center gap-2'>
									{!loading && <Icon name='sparkles' />}
									{loading ? (
										<>
											<Spinner as='span' animation='border' size='sm' />
											<span>
												{t('generating')}
												<span className='ms-2 opacity-75 fs-6'>
													{Math.max(0, (elapsed / 1000).toFixed(1))}s
												</span>
											</span>
										</>
									) : (
										t('generateQuiz')
									)}
								</div>
							</Button>
						</div>
					</Form>
				</Card.Body>
			</Card>

			<Card className='border-0 bg-transparent'>
				<Card.Body className='text-center p-3'>
					<div className='d-flex flex-column align-items-center opacity-75'>
						<div className='d-flex align-items-center gap-2 mb-2'>
							<Icon name='lightbulb' className='text-warning' />
							<span className='fw-semibold'>{t('proTip')}</span>
						</div>
						<p className='text-muted small mb-0' style={{ maxWidth: '400px' }}>
							{t('proTipContent')}
						</p>
					</div>
				</Card.Body>
			</Card>
		</Container>
	);
};

export default GenerateTestForm;
