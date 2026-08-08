<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { localizedApiError, t } from '$lib/client/i18n';
	import { isDataSaverActive, language } from '$lib/client/preferences';
	import { track } from '$lib/client/telemetry';
	import {
		getBookmarkedExamIds,
		getBookmarkedQuizPresets,
		getHistory,
		getUnsubmittedTest,
		saveBookmarkedExamIds,
		saveCurrentPaper,
	} from '$lib/client/storage';
	import {
		STORAGE_KEYS,
	} from '$lib/client/constants';
	import { OBJECTIVE_ONLY_EXAMS, getIndianExamById } from '$lib/data/indianExams';
	import SmartIntentInput from '$lib/client/SmartIntentInput.svelte';
	import PreviewCard from '$lib/client/PreviewCard.svelte';
	import WelcomeBlock from '$lib/client/WelcomeBlock.svelte';
	import QuickStart from '$lib/client/QuickStart.svelte';
	import TopicBrowser from '$lib/client/TopicBrowser.svelte';
	import ExamBrowser from '$lib/client/ExamBrowser.svelte';
	import ProfileWizard from '$lib/client/ProfileWizard.svelte';
	import { user } from '$lib/client/auth';
	import {
		fetchProfile,
		fetchProfileInsights,
		profile as profileStore,
		profileInsights,
	} from '$lib/client/profile';

	const MAX_RETRIES = 3;
	const GENERATION_TIMEOUT_MS = 180000;
	const HERO_SCROLL_THRESHOLD = 100;
	const PROFILE_WIZARD_DISMISS_KEY = 'selftest_profile_wizard_dismissed_at';
	const PROFILE_WIZARD_REPROMPT_DAYS = 7;
	let intentValue = $state('');
	let topic = $state('');
	let numQuestions = $state(10);
	let paperLanguage = $state('english');
	let difficulty = $state('intermediate');
	let testType = $state('multiple-choice');
	let isFullExam = $state(false);
	let examId = $state('');
	let selectedCategory = $state('');
	let selectedTopics = $state([]);
	let selectedSyllabusFocus = $state([]);

	let examSearchQuery = $state('');
	let examGroupFilter = $state('all');
	let showBookmarkedExamsOnly = $state(false);
	let bookmarkedExamIds = $state([]);
	let bookmarkedQuizPresets = $state([]);

	let intentStatus = $state('idle');
	let parsedFromIntent = $state(false);
	let intentParseFailed = $state(false);

	let status = $state('idle');
	let error = $state('');
	let retryLabel = $state('');
	let isOffline = $state(false);
	let unsubmittedTest = $state(null);
	let difficultyTouched = $state(false);
	let showProfileWizard = $state(false);
	let profileLoaded = $state(false);

	let heroCollapsed = $state(false);
	let isAndroidDevice = $state(false);
	let isInCapacitorApp = $state(false);

	const currentProfile = $derived($profileStore);
	const insights = $derived($profileInsights);
	const tailoredSummary = $derived(
		$user && insights?.tailoredSummary ? insights.tailoredSummary : null,
	);
	const profileReadyForWizard = $derived(
		$user &&
			(currentProfile === null || !currentProfile.setupComplete) &&
			(currentProfile === null || currentProfile.preferences?.personalized !== false),
	);

	let selectedExam = $derived(getIndianExamById(examId));
	let bookmarkedExams = $derived(
		OBJECTIVE_ONLY_EXAMS.filter((exam) => bookmarkedExamIds.includes(exam.id)),
	);
	let visibleExams = $derived.by(() => {
		const query = examSearchQuery.trim().toLowerCase();
		const baseExams = showBookmarkedExamsOnly ? bookmarkedExams : OBJECTIVE_ONLY_EXAMS;
		return baseExams.filter((exam) => {
			const groups = String(exam.group || '')
				.split('/')
				.map((item) => item.trim());
			const matchesGroup = examGroupFilter === 'all' || groups.includes(examGroupFilter);
			if (!matchesGroup) return false;
			if (!query) return true;
			return [exam.name, exam.stream, exam.group, ...(exam.syllabus || [])]
				.join(' ')
				.toLowerCase()
				.includes(query);
		});
	});
	let canGenerate = $derived(topic.trim().length > 0 || selectedTopics.length > 0 || examId !== '');

	onMount(() => {
		const ua = window.navigator.userAgent || '';
		isAndroidDevice = /android/i.test(ua);
		isInCapacitorApp = Boolean(window.Capacitor?.isNativePlatform?.());
		bookmarkedExamIds = getBookmarkedExamIds();
		bookmarkedQuizPresets = getBookmarkedQuizPresets();
		unsubmittedTest = getUnsubmittedTest();
		const savedPaperLanguage = window.localStorage.getItem(STORAGE_KEYS.PAPER_LANGUAGE);
		paperLanguage = ['english', 'hindi'].includes(savedPaperLanguage)
			? savedPaperLanguage
			: $language;
		const params = new URL(window.location.href).searchParams;
		const examParam = params.get('exam');
		if (examParam && getIndianExamById(examParam)) {
			isFullExam = true;
			examId = examParam;
			const exam = getIndianExamById(examParam);
			if (exam) {
				topic = `${exam.name} objective exam paper`;
				numQuestions = Number(exam.defaultNumQuestions || 20);
				difficulty = exam.defaultDifficulty || 'intermediate';
			}
		}
		if (params.get('mode') === 'quiz-practice') {
			isFullExam = false;
			topic = params.get('topic') || topic;
			difficulty = params.get('difficulty') || difficulty;
			testType = params.get('testType') || testType;
			numQuestions = Number(params.get('numQuestions')) || numQuestions;
			paperLanguage = params.get('paperLanguage') || paperLanguage;
		}
		const updateNetwork = () => {
			isOffline = !navigator.onLine;
		};
		updateNetwork();
		window.addEventListener('online', updateNetwork);
		window.addEventListener('offline', updateNetwork);

		if (new URL(window.location.href).searchParams.get('focus') === 'search') {
			window.history.replaceState(null, '', window.location.pathname);
			window.setTimeout(() => {
				const input = document.querySelector('.intent-input');
				if (input) input.focus();
			}, 50);
		}

		const applyProfilePrefill = (insightsData) => {
			if (
				!insightsData?.suggestedDifficulty ||
				difficultyTouched ||
				isFullExam
			) {
				return;
			}
			difficulty = insightsData.suggestedDifficulty;
		};

		const loadProfileState = async () => {
			const profileData = await fetchProfile();
			const insightsData = await fetchProfileInsights();
			applyProfilePrefill(insightsData);
			const needsSetup =
				!profileData || !profileData.setupComplete;
			if (needsSetup && (!profileData || profileData.preferences?.personalized !== false)) {
				const dismissedAtRaw = window.localStorage.getItem(PROFILE_WIZARD_DISMISS_KEY);
				const dismissedAt = Number(dismissedAtRaw || 0);
				const stale =
					!Number.isFinite(dismissedAt) ||
					Date.now() - dismissedAt > PROFILE_WIZARD_REPROMPT_DAYS * 24 * 60 * 60 * 1000;
				if (stale) {
					showProfileWizard = true;
				}
			}
		};
		if ($user) {
			void loadProfileState();
		}
		const unsubscribeUser = user.subscribe((currentUser) => {
			if (currentUser && !profileLoaded) {
				profileLoaded = true;
				void loadProfileState();
			}
			if (!currentUser) {
				profileLoaded = false;
			}
		});

		return () => {
			unsubscribeUser();
			window.removeEventListener('online', updateNetwork);
			window.removeEventListener('offline', updateNetwork);
		};
	});

	$effect(() => {
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(STORAGE_KEYS.PAPER_LANGUAGE, paperLanguage);
		}
	});

	$effect(() => {
		if ($isDataSaverActive && !isFullExam && numQuestions > 5) {
			numQuestions = 5;
		}
	});

	$effect(() => {
		if (status === 'loading' || topic.trim().length > 0 || selectedTopics.length > 0 || examId !== '' || error) {
			heroCollapsed = true;
			return;
		}
		if (typeof window !== 'undefined' && window.scrollY <= HERO_SCROLL_THRESHOLD) {
			heroCollapsed = false;
		}
	});

	$effect(() => {
		if (typeof window === 'undefined' || typeof document === 'undefined') return;
		const handleHeroScroll = () => {
			if (window.scrollY > HERO_SCROLL_THRESHOLD) {
				heroCollapsed = true;
				return;
			}
			if (status !== 'loading' && topic.trim().length === 0 && selectedTopics.length === 0 && examId === '' && !error) {
				heroCollapsed = false;
			}
		};
		const handleHeroInteraction = (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			if (
				target.closest('.home-wrap') &&
				!target.closest('.intent-wrap') &&
				!target.closest('.hero-block')
			) {
				heroCollapsed = true;
			}
		};
		window.addEventListener('scroll', handleHeroScroll, { passive: true });
		window.addEventListener('focusin', handleHeroInteraction);
		window.addEventListener('pointerdown', handleHeroInteraction);
		return () => {
			window.removeEventListener('scroll', handleHeroScroll);
			window.removeEventListener('focusin', handleHeroInteraction);
			window.removeEventListener('pointerdown', handleHeroInteraction);
		};
	});

	async function parseIntent(intentText) {
		if (!intentText || isOffline) return;
		intentStatus = 'parsing';
		intentParseFailed = false;
		track('intent:parse', { intent: intentText.slice(0, 64) });
		try {
			const response = await fetch('/api/parse-intent', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ intent: intentText }),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(data.error || 'Failed to parse intent');
			}
			topic = data.topic || intentText;
			testType = data.testType || 'multiple-choice';
			difficulty = data.difficulty || 'intermediate';
			numQuestions = data.numQuestions || 10;
			paperLanguage = data.language || 'english';
			isFullExam = data.isFullExam || false;
			examId = data.examId || '';
			parsedFromIntent = true;
			intentStatus = 'done';
			track('intent:parsed', { confidence: data.confidence, isFullExam: data.isFullExam });
		} catch (err) {
			console.error('Intent parsing error:', err);
			intentStatus = 'idle';
			intentParseFailed = true;
			topic = intentText;
			parsedFromIntent = false;
			track('intent:parse-failed');
		}
	}

	function handleChipEdit(field, value) {
		track('preview:edit-chip', { field });
		if (field === 'difficulty') {
			difficulty = value;
			difficultyTouched = true;
		}
		if (field === 'testType') testType = value;
		if (field === 'numQuestions') numQuestions = value;
		if (field === 'language') paperLanguage = value;
		if (field === 'examId') {
			examId = value;
			isFullExam = true;
			difficultyTouched = true;
			const exam = getIndianExamById(value);
			if (exam) {
				topic = `${exam.name} objective exam paper`;
				numQuestions = Number(exam.defaultNumQuestions || 20);
				difficulty = exam.defaultDifficulty || 'intermediate';
			}
		}
		if (field === 'selectedCategory') selectedCategory = value;
		if (field === 'selectedTopics') {
			selectedTopics = value;
			if (value.length > 0) {
				topic = value.join(', ');
			}
		}
		if (field === 'examSearchQuery') examSearchQuery = value;
		if (field === 'examGroupFilter') examGroupFilter = value;
		if (field === 'showBookmarkedExamsOnly') showBookmarkedExamsOnly = value;
	}

	function handleTopicBrowserChange(field, value) {
		handleChipEdit(field, value);
	}

	function handleExamBrowserChange(field, value) {
		handleChipEdit(field, value);
	}

	function toggleExamBookmark(examIdToToggle) {
		const isAdding = !bookmarkedExamIds.includes(examIdToToggle);
		bookmarkedExamIds = isAdding
			? [examIdToToggle, ...bookmarkedExamIds].slice(0, 20)
			: bookmarkedExamIds.filter((id) => id !== examIdToToggle);
		saveBookmarkedExamIds(bookmarkedExamIds);
		track(isAdding ? 'bookmark:add-exam' : 'bookmark:remove-exam', { examId: examIdToToggle });
	}

	function handleWelcomeDismiss() {
		track('welcome:dismiss');
	}

	function handleShowExample() {
		const example = 'Class 12 chemistry organic reactions for NEET';
		intentValue = example;
		void parseIntent(example);
	}

	function getExamRequestParams(exam, syllabusFocus = selectedSyllabusFocus, customTopic = topic) {
		const focus = syllabusFocus.length > 0 ? syllabusFocus : exam.syllabus || [];
		return {
			testMode: 'full-exam',
			topic: customTopic.trim() || `${exam.name} objective exam paper`,
			category: exam.stream || '',
			selectedTopics: focus,
			examId: exam.id,
			examName: exam.name,
			examStream: exam.stream,
			syllabusFocus: focus,
			testType: 'multiple-choice',
			numQuestions: $isDataSaverActive
				? Math.min(Number(exam.defaultNumQuestions || 20), 10)
				: Number(exam.defaultNumQuestions || 20),
			difficulty: exam.defaultDifficulty || 'intermediate',
			language: paperLanguage,
			objectiveOnly: true,
			durationMinutes: exam.durationMinutes || null,
		};
	}

	function getQuizRequestParams() {
		return {
			testMode: 'quiz-practice',
			topic: topic.trim(),
			category: selectedCategory,
			selectedTopics: selectedTopics,
			examId: null,
			examName: null,
			examStream: null,
			syllabusFocus: [],
			testType: testType === 'mixed' ? 'multiple-choice' : testType,
			numQuestions: Number(numQuestions),
			difficulty: difficulty,
			difficultyExplicit: difficultyTouched,
			language: paperLanguage,
			objectiveOnly: false,
			durationMinutes: null,
		};
	}

	async function postGenerate(requestParams) {
		const controller = new AbortController();
		const timeoutId = window.setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
		try {
			const historyEntries = getHistory().slice(0, 10);
			const isStoredTest = (entry) => {
				const id = Number(entry.id);
				return Number.isInteger(id) && id > 0;
			};
			const response = await fetch('/api/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...requestParams,
					previousTestIds: historyEntries.filter(isStoredTest).map((entry) => Number(entry.id)),
					attemptedTestIds: historyEntries
						.filter((entry) => entry.userAnswers)
						.filter(isStoredTest)
						.map((entry) => Number(entry.id)),
				}),
				signal: controller.signal,
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(localizedApiError(data, $t, response.status));
			}
			return data;
		} catch (caughtError) {
			if (caughtError.name === 'AbortError') {
				throw new Error($t('generationTimedOutRetry'), { cause: caughtError });
			}
			throw caughtError;
		} finally {
			window.clearTimeout(timeoutId);
		}
	}

	async function runGeneration(requestParams) {
		if (isOffline) {
			error = $t('offlineAccessHistory');
			return;
		}
		status = 'loading';
		error = '';
		retryLabel = '';

		track('generate:start', {
			mode: requestParams.testMode || (isFullExam ? 'full-exam' : 'quiz-practice'),
			difficulty: requestParams.difficulty || difficulty,
			language: requestParams.language || paperLanguage,
			testType: requestParams.testType || testType,
		});

		for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
			try {
				if (attempt > 1) {
					retryLabel = `${$t('retrying')} ${attempt}/${MAX_RETRIES}`;
				}
				const data = await postGenerate(requestParams);
				track('generate:success', { mode: requestParams.testMode || (isFullExam ? 'full-exam' : 'quiz-practice') });
				saveCurrentPaper(data);
				await goto(`/test?id=${data.id}`);
				return;
			} catch (caughtError) {
				if (attempt === MAX_RETRIES) {
					track('generate:fail', { attempt });
					error = caughtError.message || $t('errorFailedGenerateAfterAttempts');
				} else {
					await new Promise((resolve) => window.setTimeout(resolve, 600 * attempt));
				}
			}
		}
		status = 'idle';
		retryLabel = '';
	}

	async function handleGenerate() {
		if (!canGenerate) {
			error = isFullExam ? $t('errorSelectObjectiveExam') : $t('errorProvideTopic');
			return;
		}
		const params = isFullExam && selectedExam
			? getExamRequestParams(selectedExam)
			: getQuizRequestParams();
		await runGeneration(params);
	}

	async function handleIntentSubmit(intentText) {
		await parseIntent(intentText);
	}

	function handleWizardClose() {
		showProfileWizard = false;
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(PROFILE_WIZARD_DISMISS_KEY, String(Date.now()));
		}
	}

	async function handleWizardFinish() {
		showProfileWizard = false;
		await fetchProfileInsights();
	}

	function handleTestNavigate(testId) {
		void goto(`/test?id=${testId}`);
	}

	async function quickStartExam(examQuickId) {
		const exam = getIndianExamById(examQuickId);
		if (!exam) return;
		track('generate:quick-start-exam', { examId: examQuickId });
		await runGeneration(getExamRequestParams(exam, exam.syllabus || [], ''));
	}

	async function quickStartPreset(preset) {
		track('generate:quick-start-preset', { presetId: preset.id });
		const quizParams = {
			testMode: 'quiz-practice',
			topic: preset.topicSeed || preset.label,
			category: preset.category || '',
			selectedTopics: preset.selectedTopics || [],
			examId: null,
			examName: null,
			examStream: null,
			syllabusFocus: [],
			testType: preset.testType === 'mixed' ? 'multiple-choice' : preset.testType,
			numQuestions: Number(preset.numQuestions || 10),
			difficulty: preset.difficulty || 'intermediate',
			language: preset.language || 'english',
			objectiveOnly: false,
			durationMinutes: null,
		};
		await runGeneration(quizParams);
	}

</script>

<svelte:head>
	<title>AI Quiz & Exam Paper Generator for India | selftest.in</title>
</svelte:head>

<section class="container py-4 py-md-5" style="padding-top: calc(1.5rem + env(safe-area-inset-top, 0px)); padding-left: calc(1rem + env(safe-area-inset-left, 0px)); padding-right: calc(1rem + env(safe-area-inset-right, 0px));">
	<div class="mx-auto home-wrap">
		<div class="text-center mb-4 hero-block" class:hero-collapsed={heroCollapsed} aria-hidden={heroCollapsed}>
			<p class="hero-tagline">{$t('aiPracticeForIndianExams')}</p>
			<h1 class="hero-heading">{$t('createQuiz')}</h1>
		</div>

		<div class="intent-section mb-4">
			<SmartIntentInput
				bind:value={intentValue}
				onsubmit={handleIntentSubmit}
				onnavigate={handleTestNavigate}
				oninput={() => {}}
				disabled={status === 'loading'}
				status={intentStatus}
			/>
		</div>

		{#if unsubmittedTest?.id}
			<div class="alert alert-warning d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3">
				<div>
					<div class="fw-bold">{$t('unsubmittedTest')}</div>
					<div class="small">
						{$t('unsubmittedTestMessagePrefix')} "{unsubmittedTest.topic || $t('testPrefix')}" {$t('unsubmittedTestMessageSuffix')}
					</div>
				</div>
				<a class="btn btn-warning btn-sm fw-bold" href={`/test?id=${unsubmittedTest.id}`}>
					{$t('continueTest')}
				</a>
			</div>
		{/if}

		<WelcomeBlock
			onDismiss={handleWelcomeDismiss}
			onShowExample={handleShowExample}
		/>

		<QuickStart
			{bookmarkedExams}
			{bookmarkedQuizPresets}
			onQuickStartExam={quickStartExam}
			onQuickStartPreset={quickStartPreset}
			disabled={status === 'loading'}
		/>

		<PreviewCard
			{topic}
			{numQuestions}
			testType={testType}
			{difficulty}
			language={paperLanguage}
			{examId}
			{isFullExam}
			parsed={parsedFromIntent}
			parsingFailed={intentParseFailed}
			ongenerate={handleGenerate}
			oneditchip={handleChipEdit}
			disabled={status === 'loading'}
			{status}
		/>

		{#if tailoredSummary}
			<div class="tailored-chip">
				<span class="tailored-badge" aria-hidden="true">🎯</span>
				<span class="small">
					<strong>{$t('profileChipLabel')}:</strong> {tailoredSummary}
				</span>
				<a class="tailored-edit" href="/profile">{$t('profileChipEdit')}</a>
			</div>
		{/if}

		<div class="manual-section">
			<p class="manual-divider"><span>{$t('manualConfigHint')}</span></p>
			<div class="manual-grid">
				<TopicBrowser
					{selectedCategory}
					{selectedTopics}
					ontopicchange={handleTopicBrowserChange}
				/>
				<ExamBrowser
					examSearchQuery={examSearchQuery}
					examGroupFilter={examGroupFilter}
					showBookmarkedExamsOnly={showBookmarkedExamsOnly}
					bookmarkedExamIds={bookmarkedExamIds}
					selectedExamId={examId}
					onexamchange={handleExamBrowserChange}
					onbookmarktoggle={toggleExamBookmark}
					visibleExams={visibleExams}
				/>
			</div>
		</div>

		{#if isOffline}
			<div class="alert alert-warning mt-3 mb-0">{$t('offlineAccessHistory')}</div>
		{/if}
		{#if retryLabel}
			<div class="alert alert-light border mt-3 mb-0">{retryLabel}</div>
		{/if}
		{#if error}
			<div class="alert alert-danger mt-3 mb-0">{error}</div>
		{/if}
	</div>
</section>

{#if isAndroidDevice && !isInCapacitorApp}
	<section class="container pb-4">
		<div class="mx-auto home-wrap">
			<div class="bg-body border rounded-3 p-3 p-md-4 text-center">
				<h2 class="h6 fw-bold mb-1">{$t('androidAppTitle')}</h2>
				<p class="text-muted small mb-3">{$t('androidAppBody')}</p>
				<a
					class="btn btn-primary"
					href="/apk/selftest.apk"
					download="selftest.apk"
					onclick={() => track('apk:download')}
				>
					{$t('androidAppDownload')}
				</a>
				<p class="text-muted small mt-3 mb-0">
					{$t('androidAppInstallHint')} <span class="fw-semibold">{$t('androidAppAllowUnknownSources')}</span>
				</p>
			</div>
		</div>
	</section>
{/if}

{#if showProfileWizard && profileReadyForWizard}
	<ProfileWizard
		initial={currentProfile}
		onclose={handleWizardClose}
		onafterfinish={handleWizardFinish}
	/>
{/if}

<style>
	.home-wrap {
		max-width: 720px;
	}

	.hero-block {
		max-height: 160px;
		overflow: hidden;
		opacity: 1;
		transition: max-height 0.35s ease, opacity 0.25s ease, margin-bottom 0.35s ease;
	}

	.hero-block.hero-collapsed {
		max-height: 0;
		margin-bottom: 0;
		opacity: 0;
		pointer-events: none;
	}

	.hero-tagline {
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-muted);
		font-weight: 600;
		margin: 0 0 8px;
	}

	.hero-heading {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text);
		margin: 0;
	}

	.intent-section {
		margin-bottom: 20px;
	}

	.manual-section {
		margin-top: 16px;
	}

	.manual-divider {
		text-align: center;
		font-size: 0.78rem;
		color: var(--text-muted);
		margin: 0 0 4px;
		position: relative;
	}

	.manual-divider span {
		background: var(--bg-body, #f8fafc);
		padding: 0 12px;
		position: relative;
		z-index: 1;
	}

	.manual-divider::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		height: 1px;
		background: var(--line);
	}

	.manual-grid {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.tailored-chip {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
		padding: 10px 12px;
		border: 1px solid color-mix(in srgb, var(--color-brand-600) 30%, transparent);
		border-radius: 12px;
		background: color-mix(in srgb, var(--color-brand-600) 8%, transparent);
		color: var(--text);
	}

	.tailored-badge {
		flex: 0 0 auto;
	}

	.tailored-chip .small {
		flex: 1;
		min-width: 0;
	}

	.tailored-edit {
		flex: 0 0 auto;
		padding: 8px 0 8px 8px;
		color: var(--color-brand-600);
		font-size: 0.8rem;
		font-weight: 700;
		text-decoration: none;
	}

	@media (max-width: 480px) {
		.hero-heading {
			font-size: 1.25rem;
		}
	}
</style>
