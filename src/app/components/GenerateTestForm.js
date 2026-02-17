// src/app/components/GenerateTestForm.js

'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import useLocalStorage from '../hooks/useLocalStorage';
import useNetworkStatus from '../hooks/useNetworkStatus';
import { STORAGE_KEYS, TOPIC_CATEGORIES } from '../constants';
import { OBJECTIVE_ONLY_EXAMS, getIndianExamById } from '../data/indianExams';
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

const TEST_MODES = {
	FULL_EXAM: 'full-exam',
	QUIZ_PRACTICE: 'quiz-practice',
};

const ENTRY_PATHS = {
	EXISTING: 'existing',
	NEW: 'new',
};

const GenerateTestForm = () => {
	const [testHistory, __, updateHistory] = useLocalStorage(
		STORAGE_KEYS.TEST_HISTORY,
		[],
	);
	const [bookmarkedExamIds, setBookmarkedExamIds] = useLocalStorage(
		STORAGE_KEYS.BOOKMARKED_EXAMS,
		[],
	);
	const [bookmarkedQuizPresets, setBookmarkedQuizPresets] = useLocalStorage(
		STORAGE_KEYS.BOOKMARKED_QUIZ_PRESETS,
		[],
	);

	const [activeMode, setActiveMode] = useState('');
	const [entryPath, setEntryPath] = useState('');
	const [showBookmarkedExamsOnly, setShowBookmarkedExamsOnly] = useState(false);
	const [showExamBrowser, setShowExamBrowser] = useState(true);
	const [testId, setTestId] = useState('');
	const [topic, setTopic] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [testType, setTestType] = useState('multiple-choice');
	const [numQuestions, setNumQuestions] = useState(10);
	const [selectedTopics, setSelectedTopics] = useState([]);
	const [selectedExamId, setSelectedExamId] = useState('');
	const [selectedSyllabusFocus, setSelectedSyllabusFocus] = useState([]);
	const [difficulty, setDifficulty] = useState('intermediate');
	const [language, setLanguage] = useState('hindi');
	const [selectedCategory, setSelectedCategory] = useState('');
	const [startTime, setStartTime] = useState(null);
	const [elapsed, setElapsed] = useState(0);
	const [, setRetryCount] = useState(0);

	const router = useRouter();
	const timerRef = useRef(null);
	const MAX_RETRIES = 3;
	const { t, language: uiLanguage, toggleLanguage } = useLanguage();
	const { isOffline, shouldSaveData } = useNetworkStatus();
	const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	const objectiveExams = useMemo(() => OBJECTIVE_ONLY_EXAMS, []);
	const selectedExam = useMemo(
		() => getIndianExamById(selectedExamId),
		[selectedExamId],
	);
	const bookmarkedExams = useMemo(
		() => objectiveExams.filter((exam) => bookmarkedExamIds.includes(exam.id)),
		[bookmarkedExamIds, objectiveExams],
	);
	const visibleExams = useMemo(() => {
		if (!showBookmarkedExamsOnly) return objectiveExams;
		return bookmarkedExams;
	}, [showBookmarkedExamsOnly, objectiveExams, bookmarkedExams]);
	const hasNewTestInputContext =
		activeMode === TEST_MODES.FULL_EXAM
			? Boolean(selectedExamId)
			: topic.trim().length > 0 || selectedTopics.length > 0;
	const isExistingTestPath = entryPath === ENTRY_PATHS.EXISTING;
	const isNewTestPath = entryPath === ENTRY_PATHS.NEW;
	const currentModeLabel =
		activeMode === TEST_MODES.FULL_EXAM
			? 'Full Exam Paper'
			: activeMode === TEST_MODES.QUIZ_PRACTICE
				? 'Quiz Practice'
				: '';

	useEffect(() => {
		if (
			activeMode === TEST_MODES.QUIZ_PRACTICE &&
			shouldSaveData &&
			numQuestions > 5
		) {
			setNumQuestions(5);
		}
	}, [activeMode, numQuestions, shouldSaveData]);

	useEffect(() => {
		setLanguage(uiLanguage);
	}, [uiLanguage]);

	useEffect(() => {
		if (activeMode !== TEST_MODES.FULL_EXAM) return;
		if (!selectedExamId) {
			setSelectedSyllabusFocus([]);
			setShowExamBrowser(true);
			return;
		}

		const exam = getIndianExamById(selectedExamId);
		if (!exam) return;

		setSelectedSyllabusFocus(exam.syllabus);
		setTestType('multiple-choice');
		setDifficulty(exam.defaultDifficulty);
		setNumQuestions(exam.fullLengthQuestions);
		setShowAdvanced(false);
		setShowExamBrowser(false);
		setTopic((prevTopic) =>
			prevTopic.trim()
				? prevTopic
				: `${exam.name} full-length objective mock paper`,
		);
	}, [activeMode, selectedExamId]);

	useEffect(() => {
		if (startTime) {
			setElapsed(Date.now() - startTime);
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
		}

		setElapsed(0);
		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
	}, [startTime]);

	const getExamRequestParams = ({
		exam,
		syllabusFocus = [],
		customTopic = '',
	}) => {
		const effectiveSyllabus =
			syllabusFocus.length > 0 ? syllabusFocus : exam.syllabus;
		return {
			testMode: TEST_MODES.FULL_EXAM,
			topic:
				customTopic.trim() ||
				`${exam.name} full-length objective mock paper`,
			category: null,
			selectedTopics: effectiveSyllabus,
			examId: exam.id,
			examName: exam.name,
			examStream: exam.stream,
			syllabusFocus: effectiveSyllabus,
			testType: 'multiple-choice',
			numQuestions: exam.fullLengthQuestions,
			difficulty: exam.defaultDifficulty,
			language,
			objectiveOnly: true,
			durationMinutes: exam.durationMinutes,
		};
	};

	const runGeneration = async (requestParams) => {
		setLoading(true);
		setError(null);
		setRetryCount(0);
		setStartTime(Date.now());

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

	const handleModeSelect = (mode) => {
		setActiveMode(mode);
		setEntryPath('');
		setError(null);
		if (mode === TEST_MODES.QUIZ_PRACTICE) {
			setSelectedExamId('');
			setSelectedSyllabusFocus([]);
			setShowExamBrowser(false);
		}
		if (mode === TEST_MODES.FULL_EXAM) {
			setShowAdvanced(false);
			setSelectedCategory('');
			setSelectedTopics([]);
		}
	};

	const handleBackToModeSelection = () => {
		setActiveMode('');
		setEntryPath('');
		setError(null);
		setShowAdvanced(false);
	};

	const handleEntryPathSelect = (path) => {
		setEntryPath(path);
		setError(null);
	};

	const toggleSyllabusFocus = (unit) => {
		setSelectedSyllabusFocus((prev) =>
			prev.includes(unit)
				? prev.filter((item) => item !== unit)
				: [...prev, unit],
		);
	};

	const toggleExamBookmark = (examId) => {
		setBookmarkedExamIds((prev) =>
			prev.includes(examId)
				? prev.filter((id) => id !== examId)
				: [examId, ...prev].slice(0, 15),
		);
	};

	const isExamBookmarked = (examId) => bookmarkedExamIds.includes(examId);

	const saveCurrentQuizPreset = () => {
		const topicSeed = topic.trim();
		const normalizedTopics = [...selectedTopics].sort();
		if (!topicSeed && normalizedTopics.length === 0) {
			setError(
				'Add a topic or suggested topics before bookmarking a preset for quick start.',
			);
			return;
		}

		const presetKey = [
			testType,
			numQuestions,
			difficulty,
			language,
			selectedCategory || '',
			normalizedTopics.join('|'),
			topicSeed,
		].join('::');
		const alreadyExists = bookmarkedQuizPresets.some(
			(preset) => preset.key === presetKey,
		);
		if (alreadyExists) {
			setError('This quiz preset is already bookmarked.');
			return;
		}

		const preset = {
			id: `preset-${Date.now()}`,
			key: presetKey,
			label: `${testType.replace('-', ' ')} • ${difficulty} • ${numQuestions}Q`,
			testType,
			numQuestions,
			difficulty,
			language,
			category: selectedCategory || '',
			selectedTopics: normalizedTopics,
			topicSeed,
		};

		setBookmarkedQuizPresets((prev) => [preset, ...prev].slice(0, 12));
		setError(null);
	};

	const handleQuickStartExam = async (examId) => {
		const exam = getIndianExamById(examId);
		if (!exam) {
			setError('Bookmarked exam is unavailable.');
			return;
		}
		const requestParams = getExamRequestParams({
			exam,
			syllabusFocus: exam.syllabus,
		});
		await runGeneration(requestParams);
	};

	const handleQuickStartPreset = async (preset) => {
		const presetTopics = Array.isArray(preset.selectedTopics)
			? preset.selectedTopics
			: [];
		const presetTopic = preset.topicSeed || '';
		if (!presetTopic && presetTopics.length === 0) {
			setError('This bookmarked preset is missing topic context.');
			return;
		}

		const requestParams = {
			testMode: TEST_MODES.QUIZ_PRACTICE,
			topic: presetTopic,
			category: preset.category || '',
			selectedTopics: presetTopics,
			examId: null,
			examName: null,
			examStream: null,
			syllabusFocus: [],
			testType: preset.testType || 'multiple-choice',
			numQuestions: Number(preset.numQuestions) || 10,
			difficulty: preset.difficulty || 'intermediate',
			language: preset.language || language,
			objectiveOnly: false,
			durationMinutes: null,
		};
		await runGeneration(requestParams);
	};

	const handleTestIdSubmit = (e) => {
		e.preventDefault();
		if (testId && testId.trim()) {
			router.push(`/test?id=${testId.trim()}`);
		} else {
			setError('Please enter a valid test ID');
		}
	};

	const handleSubmit = async (e) => {
		if (e) e.preventDefault();
		if (!activeMode) {
			setError('Please select a test mode first.');
			return;
		}

		if (activeMode === TEST_MODES.FULL_EXAM) {
			if (!selectedExam) {
				setError('Please select an objective exam for full-length paper.');
				return;
			}
			const requestParams = getExamRequestParams({
				exam: selectedExam,
				syllabusFocus: selectedSyllabusFocus,
				customTopic: topic,
			});
			await runGeneration(requestParams);
			return;
		}

		const combinedTopics = [...new Set(selectedTopics)];
		const effectiveTopic = topic.trim();
		if (!effectiveTopic && combinedTopics.length === 0) {
			setError('Please provide a topic or choose suggested topics.');
			return;
		}

		const requestParams = {
			testMode: TEST_MODES.QUIZ_PRACTICE,
			topic: effectiveTopic,
			category: selectedCategory || '',
			selectedTopics: combinedTopics,
			examId: null,
			examName: null,
			examStream: null,
			syllabusFocus: [],
			testType,
			numQuestions,
			difficulty,
			language,
			objectiveOnly: false,
			durationMinutes: null,
		};
		await runGeneration(requestParams);
	};

	return (
		<Container className='pb-3 d-flex flex-column align-items-center justify-content-center'>
			<div className='text-center mb-4'>
				<h1 className='display-4 fw-bold mb-2' style={{ letterSpacing: '-1px' }}>
					{t('createQuiz')}
				</h1>
				<p className='text-muted fs-5'>
					{activeMode
						? 'Configure your test and generate paper.'
						: 'Use bookmarks for instant start or choose a mode.'}
				</p>
			</div>

			<div className='d-flex flex-wrap justify-content-center align-items-center gap-2 mb-3'>
				<Button
					type='button'
					variant='outline-secondary'
					size='sm'
					className='rounded-pill'
					onClick={toggleLanguage}
				>
					UI Language: {uiLanguage === 'hindi' ? 'Hindi' : 'English'}
				</Button>
				<Form.Select
					size='sm'
					value={language}
					onChange={(e) => setLanguage(e.target.value)}
					className='glass-input'
					style={{ width: '160px' }}
					aria-label='Paper language'
				>
					<option value='english'>Paper: English</option>
					<option value='hindi'>Paper: Hindi</option>
					<option value='spanish'>Paper: Spanish</option>
				</Form.Select>
			</div>

			{!activeMode && (
				<Card className='w-100 border-0 glass-card mb-3' style={{ maxWidth: '720px' }}>
					<Card.Body className='p-3 p-md-4'>
						<div className='d-flex justify-content-between align-items-center gap-2 mb-2'>
							<div className='fw-semibold'>Bookmarked Quick Start</div>
							<Badge bg='light' text='dark' className='border'>
								Direct Create
							</Badge>
						</div>
						<Row className='g-3'>
							<Col xs={12}>
								<div className='small text-muted mb-1 d-flex align-items-center gap-1'>
									<Icon name='starFill' size={12} className='text-warning' />
									Bookmarked Exams
								</div>
								{bookmarkedExams.length > 0 ? (
									<div className='d-flex flex-wrap gap-2'>
										{bookmarkedExams.map((exam) => (
											<Button
												key={exam.id}
												type='button'
												size='sm'
												variant='outline-primary'
												className='rounded-pill'
												disabled={loading}
												onClick={() => handleQuickStartExam(exam.id)}
											>
												Start {exam.name}
											</Button>
										))}
									</div>
								) : (
									<div className='small text-muted'>
										No bookmarked exams yet. Bookmark from Full Exam mode.
									</div>
								)}
							</Col>
							<Col xs={12}>
								<div className='small text-muted mb-1 d-flex align-items-center gap-1'>
									<Icon name='starFill' size={12} className='text-warning' />
									Bookmarked Quiz Presets
								</div>
								{bookmarkedQuizPresets.length > 0 ? (
									<div className='d-flex flex-wrap gap-2'>
										{bookmarkedQuizPresets.map((preset) => (
											<Button
												key={preset.id}
												type='button'
												size='sm'
												variant='outline-secondary'
												className='rounded-pill'
												disabled={loading}
												onClick={() => handleQuickStartPreset(preset)}
											>
												Start {preset.label}
											</Button>
										))}
									</div>
								) : (
									<div className='small text-muted'>
										No bookmarked quiz presets yet. Save one in Quiz mode.
									</div>
								)}
							</Col>
						</Row>
					</Card.Body>
				</Card>
			)}

			{!activeMode ? (
				<Card className='w-100 border-0 glass-card mb-4' style={{ maxWidth: '720px' }}>
					<Card.Body className='p-4 p-md-5'>
						<div className='d-flex flex-column gap-3'>
							<div className='fw-semibold'>Choose Test Mode</div>
							<Row className='g-2'>
								<Col xs={12} md={6}>
									<Button
										type='button'
										variant='outline-primary'
										className='w-100 py-3 d-flex align-items-center justify-content-center gap-2'
										onClick={() => handleModeSelect(TEST_MODES.FULL_EXAM)}
									>
										<Icon name='bookOpen' />
										<span>Full Exam Paper</span>
									</Button>
								</Col>
								<Col xs={12} md={6}>
									<Button
										type='button'
										variant='outline-primary'
										className='w-100 py-3 d-flex align-items-center justify-content-center gap-2'
										onClick={() => handleModeSelect(TEST_MODES.QUIZ_PRACTICE)}
									>
										<Icon name='sparkles' />
										<span>Quiz Practice</span>
									</Button>
								</Col>
							</Row>
						</div>
					</Card.Body>
				</Card>
			) : (
				<Card className='w-100 border-0 glass-card mb-2' style={{ maxWidth: '720px' }}>
					<Card.Body className='p-3'>
						<div className='d-flex justify-content-between align-items-center gap-2'>
							<div className='d-flex align-items-center gap-2 flex-wrap'>
								<Badge bg='primary'>{currentModeLabel}</Badge>
							</div>
							<div className='d-flex align-items-center gap-1'>
								<Button
									type='button'
									variant='outline-secondary'
									size='sm'
									className='d-none d-md-inline-flex rounded-pill align-items-center gap-2'
									onClick={handleBackToModeSelection}
								>
									<Icon name='repeat1' size={14} />
									Change mode
								</Button>
								<Button
									type='button'
									variant='outline-secondary'
									size='sm'
									className='d-md-none rounded-circle d-inline-flex align-items-center justify-content-center p-0'
									style={{ width: '34px', height: '34px' }}
									onClick={handleBackToModeSelection}
									aria-label='Change mode'
									title='Change mode'
								>
									<Icon name='repeat1' size={14} />
								</Button>
							</div>
						</div>
					</Card.Body>
				</Card>
			)}

			{activeMode && (
				<Card className='w-100 border-0 glass-card mb-4' style={{ maxWidth: '720px' }}>
					<Card.Body className='p-4 p-md-5'>
						<div className='mb-4'>
							<div className='small text-muted fw-semibold mb-2'>Continue With</div>
							<div className='d-flex flex-wrap gap-2'>
								<Button
									type='button'
									variant={
										isExistingTestPath ? 'primary' : 'outline-primary'
									}
									size='sm'
									className='rounded-pill'
									onClick={() => handleEntryPathSelect(ENTRY_PATHS.EXISTING)}
								>
									Use Test ID
								</Button>
								<Button
									type='button'
									variant={isNewTestPath ? 'primary' : 'outline-primary'}
									size='sm'
									className='rounded-pill'
									onClick={() => handleEntryPathSelect(ENTRY_PATHS.NEW)}
								>
									Create New Test
								</Button>
							</div>
						</div>

						{!entryPath && (
							<Alert variant='light' className='border'>
								Choose an option to continue.
							</Alert>
						)}

						{isExistingTestPath && (
							<Form onSubmit={handleTestIdSubmit}>
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
									<Form.Text className='text-muted small'>{t('haveTestId')}</Form.Text>
								</Form.Group>
								{error && (
									<Alert variant='danger' className='border-0 shadow-sm mt-3 mb-0'>
										{error}
									</Alert>
								)}
							</Form>
						)}

						{isNewTestPath && (
							<Form onSubmit={handleSubmit}>
								{activeMode === TEST_MODES.FULL_EXAM && (
									<div className='d-flex flex-column gap-3'>
										<div className='d-flex flex-wrap justify-content-between align-items-center gap-2'>
											<Form.Label className='small text-muted fw-semibold mb-0'>
												Objective Exams (No Subjective)
											</Form.Label>
											<div className='d-flex align-items-center gap-2'>
												<Form.Check
													type='switch'
													id='bookmarked-exams-only'
													label='Bookmarked only'
													checked={showBookmarkedExamsOnly}
													onChange={(e) =>
														setShowBookmarkedExamsOnly(e.target.checked)
													}
												/>
												<Button
													type='button'
													size='sm'
													variant='outline-secondary'
													className='rounded-pill'
													onClick={() => setShowExamBrowser((prev) => !prev)}
												>
													{showExamBrowser ? 'Hide list' : 'Browse exams'}
												</Button>
											</div>
										</div>

										<Form.Select
											size='sm'
											value={selectedExamId}
											onChange={(e) => setSelectedExamId(e.target.value)}
											className='glass-input'
										>
											<option value=''>Choose objective exam</option>
											{visibleExams.map((exam) => (
												<option key={exam.id} value={exam.id}>
													{exam.name} ({exam.stream})
												</option>
											))}
										</Form.Select>

										{showExamBrowser && (
											<div
												className='rounded-3 border bg-white p-2'
												style={{ maxHeight: '220px', overflowY: 'auto' }}
											>
												{visibleExams.map((exam) => {
													const isBookmarked = isExamBookmarked(exam.id);
													return (
														<div
															key={exam.id}
															className='px-2 py-2 border-bottom d-flex justify-content-between align-items-start gap-2'
														>
															<div>
																<div className='small fw-semibold text-dark'>{exam.name}</div>
																<div className='small text-muted'>
																	{exam.fullLengthQuestions} Q • {exam.durationMinutes} min
																</div>
																{isBookmarked && (
																	<div className='small text-warning'>Bookmarked</div>
																)}
															</div>
															<div className='d-flex align-items-center gap-2'>
																<Button
																	type='button'
																	size='sm'
																	variant={
																		selectedExamId === exam.id
																			? 'primary'
																			: 'outline-secondary'
																	}
																	onClick={() => setSelectedExamId(exam.id)}
																>
																	Select
																</Button>
																<Button
																	type='button'
																	variant='link'
																	className='p-0'
																	onClick={() => toggleExamBookmark(exam.id)}
																	aria-label='bookmark exam'
																>
																	<Icon
																		name={isBookmarked ? 'starFill' : 'star'}
																		size={18}
																		className={isBookmarked ? 'text-warning' : 'text-muted'}
																	/>
																</Button>
															</div>
														</div>
													);
												})}
											</div>
										)}

										{selectedExam && (
											<Card className='border-0 bg-light bg-opacity-50'>
												<Card.Body className='p-3'>
													<div className='d-flex flex-wrap gap-2 mb-2'>
														<Badge bg='primary'>Objective</Badge>
														<Badge bg='secondary'>
															{selectedExam.fullLengthQuestions} Questions
														</Badge>
														<Badge bg='secondary'>
															{selectedExam.durationMinutes} Minutes
														</Badge>
													</div>
													<p className='small text-muted mb-2'>{selectedExam.description}</p>
													<Form.Group className='mb-2'>
														<Form.Label className='small text-muted fw-semibold'>
															Optional Topic Notes
														</Form.Label>
														<Form.Control
															as='textarea'
															rows={2}
															value={topic}
															onChange={(e) => setTopic(e.target.value)}
															placeholder='Add custom instruction for this full exam paper'
															className='glass-input'
															style={{ resize: 'none' }}
														/>
													</Form.Group>
													<Form.Label className='small text-muted fw-semibold'>
														Syllabus Focus
													</Form.Label>
													<div className='d-flex flex-wrap gap-2'>
														{selectedExam.syllabus.map((unit) => (
															<Button
																type='button'
																key={unit}
																variant={
																	selectedSyllabusFocus.includes(unit)
																		? 'primary'
																		: 'light'
																}
																size='sm'
																className='rounded-pill'
																onClick={() => toggleSyllabusFocus(unit)}
															>
																{unit}
															</Button>
														))}
													</div>
													<Form.Text className='small text-muted d-block mt-2'>
														{selectedSyllabusFocus.length} of {selectedExam.syllabus.length}{' '}
														units selected
													</Form.Text>
												</Card.Body>
											</Card>
										)}
									</div>
								)}

								{activeMode === TEST_MODES.QUIZ_PRACTICE && (
									<div className='d-flex flex-column gap-3'>
										<Form.Group>
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

										<div className='d-flex flex-wrap justify-content-between align-items-center gap-2'>
											<Button
												type='button'
												variant='link'
												className='text-decoration-none p-0 text-muted d-flex align-items-center gap-2'
												onClick={() => setShowAdvanced(!showAdvanced)}
											>
												<Icon name={showAdvanced ? 'chevronUp' : 'chevronDown'} size={14} />
												{showAdvanced ? t('hideOptions') : t('moreOptions')}
											</Button>
											<Button
												type='button'
												variant='outline-secondary'
												size='sm'
												onClick={saveCurrentQuizPreset}
											>
												Bookmark Current Preset
											</Button>
										</div>

										{!showAdvanced && (
											<div className='d-flex flex-wrap gap-2'>
												<Form.Select
													size='sm'
													value={numQuestions}
													onChange={(e) => setNumQuestions(Number(e.target.value))}
													className='glass-input'
													style={{ minWidth: '100px' }}
												>
													{[5, 10, 15, 20].map((num) => (
														<option key={num} value={num}>
															{num} Qs
														</option>
													))}
												</Form.Select>
												<Form.Select
													size='sm'
													value={difficulty}
													onChange={(e) => setDifficulty(e.target.value)}
													className='glass-input'
													style={{ minWidth: '120px' }}
												>
													<option value='beginner'>Beginner</option>
													<option value='intermediate'>Intermediate</option>
													<option value='advanced'>Advanced</option>
													<option value='expert'>Expert</option>
												</Form.Select>
												<Form.Select
													size='sm'
													value={testType}
													onChange={(e) => setTestType(e.target.value)}
													className='glass-input'
													style={{ minWidth: '150px' }}
												>
													<option value='multiple-choice'>Multiple Choice</option>
													<option value='true-false'>True/False</option>
													<option value='coding'>Coding Problems</option>
													<option value='mixed'>Mixed Format</option>
													<option value='speed-challenge'>Speed Challenge</option>
												</Form.Select>
											</div>
										)}

										{showAdvanced && (
											<div className='p-4 rounded-3 bg-light bg-opacity-50 border border-light'>
												<Row className='g-3'>
													<Col xs={6} sm={3}>
														<Form.Label className='small text-muted fw-semibold'>
															Questions
														</Form.Label>
														<Form.Select
															size='sm'
															value={numQuestions}
															onChange={(e) => setNumQuestions(Number(e.target.value))}
															className='glass-input'
														>
															{[5, 10, 15, 20, 25, 30].map((num) => (
																<option key={num} value={num}>
																	{num}
																</option>
															))}
														</Form.Select>
													</Col>
													<Col xs={6} sm={3}>
														<Form.Label className='small text-muted fw-semibold'>
															Difficulty
														</Form.Label>
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
													<Col xs={12} sm={6}>
														<Form.Label className='small text-muted fw-semibold'>
															Format
														</Form.Label>
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
															<option value='speed-challenge'>Speed Challenge</option>
														</Form.Select>
													</Col>
												</Row>

												<hr className='my-3 opacity-25' />

												<Form.Label className='small text-muted fw-semibold d-flex justify-content-between'>
													<span>Category (Optional)</span>
													{selectedCategory && (
														<Button
															type='button'
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
															type='button'
															key={category}
															variant={
																selectedCategory === category
																	? 'primary'
																	: 'outline-secondary'
															}
															size='sm'
															className={`rounded-pill px-3 ${
																selectedCategory !== category ? 'border-0 bg-white' : ''
															}`}
															onClick={() =>
																setSelectedCategory(
																	selectedCategory === category ? '' : category,
																)
															}
														>
															{category}
														</Button>
													))}
												</div>

												{selectedCategory && (
													<div className='fade-slide fade-in'>
														<Form.Label className='small text-muted fw-semibold'>
															Suggested Topics
														</Form.Label>
														<div className='d-flex flex-wrap gap-2'>
															{TOPIC_CATEGORIES[selectedCategory]?.map((topicItem) => (
																<Button
																	type='button'
																	key={topicItem}
																	variant={
																		selectedTopics.includes(topicItem)
																			? 'primary'
																			: 'light'
																	}
																	size='sm'
																	className='rounded-pill'
																	onClick={() => {
																		setSelectedTopics((prev) =>
																			prev.includes(topicItem)
																				? prev.filter((t) => t !== topicItem)
																				: [...prev, topicItem],
																		);
																	}}
																>
																	{topicItem}
																</Button>
															))}
														</div>
													</div>
												)}
											</div>
										)}
									</div>
								)}

								{error && (
									<Alert variant='danger' className='border-0 shadow-sm mt-3'>
										{error}
									</Alert>
								)}

								{shouldSaveData &&
									activeMode === TEST_MODES.QUIZ_PRACTICE &&
									!isOffline && (
										<Alert
											variant='info'
											className='border-0 py-2 px-3 d-flex align-items-center gap-2 small mt-3'
										>
											<Icon name='signal' size={16} />
											<span>
												Slow connection detected. Reduced to {numQuestions} questions for
												faster loading.
											</span>
										</Alert>
									)}

								{shouldSaveData &&
									activeMode === TEST_MODES.FULL_EXAM &&
									!isOffline && (
										<Alert
											variant='info'
											className='border-0 py-2 px-3 d-flex align-items-center gap-2 small mt-3'
										>
											<Icon name='signal' size={16} />
											<span>
												Full-length objective papers may take longer on slow connection.
											</span>
										</Alert>
									)}

								{isOffline && (
									<Alert
										variant='warning'
										className='border-0 py-2 px-3 d-flex align-items-center gap-2 small mt-3'
									>
										<Icon name='wifiOff' size={16} />
										<span>
											You&apos;re offline. You can still access previously generated tests
											from history.
										</span>
									</Alert>
								)}

								<Button
									variant='primary'
									type='submit'
									disabled={loading || !hasNewTestInputContext}
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
							</Form>
						)}
					</Card.Body>
				</Card>
			)}

			<Card className='border-0 bg-transparent'>
				<Card.Body className='text-center p-3'>
					<div className='d-flex flex-column align-items-center opacity-75'>
						<div className='d-flex align-items-center gap-2 mb-2'>
							<Icon name='lightbulb' className='text-warning' />
							<span className='fw-semibold'>{t('proTip')}</span>
						</div>
						<p className='text-muted small mb-0' style={{ maxWidth: '460px' }}>
							{activeMode === TEST_MODES.FULL_EXAM
								? 'Tap bookmarked exam chips to instantly create full papers. Use browse list only when needed.'
								: t('proTipContent')}
						</p>
					</div>
				</Card.Body>
			</Card>
		</Container>
	);
};

export default GenerateTestForm;
