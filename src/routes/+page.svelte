<script>
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { localizedApiError, t } from '$lib/client/i18n';
	import { isDataSaverActive, language } from '$lib/client/preferences';
	import { track, trackDebounced } from '$lib/client/telemetry';
	import {
		getBookmarkedExamIds,
		getBookmarkedQuizPresets,
		getHistory,
		getUnsubmittedTest,
		saveBookmarkedExamIds,
		saveBookmarkedQuizPresets,
		saveCurrentPaper,
	} from '$lib/client/storage';
	import {
		FOCUS_SEARCH_EVENT,
		LOCAL_STORAGE_CHANGE_EVENT,
		STORAGE_KEYS,
	} from '$lib/client/constants';
	import { TOPIC_CATEGORIES } from '$lib/shared/constants';
	import { OBJECTIVE_ONLY_EXAMS, getIndianExamById } from '$lib/data/indianExams';

	const TEST_MODES = {
		FULL_EXAM: 'full-exam',
		QUIZ_PRACTICE: 'quiz-practice',
	};
	const EXAM_GROUP_FILTERS = ['all', 'A', 'B', 'C', 'D'];
	const MAX_RETRIES = 3;
	const GENERATION_TIMEOUT_MS = 180000;
	const SEARCH_DEBOUNCE_MS = 350;
	const SEARCH_PAGE_SIZE = 5;
	const RECENT_TTL_MS = 60_000;
	const RECENT_PREFETCH_DELAY_MS = 2000;
	const HERO_SCROLL_THRESHOLD = 100;

	let activeMode = $state(TEST_MODES.QUIZ_PRACTICE);
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
	let searchInput = $state(null);
	let searchQuery = $state('');
	let searchOpen = $state(false);
	let searchResults = $state([]);
	let searchStatus = $state('idle');
	let resultsOffset = 0;
	let hasMoreResults = $state(false);
	let loadingMore = $state(false);
	let heroCollapsed = $state(false);
	let recentCache = null;
	let searchTimer;
	let searchAbort = null;

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
	let isFormDirty = $derived(
		topic.trim().length > 0 ||
			selectedTopics.length > 0 ||
			selectedExamId !== '' ||
			selectedSyllabusFocus.length > 0,
	);
	let isAndroidDevice = $state(false);
	let isInCapacitorApp = $state(false);

	onMount(() => {
		const ua = window.navigator.userAgent || '';
		isAndroidDevice = /android/i.test(ua);
		// Capacitor injects its bridge into the WebView of the installed app;
		// hide the APK download card for users who already have the app.
		isInCapacitorApp = Boolean(window.Capacitor?.isNativePlatform?.());
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

		const prefetchTimer = window.setTimeout(() => {
			if (!get(isDataSaverActive) && navigator.onLine) {
				void fetchSearchList('', 0, false);
			}
		}, RECENT_PREFETCH_DELAY_MS);

		const handlePrefetchInvalidation = (event) => {
			const keys = event.detail?.keys || [];
			if (
				keys.includes(STORAGE_KEYS.TEST_HISTORY) ||
				keys.includes(STORAGE_KEYS.QUESTION_PAPER)
			) {
				recentCache = null;
			}
		};
		window.addEventListener(LOCAL_STORAGE_CHANGE_EVENT, handlePrefetchInvalidation);

		const handleFocusSearch = () => {
			focusSearchInput();
		};
		window.addEventListener(FOCUS_SEARCH_EVENT, handleFocusSearch);

		if (new URL(window.location.href).searchParams.get('focus') === 'search') {
			window.history.replaceState(null, '', window.location.pathname);
			window.setTimeout(() => focusSearchInput(), 50);
		}

		return () => {
			window.removeEventListener('online', updateNetwork);
			window.removeEventListener('offline', updateNetwork);
			window.clearTimeout(prefetchTimer);
			window.removeEventListener(LOCAL_STORAGE_CHANGE_EVENT, handlePrefetchInvalidation);
			window.removeEventListener(FOCUS_SEARCH_EVENT, handleFocusSearch);
			searchAbort?.abort();
			if (searchTimer) {
				window.clearTimeout(searchTimer);
			}
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

	$effect(() => {
		if (searchOpen || status === 'loading' || isFormDirty || error) {
			heroCollapsed = true;
			return;
		}
		if (typeof window !== 'undefined' && window.scrollY <= HERO_SCROLL_THRESHOLD) {
			heroCollapsed = false;
		}
	});

	$effect(() => {
		if (typeof window === 'undefined' || typeof document === 'undefined') {
			return;
		}
		const handleHeroScroll = () => {
			if (window.scrollY > HERO_SCROLL_THRESHOLD) {
				heroCollapsed = true;
				return;
			}
			if (!searchOpen && status !== 'loading' && !isFormDirty && !error) {
				heroCollapsed = false;
			}
		};
		const handleHeroInteraction = (event) => {
			const target = event.target;
			if (!(target instanceof Element)) {
				return;
			}
			if (
				target.closest('.home-wrap') &&
				!target.closest('.search-home-wrap') &&
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

	function normalizeQuizTestType(value) {
		return value === 'mixed' ? 'multiple-choice' : value;
	}

	function toggleExamBookmark(examId) {
		const isAdding = !bookmarkedExamIds.includes(examId);
		bookmarkedExamIds = isAdding
			? [examId, ...bookmarkedExamIds].slice(0, 20)
			: bookmarkedExamIds.filter((id) => id !== examId);
		saveBookmarkedExamIds(bookmarkedExamIds);
		track(isAdding ? 'bookmark:add-exam' : 'bookmark:remove-exam', { examId });
	}

	function toggleSelectedTopic(topicName) {
		selectedTopics = selectedTopics.includes(topicName)
			? selectedTopics.filter((item) => item !== topicName)
			: [...selectedTopics, topicName];
		track('setup:topic-toggle', { topic: topicName });
	}

	function toggleSyllabusFocus(topicName) {
		selectedSyllabusFocus = selectedSyllabusFocus.includes(topicName)
			? selectedSyllabusFocus.filter((item) => item !== topicName)
			: [...selectedSyllabusFocus, topicName];
		track('setup:syllabus-toggle', { topic: topicName });
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
		track('generate:save-preset');
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
				headers: {
					'Content-Type': 'application/json',
				},
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
			mode: requestParams.testMode || activeMode,
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
				track('generate:success', { mode: requestParams.testMode || activeMode });
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
			track('generate:quick-start-exam', { examId });
			await runGeneration(getExamRequestParams(exam, exam.syllabus || [], ''));
		}
	}

	async function quickStartPreset(preset) {
		track('generate:quick-start-preset', { presetId: preset.id });
		await runGeneration(getQuizRequestParams(preset));
	}

	function isSearchableQuery(q) {
		return q.length >= 4 || /^\d+$/.test(q);
	}

	function getFreshRecent() {
		if (!recentCache) {
			return null;
		}
		return Date.now() - recentCache.fetchedAt <= RECENT_TTL_MS ? recentCache : null;
	}

	function focusSearchInput() {
		searchInput?.focus();
	}

	function openSearchPanel() {
		searchOpen = true;
		track('search:open');
		const q = searchQuery.trim();
		if (!isSearchableQuery(q)) {
			const cached = getFreshRecent();
			if (cached) {
				searchResults = cached.tests;
				hasMoreResults = cached.hasMore;
				resultsOffset = cached.tests.length;
				searchStatus = 'done';
			} else if (searchStatus !== 'loading') {
				searchStatus = 'loading';
				void fetchSearchList('', 0, false);
			}
		}
	}

	function closeSearchPanel() {
		if (!searchOpen) {
			return;
		}
		searchOpen = false;
		track('search:close');
		searchAbort?.abort();
		searchAbort = null;
		if (searchTimer) {
			window.clearTimeout(searchTimer);
			searchTimer = undefined;
		}
		searchResults = [];
		hasMoreResults = false;
		loadingMore = false;
		resultsOffset = 0;
		searchStatus = 'idle';
	}

	async function fetchSearchList(q, offset, append) {
		const controller = new AbortController();
		searchAbort?.abort();
		searchAbort = controller;
		if (append) {
			loadingMore = true;
		} else {
			searchStatus = 'loading';
		}

		try {
			const response = await fetch(
				`/api/test?q=${encodeURIComponent(q)}&limit=${SEARCH_PAGE_SIZE}&offset=${offset}`,
				{ signal: controller.signal },
			);
			const payload = await response.json().catch(() => null);
			if (searchAbort !== controller) {
				return;
			}
			const tests = response.ok && Array.isArray(payload?.tests) ? payload.tests : [];
			const hasMore = response.ok && payload?.hasMore === true;

			if (!append && !q) {
				recentCache = {
					tests,
					hasMore,
					fetchedAt: Date.now(),
				};
			}

			if (!searchOpen || searchQuery.trim() !== q) {
				return;
			}

			let next = append ? [...searchResults, ...tests] : [...tests];
			if (!append && /^\d+$/.test(q)) {
				const exactIndex = next.findIndex((test) => String(test.id) === q);
				if (exactIndex > 0) {
					const [exact] = next.splice(exactIndex, 1);
					next.unshift(exact);
				}
			}
			searchResults = next;
			resultsOffset = offset + tests.length;
			hasMoreResults = hasMore;
			searchStatus = 'done';
			if (append) {
				loadingMore = false;
			}
		} catch (error) {
			if (error?.name === 'AbortError' || searchAbort !== controller) {
				return;
			}
			if (!searchOpen || searchQuery.trim() !== q) {
				return;
			}
			if (!append) {
				searchResults = [];
				hasMoreResults = false;
			}
			searchStatus = 'done';
			if (append) {
				loadingMore = false;
			}
		}
	}

	function submitSearch(event) {
		event.preventDefault();
		const q = searchQuery.trim();
		if (!q) {
			searchOpen = true;
			openSearchPanel();
			focusSearchInput();
			return;
		}
		track('search:submit', { q: q.slice(0, 64) });
		const exact = /^\d+$/.test(q)
			? searchResults.find((test) => String(test.id) === q)
			: null;
		if (exact) {
			void goto(`/test?id=${exact.id}`);
			return;
		}
		if (searchStatus === 'done' && searchResults.length === 1) {
			void goto(`/test?id=${searchResults[0].id}`);
			return;
		}
		searchOpen = true;
		focusSearchInput();
	}

	function handleSearchKeydown(event) {
		if (event.key === 'Escape') {
			closeSearchPanel();
		}
	}

	function handleResultsScroll(event) {
		if (!searchOpen || searchStatus !== 'done' || !hasMoreResults || loadingMore) {
			return;
		}
		const container = event.currentTarget;
		if (container.scrollTop + container.clientHeight < container.scrollHeight - 48) {
			return;
		}
		track('search:scroll-more');
		const q = searchQuery.trim();
		void fetchSearchList(isSearchableQuery(q) ? q : '', resultsOffset, true);
	}

	$effect(() => {
		const q = searchQuery.trim();
		if (!searchOpen) {
			return;
		}
		trackDebounced('search:keystroke', { q: q.slice(0, 64) });
		if (!isSearchableQuery(q)) {
			const cached = getFreshRecent();
			if (cached) {
				searchResults = cached.tests;
				hasMoreResults = cached.hasMore;
				resultsOffset = cached.tests.length;
				searchStatus = 'done';
			} else if (searchStatus !== 'loading') {
				searchStatus = 'loading';
				void fetchSearchList('', 0, false);
			}
			return;
		}

		searchStatus = 'loading';
		searchResults = [];
		resultsOffset = 0;
		hasMoreResults = false;
		const timer = window.setTimeout(() => {
			void fetchSearchList(q, 0, false);
		}, SEARCH_DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	});

	$effect(() => {
		if (!searchOpen || searchStatus !== 'done' || !hasMoreResults || loadingMore) {
			return;
		}
		const box = document.querySelector('.search-home-results');
		if (!box || box.scrollHeight > box.clientHeight + 4) {
			return;
		}
		const q = searchQuery.trim();
		void fetchSearchList(q.length >= 4 ? q : '', resultsOffset, true);
	});

	$effect(() => {
		if (typeof document === 'undefined') {
			return;
		}
		document.body.style.overflow = searchOpen ? 'hidden' : '';
		return () => {
			document.body.style.overflow = '';
		};
	});
</script>

<svelte:head>
	<title>AI Quiz & Exam Paper Generator for India | selftest.in</title>
</svelte:head>

<section class="container py-4 py-md-5">
	<div class="mx-auto home-wrap">
		<div class="text-center mb-4 hero-block" class:hero-collapsed={heroCollapsed} aria-hidden={heroCollapsed}>
			<p class="text-uppercase text-muted small fw-semibold mb-2">{$t('aiPracticeForIndianExams')}</p>
			<h1 class="h2 fw-bold mb-2">{$t('createQuiz')}</h1>
			<p class="text-muted mb-0">
				{activeMode === TEST_MODES.FULL_EXAM ? $t('configureAndGenerate') : $t('useBookmarksOrChooseMode')}
			</p>
		</div>

		<div class="search-home-wrap mb-3">
			<form class="search-home-form bg-body p-2" onsubmit={submitSearch}>
				<div class="input-group">
					<input
						id="global-test-search"
						class="form-control"
						bind:this={searchInput}
						bind:value={searchQuery}
						onfocus={openSearchPanel}
						onkeydown={handleSearchKeydown}
						placeholder={$t('searchByTopicOrId')}
						aria-label={$t('searchPastTests')}
						autocomplete="off"
					/>
					<button class="btn btn-primary" type="submit">{$t('searchTests')}</button>
				</div>
				{#if searchOpen}
					<div class="search-home-backdrop" role="presentation" onclick={closeSearchPanel}></div>
					<div class="search-home-results" onscroll={handleResultsScroll}>
						{#if searchStatus === 'loading'}
							<p class="text-muted small mb-0 px-2 py-1">{$t('loading')}</p>
						{:else if searchStatus === 'done'}
							<p class="text-muted small mb-1 px-2 py-1">
								{isSearchableQuery(searchQuery.trim()) ? $t('matchingTests') : $t('recentTests')}
							</p>
							{#if searchResults.length === 0}
								<p class="text-muted small mb-0 px-2 py-1">{$t('noTestsFound')}</p>
							{:else}
								{#each searchResults as test (test.id)}
									<a
										class="result-item"
										href={`/test?id=${test.id}`}
										onclick={() => {
											track('search:result-click');
											closeSearchPanel();
										}}
									>
										<strong>{test.topic || $t('untitledTest')}</strong>
										<span class="result-meta">
											{test.test_mode === 'full-exam' ? $t('fullExamPaper') : $t('quizPractice')} · {$t('testId')}: {test.id}
										</span>
									</a>
								{/each}
								{#if loadingMore}
									<p class="text-muted small mb-0 px-2 py-1">{$t('loading')}</p>
								{/if}
							{/if}
						{/if}
					</div>
				{/if}
			</form>
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
				onclick={() => {
					activeMode = TEST_MODES.QUIZ_PRACTICE;
					track('setup:mode', { mode: 'quiz-practice' });
				}}
			>
				{$t('quizPractice')}
			</button>
			<button
				class="btn"
				class:btn-primary={activeMode === TEST_MODES.FULL_EXAM}
				class:btn-outline-secondary={activeMode !== TEST_MODES.FULL_EXAM}
				type="button"
				onclick={() => {
					activeMode = TEST_MODES.FULL_EXAM;
					track('setup:mode', { mode: 'full-exam' });
				}}
			>
				{$t('fullExamPaper')}
			</button>
		</div>

		<form class="bg-body border rounded-3 p-3 p-md-4 shadow-sm" onsubmit={submitGenerate}>
			<div class="row g-3 mb-3">
				<label class="form-label col-sm-6">
					<span class="fw-semibold">{$t('paperLanguage')}</span>
					<select
						class="form-select mt-1"
						bind:value={paperLanguage}
						onchange={() => track('setup:language', { language: paperLanguage })}
					>
						<option value="english">{$t('englishLabel')}</option>
						<option value="hindi">{$t('hindiLabel')}</option>
					</select>
				</label>
				<label class="form-label col-sm-6">
					<span class="fw-semibold">{$t('difficultyHeading')}</span>
					<select
						class="form-select mt-1"
						bind:value={difficulty}
						disabled={activeMode === TEST_MODES.FULL_EXAM}
						onchange={() => track('setup:difficulty', { difficulty })}
					>
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
					<input
						class="form-control mt-1"
						bind:value={topic}
						placeholder={$t('placeholderTopic')}
						oninput={() => trackDebounced('setup:topic-input', { topic: topic.trim().slice(0, 64) })}
					/>
				</label>
				<div class="row g-3">
					<label class="form-label col-sm-6">
						<span class="fw-semibold">{$t('questionsLabel')}</span>
						<input
							class="form-control mt-1"
							type="number"
							min="1"
							max="50"
							bind:value={numQuestions}
							onchange={() => track('setup:questions-count', { count: Number(numQuestions) })}
						/>
					</label>
					<label class="form-label col-sm-6">
						<span class="fw-semibold">{$t('formatHeading')}</span>
						<select
							class="form-select mt-1"
							bind:value={testType}
							onchange={() => track('setup:test-type', { type: testType })}
						>
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
								onclick={() => {
									selectedCategory = selectedCategory === category ? '' : category;
									track('setup:category', { category });
								}}
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
						<input
							class="form-control mt-1"
							bind:value={examSearchQuery}
							placeholder={$t('examSearchPlaceholder')}
							oninput={() =>
								trackDebounced('setup:exam-search', { q: examSearchQuery.trim().slice(0, 64) })}
						/>
					</label>
					<label class="form-label col-md-3">
						<span class="fw-semibold">{$t('filterByGroup')}</span>
						<select
							class="form-select mt-1"
							bind:value={examGroupFilter}
							onchange={() => track('setup:exam-group-filter', { group: examGroupFilter })}
						>
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
							<button
								class="exam-main"
								type="button"
								onclick={() => {
									selectedExamId = exam.id;
									track('setup:exam-select', { examId: exam.id });
								}}
							>
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
						<input
							class="form-control mt-1"
							bind:value={topic}
							placeholder={$t('fullExamInstructionPlaceholder')}
							oninput={() => trackDebounced('setup:topic-input', { topic: topic.trim().slice(0, 64) })}
						/>
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

<style>
	.home-wrap {
		max-width: 860px;
	}

	.hero-block {
		max-height: 240px;
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

	.search-home-form {
		position: relative;
	}

	.search-home-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1180;
		background: transparent;
	}

	.search-home-results {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		right: 0;
		z-index: 1200;
		max-height: min(60vh, 420px);
		overflow: auto;
		padding: 8px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--surface);
		box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
	}

	.result-item {
		display: grid;
		gap: 2px;
		padding: 10px 12px;
		border-radius: 8px;
		color: inherit;
		text-decoration: none;
	}

	.result-item:hover {
		background: var(--surface-muted);
	}

	.result-meta {
		color: var(--text-muted);
		font-size: 0.82rem;
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
