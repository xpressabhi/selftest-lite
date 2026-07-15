<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t } from '$lib/client/i18n';
	import { isDataSaverActive, language } from '$lib/client/preferences';
	import {
		getBookmarkedExamIds,
		getBookmarkedQuizPresets,
		getHistory,
		getUnsubmittedTest,
		saveBookmarkedExamIds,
		saveBookmarkedQuizPresets,
		saveCurrentPaper,
	} from '$lib/client/storage';
	import { STORAGE_KEYS } from '$lib/client/constants';
	import { TOPIC_CATEGORIES } from '$lib/shared/constants';
	import { OBJECTIVE_ONLY_EXAMS, getIndianExamById } from '$lib/data/indianExams';

	const TEST_MODES = {
		FULL_EXAM: 'full-exam',
		QUIZ_PRACTICE: 'quiz-practice',
	};
	const EXAM_GROUP_FILTERS = ['all', 'A', 'B', 'C', 'D'];
	const MAX_RETRIES = 3;
	const GENERATION_TIMEOUT_MS = 180000;

	let activeMode = $state(TEST_MODES.QUIZ_PRACTICE);
	let testId = $state('');
	let topic = $state('');
	let numQuestions = $state(10);
	let paperLanguage = $state('english');
	let difficulty = $state('intermediate');
	let testType = $state('multiple-choice');
	let selectedCategory = $state('');
	let selectedTopics = $state([]);
	let selectedExamId = $state('');
	let selectedSyllabusFocus = $state([]);
	let examSearchQuery = $state('');
	let examGroupFilter = $state('all');
	let showBookmarkedExamsOnly = $state(false);
	let bookmarkedExamIds = $state([]);
	let bookmarkedQuizPresets = $state([]);
	let status = $state('idle');
	let error = $state('');
	let retryLabel = $state('');
	let isOffline = $state(false);
	let unsubmittedTest = $state(null);

	let selectedExam = $derived(getIndianExamById(selectedExamId));
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
			if (!matchesGroup) {
				return false;
			}
			if (!query) {
				return true;
			}
			return [exam.name, exam.stream, exam.group, ...(exam.syllabus || [])]
				.join(' ')
				.toLowerCase()
				.includes(query);
		});
	});
	let canGenerate = $derived(
		activeMode === TEST_MODES.FULL_EXAM
			? Boolean(selectedExamId)
			: topic.trim().length > 0 || selectedTopics.length > 0,
	);

	onMount(() => {
		bookmarkedExamIds = getBookmarkedExamIds();
		bookmarkedQuizPresets = getBookmarkedQuizPresets();
		unsubmittedTest = getUnsubmittedTest();
		const savedPaperLanguage = window.localStorage.getItem(STORAGE_KEYS.PAPER_LANGUAGE);
		paperLanguage = ['english', 'hindi'].includes(savedPaperLanguage)
			? savedPaperLanguage
			: $language;
		const examParam = new URL(window.location.href).searchParams.get('exam');
		const params = new URL(window.location.href).searchParams;
		if (examParam && getIndianExamById(examParam)) {
			activeMode = TEST_MODES.FULL_EXAM;
			selectedExamId = examParam;
		}
		if (params.get('mode') === TEST_MODES.QUIZ_PRACTICE) {
			activeMode = TEST_MODES.QUIZ_PRACTICE;
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
		return () => {
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
		if ($isDataSaverActive && activeMode === TEST_MODES.QUIZ_PRACTICE && numQuestions > 5) {
			numQuestions = 5;
		}
	});

	function normalizeQuizTestType(value) {
		return value === 'mixed' ? 'multiple-choice' : value;
	}

	function toggleExamBookmark(examId) {
		bookmarkedExamIds = bookmarkedExamIds.includes(examId)
			? bookmarkedExamIds.filter((id) => id !== examId)
			: [examId, ...bookmarkedExamIds].slice(0, 20);
		saveBookmarkedExamIds(bookmarkedExamIds);
	}

	function toggleSelectedTopic(topicName) {
		selectedTopics = selectedTopics.includes(topicName)
			? selectedTopics.filter((item) => item !== topicName)
			: [...selectedTopics, topicName];
	}

	function toggleSyllabusFocus(topicName) {
		selectedSyllabusFocus = selectedSyllabusFocus.includes(topicName)
			? selectedSyllabusFocus.filter((item) => item !== topicName)
			: [...selectedSyllabusFocus, topicName];
	}

	function saveCurrentQuizPreset() {
		const topicSeed = topic.trim();
		const normalizedTopics = [...selectedTopics].sort();
		if (!topicSeed && normalizedTopics.length === 0) {
			error = $t('errorAddTopicBeforeBookmark');
			return;
		}
		const key = [
			testType,
			numQuestions,
			difficulty,
			paperLanguage,
			selectedCategory,
			normalizedTopics.join('|'),
			topicSeed,
		].join('::');
		if (bookmarkedQuizPresets.some((preset) => preset.key === key)) {
			error = $t('errorPresetAlreadyBookmarked');
			return;
		}
		const preset = {
			id: `preset-${Date.now()}`,
			key,
			label: `${topicSeed || normalizedTopics[0]} • ${difficulty} • ${numQuestions}Q`,
			testType,
			numQuestions,
			difficulty,
			language: paperLanguage,
			category: selectedCategory,
			selectedTopics: normalizedTopics,
			topicSeed,
		};
		bookmarkedQuizPresets = [preset, ...bookmarkedQuizPresets].slice(0, 20);
		saveBookmarkedQuizPresets(bookmarkedQuizPresets);
		error = '';
	}

	function getExamRequestParams(exam, syllabusFocus = selectedSyllabusFocus, customTopic = topic) {
		const focus = syllabusFocus.length > 0 ? syllabusFocus : exam.syllabus || [];
		return {
			testMode: TEST_MODES.FULL_EXAM,
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

	function getQuizRequestParams(preset = null) {
		const presetTopics = Array.isArray(preset?.selectedTopics) ? preset.selectedTopics : selectedTopics;
		return {
			testMode: TEST_MODES.QUIZ_PRACTICE,
			topic: preset?.topicSeed || topic.trim(),
			category: preset?.category || selectedCategory,
			selectedTopics: presetTopics,
			examId: null,
			examName: null,
			examStream: null,
			syllabusFocus: [],
			testType: normalizeQuizTestType(preset?.testType || testType),
			numQuestions: Number(preset?.numQuestions || numQuestions),
			difficulty: preset?.difficulty || difficulty,
			language: preset?.language || paperLanguage,
			objectiveOnly: false,
			durationMinutes: null,
		};
	}

	async function postGenerate(requestParams, attempt) {
		const controller = new AbortController();
		const timeoutId = window.setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
		try {
			const response = await fetch('/api/generate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					...requestParams,
					previousTests: getHistory().slice(0, 10),
				}),
				signal: controller.signal,
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(data?.error || $t('failedToGenerateQuiz'));
			}
			return data;
		} catch (caughtError) {
			if (caughtError.name === 'AbortError') {
				throw new Error($t('generationTimedOutRetry'), { cause: caughtError });
			}
			if (attempt >= MAX_RETRIES) {
				throw caughtError;
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

		for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
			try {
				if (attempt > 1) {
					retryLabel = `${$t('retrying')} ${attempt}/${MAX_RETRIES}`;
				}
				const data = await postGenerate(requestParams, attempt);
				saveCurrentPaper(data);
				await goto(`/test?id=${data.id}`);
				return;
			} catch (caughtError) {
				if (attempt === MAX_RETRIES) {
					error = caughtError.message || $t('errorFailedGenerateAfterAttempts');
				} else {
					await new Promise((resolve) => window.setTimeout(resolve, 600 * attempt));
				}
			}
		}

		status = 'idle';
		retryLabel = '';
	}

	async function submitGenerate(event) {
		event?.preventDefault();
		if (!canGenerate) {
			error =
				activeMode === TEST_MODES.FULL_EXAM ? $t('errorSelectObjectiveExam') : $t('errorProvideTopic');
			return;
		}
		const params =
			activeMode === TEST_MODES.FULL_EXAM && selectedExam
				? getExamRequestParams(selectedExam)
				: getQuizRequestParams();
		await runGeneration(params);
	}

	async function quickStartExam(examId) {
		const exam = getIndianExamById(examId);
		if (exam) {
			await runGeneration(getExamRequestParams(exam, exam.syllabus || [], ''));
		}
	}

	async function quickStartPreset(preset) {
		await runGeneration(getQuizRequestParams(preset));
	}

	function goToTestId(event) {
		event.preventDefault();
		const normalized = testId.trim();
		if (normalized) {
			goto(`/test?id=${encodeURIComponent(normalized)}`);
		}
	}
</script>

<svelte:head>
	<title>AI Quiz & Exam Paper Generator for India | selftest.in</title>
</svelte:head>

<section class="container py-4 py-md-5">
	<div class="mx-auto home-wrap">
		<div class="text-center mb-4">
			<p class="text-uppercase text-muted small fw-semibold mb-2">AI practice for Indian exams</p>
			<h1 class="h2 fw-bold mb-2">{$t('createQuiz')}</h1>
			<p class="text-muted mb-0">
				{activeMode === TEST_MODES.FULL_EXAM ? $t('configureAndGenerate') : $t('useBookmarksOrChooseMode')}
			</p>
		</div>

		<form class="resume-form bg-body border rounded-3 p-3 mb-3" onsubmit={goToTestId}>
			<label class="form-label fw-semibold" for="test-id">{$t('haveTestIdTitle')}</label>
			<div class="input-group">
				<input
					id="test-id"
					class="form-control"
					bind:value={testId}
					placeholder={$t('enterTestId')}
				/>
				<button class="btn btn-outline-primary" type="submit">{$t('go')}</button>
			</div>
		</form>

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

		{#if bookmarkedExams.length > 0 || bookmarkedQuizPresets.length > 0}
			<section class="bg-body border rounded-3 p-3 mb-3">
				<h2 class="h6 fw-bold">{$t('bookmarkedQuickStart')}</h2>
				<div class="d-flex flex-wrap gap-2">
					{#each bookmarkedExams as exam (exam.id)}
						<button class="btn btn-sm btn-outline-primary quick-chip" type="button" onclick={() => quickStartExam(exam.id)} disabled={status === 'loading'}>
							{exam.name}
						</button>
					{/each}
					{#each bookmarkedQuizPresets as preset (preset.id)}
						<button class="btn btn-sm btn-outline-secondary quick-chip" type="button" onclick={() => quickStartPreset(preset)} disabled={status === 'loading'}>
							{preset.label}
						</button>
					{/each}
				</div>
			</section>
		{/if}

		<div class="mode-switch bg-body border rounded-3 p-2 mb-3">
			<button
				class="btn"
				class:btn-primary={activeMode === TEST_MODES.QUIZ_PRACTICE}
				class:btn-outline-secondary={activeMode !== TEST_MODES.QUIZ_PRACTICE}
				type="button"
				onclick={() => (activeMode = TEST_MODES.QUIZ_PRACTICE)}
			>
				{$t('quizPractice')}
			</button>
			<button
				class="btn"
				class:btn-primary={activeMode === TEST_MODES.FULL_EXAM}
				class:btn-outline-secondary={activeMode !== TEST_MODES.FULL_EXAM}
				type="button"
				onclick={() => (activeMode = TEST_MODES.FULL_EXAM)}
			>
				{$t('fullExamPaper')}
			</button>
		</div>

		<form class="bg-body border rounded-3 p-3 p-md-4 shadow-sm" onsubmit={submitGenerate}>
			<div class="row g-3 mb-3">
				<label class="form-label col-sm-6">
					<span class="fw-semibold">{$t('paperLanguage')}</span>
					<select class="form-select mt-1" bind:value={paperLanguage}>
						<option value="english">{$t('englishLabel')}</option>
						<option value="hindi">{$t('hindiLabel')}</option>
					</select>
				</label>
				<label class="form-label col-sm-6">
					<span class="fw-semibold">{$t('difficultyHeading')}</span>
					<select class="form-select mt-1" bind:value={difficulty} disabled={activeMode === TEST_MODES.FULL_EXAM}>
						<option value="beginner">{$t('beginner')}</option>
						<option value="intermediate">{$t('intermediate')}</option>
						<option value="advanced">{$t('advanced')}</option>
						<option value="expert">{$t('expert')}</option>
					</select>
				</label>
			</div>

			{#if activeMode === TEST_MODES.QUIZ_PRACTICE}
				<label class="form-label w-full">
					<span class="fw-semibold">{$t('whatToLearn')}</span>
					<input class="form-control mt-1" bind:value={topic} placeholder={$t('placeholderTopic')} />
				</label>
				<div class="row g-3">
					<label class="form-label col-sm-6">
						<span class="fw-semibold">{$t('questionsLabel')}</span>
						<input class="form-control mt-1" type="number" min="1" max="50" bind:value={numQuestions} />
					</label>
					<label class="form-label col-sm-6">
						<span class="fw-semibold">{$t('formatHeading')}</span>
						<select class="form-select mt-1" bind:value={testType}>
							<option value="multiple-choice">{$t('multipleChoice')}</option>
							<option value="true-false">{$t('trueFalse')}</option>
							<option value="coding">{$t('codingProblems')}</option>
							<option value="speed-challenge">{$t('speedChallenge')}</option>
						</select>
					</label>
				</div>
				<div class="mt-3">
					<div class="d-flex align-items-center justify-content-between gap-2 mb-2">
						<span class="fw-semibold">{$t('suggestedTopics')}</span>
						<button class="btn btn-sm btn-outline-secondary" type="button" onclick={saveCurrentQuizPreset}>
							{$t('bookmarkCurrentPreset')}
						</button>
					</div>
					<div class="d-flex flex-wrap gap-2">
						{#each Object.entries(TOPIC_CATEGORIES).slice(0, 4) as [category, topics] (category)}
							<button
								class="btn btn-sm"
								class:btn-secondary={selectedCategory === category}
								class:btn-outline-secondary={selectedCategory !== category}
								type="button"
								onclick={() => (selectedCategory = selectedCategory === category ? '' : category)}
							>
								{category}
							</button>
							{#if selectedCategory === category}
								{#each topics as topicName (topicName)}
									<button
										class="btn btn-sm"
										class:btn-primary={selectedTopics.includes(topicName)}
										class:btn-outline-primary={!selectedTopics.includes(topicName)}
										type="button"
										onclick={() => toggleSelectedTopic(topicName)}
									>
										{topicName}
									</button>
								{/each}
							{/if}
						{/each}
					</div>
				</div>
			{:else}
				<div class="row g-3 mb-3">
					<label class="form-label col-md-7">
						<span class="fw-semibold">{$t('searchExamStreamSyllabus')}</span>
						<input class="form-control mt-1" bind:value={examSearchQuery} placeholder="SSC, railway, police, polity" />
					</label>
					<label class="form-label col-md-3">
						<span class="fw-semibold">{$t('filterByGroup')}</span>
						<select class="form-select mt-1" bind:value={examGroupFilter}>
							{#each EXAM_GROUP_FILTERS as group (group)}
								<option value={group}>{group === 'all' ? $t('allGroups') : `${$t('group')} ${group}`}</option>
							{/each}
						</select>
					</label>
					<label class="form-check col-md-2 d-flex align-items-end gap-2 pb-2">
						<input class="form-check-input" type="checkbox" bind:checked={showBookmarkedExamsOnly} />
						<span class="form-check-label small">{$t('bookmarkedOnly')}</span>
					</label>
				</div>
				<div class="exam-list border rounded-3 mb-3">
					{#each visibleExams.slice(0, 24) as exam (exam.id)}
						<div class="exam-row" class:selected={selectedExamId === exam.id}>
							<button class="exam-main" type="button" onclick={() => (selectedExamId = exam.id)}>
								<span class="fw-semibold">{exam.name}</span>
								<span class="small text-muted">{exam.stream} · {$t('questionShort')} {exam.defaultNumQuestions || exam.fullLengthQuestions} · {exam.durationMinutes} {$t('minuteShort')}</span>
							</button>
							<button class="bookmark-btn" type="button" aria-label={$t('bookmarkExam')} onclick={() => toggleExamBookmark(exam.id)}>
								{bookmarkedExamIds.includes(exam.id) ? '★' : '☆'}
							</button>
						</div>
					{/each}
				</div>
				{#if selectedExam}
					<label class="form-label w-full">
						<span class="fw-semibold">{$t('optionalTopicNotes')}</span>
						<input class="form-control mt-1" bind:value={topic} placeholder={$t('fullExamInstructionPlaceholder')} />
					</label>
					<div class="mt-2">
						<div class="fw-semibold mb-2">{$t('syllabusFocus')}</div>
						<div class="d-flex flex-wrap gap-2">
							{#each selectedExam.syllabus || [] as topicName (topicName)}
								<button
									class="btn btn-sm"
									class:btn-primary={selectedSyllabusFocus.includes(topicName)}
									class:btn-outline-primary={!selectedSyllabusFocus.includes(topicName)}
									type="button"
									onclick={() => toggleSyllabusFocus(topicName)}
								>
									{topicName}
								</button>
							{/each}
						</div>
					</div>
				{/if}
			{/if}

			{#if $isDataSaverActive && activeMode === TEST_MODES.QUIZ_PRACTICE}
				<div class="alert alert-info mt-3 mb-0">
					{$t('slowConnectionReduced')} {numQuestions} {$t('forFasterLoading')}
				</div>
			{:else if $isDataSaverActive && activeMode === TEST_MODES.FULL_EXAM}
				<div class="alert alert-info mt-3 mb-0">{$t('fullLengthSlowConnection')}</div>
			{/if}
			{#if isOffline}
				<div class="alert alert-warning mt-3 mb-0">{$t('offlineAccessHistory')}</div>
			{/if}
			{#if retryLabel}
				<div class="alert alert-light border mt-3 mb-0">{retryLabel}</div>
			{/if}
			{#if error}
				<div class="alert alert-danger mt-3 mb-0">{error}</div>
			{/if}

			<button class="btn btn-primary btn-lg w-full mt-3" disabled={status === 'loading' || !canGenerate}>
				{status === 'loading'
					? $t('generating')
					: activeMode === TEST_MODES.FULL_EXAM
						? $t('generateExamPaper')
						: $t('generateQuiz')}
			</button>
		</form>
	</div>
</section>

<style>
	.home-wrap {
		max-width: 860px;
	}

	.mode-switch {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	.quick-chip {
		min-height: 44px;
	}

	.exam-list {
		max-height: 360px;
		overflow: auto;
	}

	.exam-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 48px;
		border-bottom: 1px solid var(--line);
	}

	.exam-row:last-child {
		border-bottom: 0;
	}

	.exam-row.selected {
		background: rgba(var(--brand-rgb), 0.08);
	}

	.exam-main,
	.bookmark-btn {
		min-height: 52px;
		border: 0;
		background: transparent;
		color: inherit;
	}

	.exam-main {
		display: flex;
		align-items: flex-start;
		flex-direction: column;
		justify-content: center;
		padding: 8px 12px;
		text-align: left;
	}

	.bookmark-btn {
		font-size: 1.3rem;
	}
</style>
