// src/app/components/GenerateTestForm.js

'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import useLocalStorage from '../hooks/useLocalStorage';
import useNetworkStatus from '../hooks/useNetworkStatus';
import { APP_EVENTS, STORAGE_KEYS, TOPIC_CATEGORIES } from '../constants';
import { OBJECTIVE_ONLY_EXAMS, getIndianExamById } from '../data/indianExams';
import {
	isApiLimitExceededError,
	isApiLimitExceededResponse,
	isApiTimeoutError,
	isApiTimeoutResponse,
} from '../utils/apiLimitError';
import Icon from './Icon';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import TestIdEntryCard from './generate/TestIdEntryCard';
import BookmarkedQuickStartCard from './generate/BookmarkedQuickStartCard';
import NewTestEntryCard from './generate/NewTestEntryCard';
import ModeSelectionCard from './generate/ModeSelectionCard';
import ActiveModeCard from './generate/ActiveModeCard';
import ProTipCard from './generate/ProTipCard';
import LoadingElapsed from './generate/LoadingElapsed';
import FullExamConfigurationSection from './generate/FullExamConfigurationSection';
import QuizPracticeConfigurationSection from './generate/QuizPracticeConfigurationSection';
import GoogleSignInButton from './GoogleSignInButton';
import {
	Container,
	Form,
	Button,
	Alert,
	Card,
	Spinner,
	Modal,
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
	const { isAuthenticated, loginWithGoogleCredential } = useAuth();

	const [activeMode, setActiveMode] = useState('');
	const [showModeSelection, setShowModeSelection] = useState(false);
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
	const [showAuthRequiredModal, setShowAuthRequiredModal] = useState(false);
	const [authPromptError, setAuthPromptError] = useState('');
	const pendingGenerationRequestRef = useRef(null);

	const router = useRouter();
	const MAX_RETRIES = 3;
	const GENERATION_TIMEOUT_MS = 180000;
	const { isOffline, shouldSaveData } = useNetworkStatus();
	const wait = useCallback(
		(ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		[],
	);
	const difficultyOptions = useMemo(
		() => [
			{ value: 'beginner', label: t('beginner') },
			{ value: 'intermediate', label: t('intermediate') },
			{ value: 'advanced', label: t('advanced') },
			{ value: 'expert', label: t('expert') },
		],
		[t],
	);
	const formatOptions = useMemo(
		() => [
			{ value: 'multiple-choice', label: t('multipleChoice') },
			{ value: 'true-false', label: t('trueFalse') },
			{ value: 'coding', label: t('codingProblems') },
			{ value: 'mixed', label: t('mixedFormat') },
			{ value: 'speed-challenge', label: t('speedChallenge') },
		],
		[t],
	);

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
	const heroSubtitle = activeMode
		? t('configureAndGenerate')
		: showModeSelection
			? t('chooseModeToContinue')
			: t('resumeOrCreate');
	const openModeSelection = useCallback(() => {
		setActiveMode('');
		setShowModeSelection(true);
		setError(null);
		setShowAdvanced(false);
	}, []);
	const openCreateFlow = useCallback(() => {
		openModeSelection();
		setExamSearchQuery('');
		setExamGroupFilter('all');
		setShowBookmarkedExamsOnly(false);
	}, [openModeSelection]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		if (url.searchParams.get('start') !== 'create') return;
		openCreateFlow();
		url.searchParams.delete('start');
		url.searchParams.delete('mode');
		const cleanedPath = `${url.pathname}${url.search}${url.hash}`;
		window.history.replaceState({}, '', cleanedPath);
	}, [openCreateFlow]);

	useEffect(() => {
		if (typeof window === 'undefined') return undefined;
		const handleOpenCreate = () => {
			openCreateFlow();
			window.scrollTo({ top: 0, behavior: 'smooth' });
		};
		window.addEventListener(APP_EVENTS.OPEN_CREATE_TEST, handleOpenCreate);
		return () => {
			window.removeEventListener(APP_EVENTS.OPEN_CREATE_TEST, handleOpenCreate);
		};
	}, [openCreateFlow]);

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

	const getExamRequestParams = useCallback(({
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
		}, [paperLanguage]);

	const promptSignInForGeneration = useCallback((requestParams) => {
		pendingGenerationRequestRef.current = requestParams;
		setAuthPromptError('');
		setShowAuthRequiredModal(true);
		setError(t('errorSignInRequiredCreate'));
	}, [t]);

	const runGenerationCore = useCallback(async (requestParams) => {
		setLoading(true);
		setError(null);
		const generationStartedAt = Date.now();

		const remainingMs = () =>
			GENERATION_TIMEOUT_MS - (Date.now() - generationStartedAt);

		try {
			for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
				if (remainingMs() <= 0) {
					setError(t('generationTimedOutRetry'));
					return;
				}

				if (attempt > 1) {
					setError(
						`${t('retrying')} (${t('attempt')} ${attempt} ${t('of')} ${MAX_RETRIES})`,
					);
				}

				try {
					const controller = new AbortController();
					const timeoutId = setTimeout(
						() => controller.abort(),
						Math.max(1, remainingMs()),
					);
					let response;
					try {
						response = await fetch('/api/generate', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
							},
							signal: controller.signal,
							body: JSON.stringify({
								...requestParams,
								previousTests: testHistory.slice(0, 10),
							}),
						});
					} finally {
						clearTimeout(timeoutId);
					}

						if (!response.ok) {
							const errorData = await response.json().catch(() => ({}));
							if (response.status === 401) {
								promptSignInForGeneration(requestParams);
								return;
							}
							if (isApiTimeoutResponse(response.status, errorData)) {
								setError(t('generationTimedOutRetry'));
								return;
							}
							if (isApiLimitExceededResponse(response.status, errorData)) {
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
					if (
						err?.name === 'AbortError' ||
						isApiTimeoutError(err) ||
						remainingMs() <= 0
					) {
						setError(t('generationTimedOutRetry'));
						return;
					}

					if (isApiLimitExceededError(err)) {
						setError(t('rateLimitExceeded'));
						return;
					}

					if (attempt === MAX_RETRIES) {
						setError(
							`${t('errorFailedAfterAttempts')} ${err.message}`,
						);
						return;
					}
				}

				const retryDelayMs = Math.min(1500, Math.max(0, remainingMs()));
				if (retryDelayMs <= 0) {
					setError(t('generationTimedOutRetry'));
					return;
				}
				await wait(retryDelayMs);
			}
		} finally {
			setLoading(false);
		}
	}, [
		GENERATION_TIMEOUT_MS,
		MAX_RETRIES,
		promptSignInForGeneration,
		router,
		t,
		testHistory,
		updateHistory,
		wait,
	]);

	const runGeneration = useCallback(async (requestParams) => {
		if (!isAuthenticated) {
			promptSignInForGeneration(requestParams);
			return;
		}
		await runGenerationCore(requestParams);
	}, [isAuthenticated, promptSignInForGeneration, runGenerationCore]);

	const handleGenerationAuthModalHide = useCallback(() => {
		setShowAuthRequiredModal(false);
		setAuthPromptError('');
		pendingGenerationRequestRef.current = null;
	}, []);

	const handleGenerationAuthCredential = useCallback(
		async (credential) => {
			setAuthPromptError('');
			try {
				await loginWithGoogleCredential(credential);
				setShowAuthRequiredModal(false);
				setError(null);
				const pendingRequest = pendingGenerationRequestRef.current;
				pendingGenerationRequestRef.current = null;
				if (pendingRequest) {
					await runGenerationCore(pendingRequest);
				}
			} catch (authError) {
				setAuthPromptError(authError.message || t('googleLoginFailed'));
			}
		},
		[loginWithGoogleCredential, runGenerationCore, t],
	);

	const handleModeSelect = useCallback((mode) => {
		setShowModeSelection(true);
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
	}, []);

	const handleBackToModeSelection = useCallback(() => {
		openModeSelection();
	}, [openModeSelection]);

	const handleStartNewTest = useCallback(() => {
		openModeSelection();
	}, [openModeSelection]);

	const toggleSyllabusFocus = useCallback((unit) => {
		setSelectedSyllabusFocus((prev) =>
			prev.includes(unit)
				? prev.filter((item) => item !== unit)
				: [...prev, unit],
		);
	}, []);

	const toggleExamBookmark = useCallback((examId) => {
		setBookmarkedExamIds((prev) =>
			prev.includes(examId)
				? prev.filter((id) => id !== examId)
				: [examId, ...prev].slice(0, 15),
		);
	}, [setBookmarkedExamIds]);

	const isExamBookmarked = useCallback(
		(examId) => bookmarkedExamIds.includes(examId),
		[bookmarkedExamIds],
	);

	const saveCurrentQuizPreset = useCallback(() => {
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
	}, [
		bookmarkedQuizPresets,
		difficulty,
		numQuestions,
		paperLanguage,
		selectedCategory,
		selectedTopics,
		setBookmarkedQuizPresets,
		t,
		testType,
		topic,
	]);

	const handleQuickStartExam = useCallback(async (examId) => {
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
	}, [getExamRequestParams, runGeneration, t]);

	const handleQuickStartPreset = useCallback(async (preset) => {
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
	}, [paperLanguage, runGeneration, t]);

	const handleTestIdSubmit = useCallback((e) => {
		e.preventDefault();
		if (testId && testId.trim()) {
			router.push(`/test?id=${testId.trim()}`);
		} else {
			setError(t('errorInvalidTestId'));
		}
	}, [router, t, testId]);

	const handleTestIdChange = useCallback((event) => {
		setTestId(event.target.value);
	}, []);

	const handlePaperLanguageChange = useCallback((event) => {
		setPaperLanguage(event.target.value);
	}, [setPaperLanguage]);

	const handleBookmarkedOnlyChange = useCallback((event) => {
		setShowBookmarkedExamsOnly(event.target.checked);
	}, []);

	const handleToggleExamBrowser = useCallback(() => {
		setShowExamBrowser((prev) => !prev);
	}, []);

	const handleExamSearchChange = useCallback((event) => {
		setExamSearchQuery(event.target.value);
	}, []);

	const handleExamGroupFilterChange = useCallback((event) => {
		setExamGroupFilter(event.target.value);
	}, []);

	const handleClearExamFilters = useCallback(() => {
		setExamSearchQuery('');
		setExamGroupFilter('all');
	}, []);

	const handleSelectedExamChange = useCallback((event) => {
		setSelectedExamId(event.target.value);
	}, []);

	const handleSelectExamFromList = useCallback((examId) => {
		setSelectedExamId(examId);
	}, []);

	const handleTopicChange = useCallback((event) => {
		setTopic(event.target.value);
	}, []);

	const handleToggleAdvanced = useCallback(() => {
		setShowAdvanced((prev) => !prev);
	}, []);

	const handleNumQuestionsChange = useCallback((event) => {
		setNumQuestions(Number(event.target.value));
	}, []);

	const handleDifficultyChange = useCallback((event) => {
		setDifficulty(event.target.value);
	}, []);

	const handleTestTypeChange = useCallback((event) => {
		setTestType(event.target.value);
	}, []);

	const handleClearCategory = useCallback(() => {
		setSelectedCategory('');
		setSelectedTopics([]);
	}, []);

	const handleCategoryToggle = useCallback((category) => {
		setSelectedCategory((prevCategory) =>
			prevCategory === category ? '' : category,
		);
	}, []);

	const handleTopicToggle = useCallback((topicItem) => {
		setSelectedTopics((prevTopics) =>
			prevTopics.includes(topicItem)
				? prevTopics.filter((item) => item !== topicItem)
				: [...prevTopics, topicItem],
		);
	}, []);

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
				<p className='text-muted fs-5'>{heroSubtitle}</p>
			</div>

			{!activeMode && (
				<TestIdEntryCard
					t={t}
					testId={testId}
					error={error}
					onTestIdChange={handleTestIdChange}
					onSubmit={handleTestIdSubmit}
				/>
			)}

			{!activeMode && (
				<BookmarkedQuickStartCard
					t={t}
					loading={loading}
					bookmarkedExams={bookmarkedExams}
					bookmarkedQuizPresets={bookmarkedQuizPresets}
					onQuickStartExam={handleQuickStartExam}
					onQuickStartPreset={handleQuickStartPreset}
				/>
			)}

			{!activeMode && !showModeSelection && (
				<NewTestEntryCard
					t={t}
					onStartNewTest={handleStartNewTest}
				/>
			)}

			{!activeMode && showModeSelection && (
				<ModeSelectionCard
					t={t}
					onSelectMode={handleModeSelect}
					fullExamValue={TEST_MODES.FULL_EXAM}
					quizPracticeValue={TEST_MODES.QUIZ_PRACTICE}
				/>
			)}

			{activeMode && (
				<ActiveModeCard
					t={t}
					currentModeLabel={currentModeLabel}
					onBackToModeSelection={handleBackToModeSelection}
				/>
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
									onChange={handlePaperLanguageChange}
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
									<FullExamConfigurationSection
										t={t}
										examGroupFilters={EXAM_GROUP_FILTERS}
										showBookmarkedExamsOnly={showBookmarkedExamsOnly}
										onBookmarkedOnlyChange={handleBookmarkedOnlyChange}
										showExamBrowser={showExamBrowser}
										onToggleExamBrowser={handleToggleExamBrowser}
										examSearchQuery={examSearchQuery}
										onExamSearchQueryChange={handleExamSearchChange}
										examGroupFilter={examGroupFilter}
										onExamGroupFilterChange={handleExamGroupFilterChange}
										onClearExamFilters={handleClearExamFilters}
										visibleExams={visibleExams}
										selectedExamId={selectedExamId}
										onSelectedExamChange={handleSelectedExamChange}
										onSelectExamFromList={handleSelectExamFromList}
										isExamBookmarked={isExamBookmarked}
										onToggleExamBookmark={toggleExamBookmark}
										selectedExam={selectedExam}
										topic={topic}
										onTopicChange={handleTopicChange}
										selectedSyllabusFocus={selectedSyllabusFocus}
										onToggleSyllabusFocus={toggleSyllabusFocus}
									/>
								)}

								{activeMode === TEST_MODES.QUIZ_PRACTICE && (
									<QuizPracticeConfigurationSection
										t={t}
										topic={topic}
										onTopicChange={handleTopicChange}
										showAdvanced={showAdvanced}
										onToggleAdvanced={handleToggleAdvanced}
										onBookmarkCurrentPreset={saveCurrentQuizPreset}
										numQuestions={numQuestions}
										onNumQuestionsChange={handleNumQuestionsChange}
										difficulty={difficulty}
										onDifficultyChange={handleDifficultyChange}
										difficultyOptions={difficultyOptions}
										testType={testType}
										onTestTypeChange={handleTestTypeChange}
										formatOptions={formatOptions}
										selectedCategory={selectedCategory}
										onClearCategory={handleClearCategory}
										onCategoryToggle={handleCategoryToggle}
										onTopicToggle={handleTopicToggle}
										selectedTopics={selectedTopics}
										topicCategories={TOPIC_CATEGORIES}
									/>
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
														<LoadingElapsed isLoading={loading} />
													</span>
												</>
											) : (
											activeMode === TEST_MODES.FULL_EXAM
												? t('generateExamPaper')
												: t('generateQuiz')
										)}
									</div>
								</Button>
							</Form>
					</Card.Body>
					</Card>
				)}

				<Modal
					show={showAuthRequiredModal}
					onHide={handleGenerationAuthModalHide}
					centered
				>
					<Modal.Header closeButton>
						<Modal.Title>{t('signInRequiredCreateTitle')}</Modal.Title>
					</Modal.Header>
					<Modal.Body>
						<p className='text-muted mb-3'>{t('signInRequiredCreateBody')}</p>
						<div className='d-flex justify-content-center'>
							<GoogleSignInButton
								onCredential={handleGenerationAuthCredential}
								disabled={loading}
							/>
						</div>
						{authPromptError && (
							<Alert variant='danger' className='mt-3 mb-0'>
								{authPromptError}
							</Alert>
						)}
					</Modal.Body>
				</Modal>

				<ProTipCard
					t={t}
					activeMode={activeMode}
					fullExamValue={TEST_MODES.FULL_EXAM}
				/>
			</Container>
		);
	};

export default GenerateTestForm;
