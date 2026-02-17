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

const EXAM_GROUP_FILTERS = ['all', 'A', 'B', 'C', 'D'];

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
	const { t, language: uiLanguage } = useLanguage();

	const [activeMode, setActiveMode] = useState('');
	const [showBookmarkedExamsOnly, setShowBookmarkedExamsOnly] = useState(false);
	const [showExamBrowser, setShowExamBrowser] = useState(true);
	const [examSearchQuery, setExamSearchQuery] = useState('');
	const [examGroupFilter, setExamGroupFilter] = useState('all');
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
	const [paperLanguage, setPaperLanguage] = useLocalStorage(
		STORAGE_KEYS.PAPER_LANGUAGE,
		uiLanguage,
	);
	const [selectedCategory, setSelectedCategory] = useState('');
	const [startTime, setStartTime] = useState(null);
	const [elapsed, setElapsed] = useState(0);
	const [, setRetryCount] = useState(0);

	const router = useRouter();
	const timerRef = useRef(null);
	const MAX_RETRIES = 3;
	const { isOffline, shouldSaveData } = useNetworkStatus();
	const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const difficultyOptions = [
		{ value: 'beginner', label: t('beginner') },
		{ value: 'intermediate', label: t('intermediate') },
		{ value: 'advanced', label: t('advanced') },
		{ value: 'expert', label: t('expert') },
	];
	const formatOptions = [
		{ value: 'multiple-choice', label: t('multipleChoice') },
		{ value: 'true-false', label: t('trueFalse') },
		{ value: 'coding', label: t('codingProblems') },
		{ value: 'mixed', label: t('mixedFormat') },
		{ value: 'speed-challenge', label: t('speedChallenge') },
	];

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
		const normalizedQuery = examSearchQuery.trim().toLowerCase();
		const baseExams = showBookmarkedExamsOnly ? bookmarkedExams : objectiveExams;

		return baseExams.filter((exam) => {
			const matchesGroup =
				examGroupFilter === 'all' ||
				exam.group
					.split('/')
					.map((item) => item.trim())
					.includes(examGroupFilter);
			if (!matchesGroup) return false;
			if (!normalizedQuery) return true;

			const searchableText = [
				exam.name,
				exam.stream,
				exam.group,
				...(Array.isArray(exam.syllabus) ? exam.syllabus : []),
			]
				.join(' ')
				.toLowerCase();

			return searchableText.includes(normalizedQuery);
		});
	}, [
		examSearchQuery,
		examGroupFilter,
		showBookmarkedExamsOnly,
		objectiveExams,
		bookmarkedExams,
	]);
	const hasNewTestInputContext =
		activeMode === TEST_MODES.FULL_EXAM
			? Boolean(selectedExamId)
			: topic.trim().length > 0 || selectedTopics.length > 0;
	const currentModeLabel =
		activeMode === TEST_MODES.FULL_EXAM
			? t('fullExamPaper')
			: activeMode === TEST_MODES.QUIZ_PRACTICE
				? t('quizPractice')
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
		if (
			Array.isArray(exam.availableLanguages) &&
			exam.availableLanguages.length > 0 &&
			!exam.availableLanguages.includes(paperLanguage)
		) {
			setPaperLanguage(exam.availableLanguages[0]);
		}
		setShowAdvanced(false);
		setShowExamBrowser(false);
		setTopic((prevTopic) =>
			prevTopic.trim()
				? prevTopic
				: `${exam.name} full-length objective mock paper`,
		);
	}, [activeMode, selectedExamId, paperLanguage, setPaperLanguage]);

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
			language: paperLanguage,
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
					setError(
						`${t('retrying')} (${t('attempt')} ${attempt} ${t('of')} ${MAX_RETRIES})`,
					);
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
							setError(errorData.error || t('rateLimitExceeded'));
							return;
						}
						if (attempt === MAX_RETRIES) {
							setError(
								errorData.error ||
									t('errorFailedGenerateAfterAttempts'),
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
							`${t('errorFailedAfterAttempts')} ${err.message}`,
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
		setError(null);
		setExamSearchQuery('');
		setExamGroupFilter('all');
		setShowBookmarkedExamsOnly(false);
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
		setError(null);
		setShowAdvanced(false);
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
			setError(t('errorAddTopicBeforeBookmark'));
			return;
		}

		const presetKey = [
			testType,
			numQuestions,
			difficulty,
			paperLanguage,
			selectedCategory || '',
			normalizedTopics.join('|'),
			topicSeed,
		].join('::');
		const alreadyExists = bookmarkedQuizPresets.some(
			(preset) => preset.key === presetKey,
		);
		if (alreadyExists) {
			setError(t('errorPresetAlreadyBookmarked'));
			return;
		}

		const preset = {
			id: `preset-${Date.now()}`,
			key: presetKey,
			label: `${testType.replace('-', ' ')} • ${difficulty} • ${numQuestions}Q`,
			testType,
			numQuestions,
			difficulty,
			language: paperLanguage,
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
			setError(t('errorBookmarkedExamUnavailable'));
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
			setError(t('errorPresetMissingTopic'));
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
			language: preset.language || paperLanguage,
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
			setError(t('errorInvalidTestId'));
		}
	};

	const handleSubmit = async (e) => {
		if (e) e.preventDefault();
		if (!activeMode) {
			setError(t('errorSelectTestModeFirst'));
			return;
		}

		if (activeMode === TEST_MODES.FULL_EXAM) {
			if (!selectedExam) {
				setError(t('errorSelectObjectiveExam'));
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
			setError(t('errorProvideTopic'));
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
			language: paperLanguage,
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
						? t('configureAndGenerate')
						: t('useBookmarksOrChooseMode')}
				</p>
			</div>

			{!activeMode && (
				<Card className='w-100 border-0 glass-card mb-3' style={{ maxWidth: '720px' }}>
					<Card.Body className='p-3 p-md-4'>
							<Form onSubmit={handleTestIdSubmit}>
								<Form.Group>
									<div className='small text-muted fw-semibold mb-2'>
										{t('haveTestIdTitle')}
									</div>
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
					</Card.Body>
				</Card>
			)}

			{!activeMode && (
				<Card className='w-100 border-0 glass-card mb-3' style={{ maxWidth: '720px' }}>
					<Card.Body className='p-3 p-md-4'>
							<div className='d-flex justify-content-between align-items-center gap-2 mb-2'>
								<div className='fw-semibold'>{t('bookmarkedQuickStart')}</div>
								<Badge bg='light' text='dark' className='border'>
									{t('directCreate')}
								</Badge>
							</div>
						<Row className='g-3'>
							<Col xs={12}>
								<div className='small text-muted mb-1 d-flex align-items-center gap-1'>
									<Icon name='starFill' size={12} className='text-warning' />
									{t('bookmarkedExams')}
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
												{t('start')} {exam.name}
											</Button>
										))}
									</div>
								) : (
									<div className='small text-muted'>
										{t('noBookmarkedExams')}
									</div>
								)}
							</Col>
							<Col xs={12}>
								<div className='small text-muted mb-1 d-flex align-items-center gap-1'>
									<Icon name='starFill' size={12} className='text-warning' />
									{t('bookmarkedQuizPresets')}
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
												{t('start')} {preset.label}
											</Button>
										))}
									</div>
								) : (
									<div className='small text-muted'>
										{t('noBookmarkedQuizPresets')}
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
								<div className='fw-semibold'>{t('chooseTestMode')}</div>
							<Row className='g-2'>
								<Col xs={12} md={6}>
									<Button
										type='button'
										variant='outline-primary'
										className='w-100 py-3 d-flex align-items-center justify-content-center gap-2'
										onClick={() => handleModeSelect(TEST_MODES.FULL_EXAM)}
									>
										<Icon name='bookOpen' />
										<span>{t('fullExamPaper')}</span>
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
										<span>{t('quizPractice')}</span>
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
										{t('changeMode')}
									</Button>
								<Button
									type='button'
									variant='outline-secondary'
									size='sm'
									className='d-md-none rounded-circle d-inline-flex align-items-center justify-content-center p-0'
										style={{ width: '34px', height: '34px' }}
										onClick={handleBackToModeSelection}
										aria-label={t('changeMode')}
										title={t('changeMode')}
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
							<div className='d-flex justify-content-end mb-3'>
								<div style={{ minWidth: '170px' }}>
									<Form.Label className='small text-muted fw-semibold mb-1 d-block'>
										{t('paperLanguage')}
									</Form.Label>
									<Form.Select
										size='sm'
										value={paperLanguage}
										onChange={(e) => setPaperLanguage(e.target.value)}
										className='glass-input'
										aria-label={t('paperLanguage')}
									>
										<option value='english'>{t('englishLabel')}</option>
										<option value='hindi'>{t('hindiLabel')}</option>
									</Form.Select>
								</div>
							</div>

						<Form onSubmit={handleSubmit}>
								{activeMode === TEST_MODES.FULL_EXAM && (
									<div className='d-flex flex-column gap-3'>
											<div className='d-flex flex-wrap justify-content-between align-items-center gap-2'>
												<Form.Label className='small text-muted fw-semibold mb-0'>
													{t('objectiveExamsNoSubjective')}
												</Form.Label>
												<div className='d-flex align-items-center gap-2'>
													<Form.Check
														type='switch'
														id='bookmarked-exams-only'
														label={t('bookmarkedOnly')}
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
														{showExamBrowser ? t('hideList') : t('browseExams')}
													</Button>
												</div>
											</div>

										<Row className='g-2'>
											<Col xs={12} md={7}>
												<Form.Control
													type='text'
														size='sm'
														value={examSearchQuery}
														onChange={(e) => setExamSearchQuery(e.target.value)}
														placeholder={t('searchExamStreamSyllabus')}
														className='glass-input'
													/>
												</Col>
											<Col xs={7} md={3}>
													<Form.Select
														size='sm'
														value={examGroupFilter}
														onChange={(e) => setExamGroupFilter(e.target.value)}
														className='glass-input'
														aria-label={t('filterByGroup')}
													>
														{EXAM_GROUP_FILTERS.map((group) => (
															<option key={group} value={group}>
																{group === 'all'
																	? t('allGroups')
																	: `${t('group')} ${group}`}
															</option>
														))}
													</Form.Select>
											</Col>
											<Col xs={5} md={2}>
												<Button
													type='button'
													size='sm'
													variant='outline-secondary'
													className='w-100'
														onClick={() => {
															setExamSearchQuery('');
															setExamGroupFilter('all');
														}}
													>
														{t('clear')}
													</Button>
												</Col>
											</Row>

											<div className='small text-muted'>
												{t('showingObjectiveExams')} {visibleExams.length}{' '}
												{t('objectiveExamsInLanguages')}
											</div>

										<Form.Select
											size='sm'
												value={selectedExamId}
												onChange={(e) => setSelectedExamId(e.target.value)}
												className='glass-input'
											>
												<option value=''>{t('chooseObjectiveExam')}</option>
												{visibleExams.map((exam) => (
													<option key={exam.id} value={exam.id}>
														{exam.name} • {t('group')} {exam.group} • {exam.stream}
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
																		{exam.fullLengthQuestions} {t('questionShort')} •{' '}
																		{exam.durationMinutes} {t('minuteShort')}
																	</div>
																	<div className='small text-muted'>
																		{t('group')} {exam.group} • {exam.stream}
																	</div>
																	<div className='small text-muted'>
																		{t('languages')}: {exam.availableLanguages.join(' / ')}
																	</div>
																	{isBookmarked && (
																		<div className='small text-warning'>
																			{t('bookmarkedTag')}
																		</div>
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
																		{t('select')}
																	</Button>
																<Button
																	type='button'
																	variant='link'
																	className='p-0'
																	onClick={() => toggleExamBookmark(exam.id)}
																	aria-label={t('bookmarkExam')}
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
														<Badge bg='primary'>{t('objective')}</Badge>
														<Badge bg='dark'>
															{t('group')} {selectedExam.group}
														</Badge>
														<Badge bg='secondary'>
															{selectedExam.fullLengthQuestions} {t('questionsLabel')}
														</Badge>
														<Badge bg='secondary'>
															{selectedExam.durationMinutes} {t('minutesLabel')}
														</Badge>
														<Badge bg='info' text='dark'>
															{selectedExam.availableLanguages.join(' / ')}
														</Badge>
													</div>
													<p className='small text-muted mb-2'>{selectedExam.description}</p>
													<Form.Group className='mb-2'>
														<Form.Label className='small text-muted fw-semibold'>
															{t('optionalTopicNotes')}
														</Form.Label>
														<Form.Control
															as='textarea'
															rows={2}
															value={topic}
															onChange={(e) => setTopic(e.target.value)}
															placeholder={t('fullExamInstructionPlaceholder')}
															className='glass-input'
															style={{ resize: 'none' }}
														/>
													</Form.Group>
													<Form.Label className='small text-muted fw-semibold'>
														{t('syllabusFocus')}
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
														{t('unitsSelected')}
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
												{t('bookmarkCurrentPreset')}
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
															{num} {t('qsShort')}
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
													{difficultyOptions.map((option) => (
														<option key={option.value} value={option.value}>
															{option.label}
														</option>
													))}
												</Form.Select>
												<Form.Select
													size='sm'
													value={testType}
													onChange={(e) => setTestType(e.target.value)}
													className='glass-input'
													style={{ minWidth: '150px' }}
												>
													{formatOptions.map((option) => (
														<option key={option.value} value={option.value}>
															{option.label}
														</option>
													))}
												</Form.Select>
											</div>
										)}

										{showAdvanced && (
											<div className='p-4 rounded-3 bg-light bg-opacity-50 border border-light'>
												<Row className='g-3'>
													<Col xs={6} sm={3}>
														<Form.Label className='small text-muted fw-semibold'>
															{t('questionsHeading')}
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
															{t('difficultyHeading')}
														</Form.Label>
														<Form.Select
															size='sm'
															value={difficulty}
															onChange={(e) => setDifficulty(e.target.value)}
															className='glass-input'
														>
															{difficultyOptions.map((option) => (
																<option key={option.value} value={option.value}>
																	{option.label}
																</option>
															))}
														</Form.Select>
													</Col>
													<Col xs={12} sm={6}>
														<Form.Label className='small text-muted fw-semibold'>
															{t('formatHeading')}
														</Form.Label>
														<Form.Select
															size='sm'
															value={testType}
															onChange={(e) => setTestType(e.target.value)}
															className='glass-input'
														>
															{formatOptions.map((option) => (
																<option key={option.value} value={option.value}>
																	{option.label}
																</option>
															))}
														</Form.Select>
													</Col>
												</Row>

												<hr className='my-3 opacity-25' />

												<Form.Label className='small text-muted fw-semibold d-flex justify-content-between'>
													<span>{t('categoryOptional')}</span>
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
															{t('clear')}
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
																{t('suggestedTopics')}
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
												{t('slowConnectionReduced')} {numQuestions} {t('forFasterLoading')}
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
												{t('fullLengthSlowConnection')}
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
											{t('offlineAccessHistory')}
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
								? t('fullExamProTip')
								: t('proTipContent')}
						</p>
					</div>
				</Card.Body>
			</Card>
		</Container>
	);
};

export default GenerateTestForm;
