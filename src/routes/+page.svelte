<script>
	import { goto } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { localizedApiError, t } from '$lib/client/i18n';
	import { isDataSaverActive, language } from '$lib/client/preferences';
	import { HAPTIC_ERROR, HAPTIC_SUCCESS, triggerVibration } from '$lib/client/haptics';
	import { track } from '$lib/client/telemetry';
	import {
		PREVIEW_DEBOUNCE_MS,
		buildLocalPlanPatch,
		buildLocalPreview,
		isMeaningfulPreview,
		needsJevPreview,
		shouldRunPreview,
	} from '$lib/client/livePreview';
	import { parseSseBuffer, streamErrorToError } from '$lib/client/sse';
	import {
		getBookmarkedExamIds,
		getBookmarkedQuizPresets,
		getHiddenHistoryIds,
		getHistory,
		getUnsubmittedTest,
		readJson,
		saveBookmarkedExamIds,
		saveCurrentPaper,
		writeJson,
	} from '$lib/client/storage';
	import {
		isCacheFresh,
		mergeRecentTests,
		readRecentCache,
	} from '$lib/client/recentTests';
	import { STORAGE_KEYS } from '$lib/client/constants';
	import { OBJECTIVE_ONLY_EXAMS, getIndianExamById } from '$lib/data/indianExams';
	import { getStreak } from '$lib/client/learning';
	import ChatThread from '$lib/client/ChatThread.svelte';
	import PlannerComposer from '$lib/client/PlannerComposer.svelte';
	import {
		applyTurnFailure,
		applyTurnResult,
		beginClarifyAnswer,
		beginTurn,
		buildTurnRequest,
		clearPlannerDraft,
		createPlannerDraft,
		hasDraftContent,
		markPlanEdited,
		readPlannerDraft,
		skipClarify,
		writePlannerDraft,
	} from '$lib/client/plannerState';
	import PreviewCard from '$lib/client/PreviewCard.svelte';
	import QuickStart from '$lib/client/QuickStart.svelte';
	import TopicBrowser from '$lib/client/TopicBrowser.svelte';
	import ExamBrowser from '$lib/client/ExamBrowser.svelte';
	import ProfileWizard from '$lib/client/ProfileWizard.svelte';
	import GenerationTrace from '$lib/client/GenerationTrace.svelte';
	import { user } from '$lib/client/auth';
	import { requestPersonalize } from '$lib/client/personalize';
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
	let plannerDraft = $state(createPlannerDraft());
	let recentTests = $state([]);
	let previewStatus = $state('idle');
	let previewSeq = 0;
	let previewAbort = null;
	let previewTimer;
	let lastPreviewText = '';
	let lastPreviewAt = 0;
	let previewPausedUntil = 0;
	let lastLocalPreviewText = '';

	const plannerExamples = [
		{ key: 'plannerExample1' },
		{ key: 'plannerExample2' },
		{ key: 'plannerExample3' },
	];
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
	let streak = $state(null);
	// Set the moment the user touches the recent-tests list. The async
	// server refresh must not swap rows under an in-flight tap (it opened
	// the wrong test); when touched, the local list stays put.
	let recentListTouched = false;
	let lastTestId = $state(null);
	let showReturningCard = $state(false);
	let difficultyTouched = $state(false);
	let showProfileWizard = $state(false);
	let profileLoaded = $state(false);

	let heroCollapsed = $state(false);
	let isAndroidDevice = $state(false);
	let isInCapacitorApp = $state(false);
	let showManualConfig = $state(false);
	let generationAbort = null;
	let generationTimer = null;
	let generationElapsed = $state(0);
	let generationCanceled = false;
	let generationProgress = $state(null);
	let generationDone = $state(false);
	let generationFailed = $state(false);
	let generationFailedTimer = null;

	const currentProfile = $derived($profileStore);
	const insights = $derived($profileInsights);
	const tailoredSummary = $derived(
		$user && insights?.tailoredSummary ? insights.tailoredSummary : null
	);
	const profileReadyForWizard = $derived(
		$user &&
			(currentProfile === null || !currentProfile.setupComplete) &&
			(currentProfile === null || currentProfile.preferences?.personalized !== false)
	);

	let selectedExam = $derived(getIndianExamById(examId));
	let bookmarkedExams = $derived(
		OBJECTIVE_ONLY_EXAMS.filter((exam) => bookmarkedExamIds.includes(exam.id))
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
	let canGenerate = $derived(
		topic.trim().length > 0 || selectedTopics.length > 0 || examId !== ''
	);
	const showPlanCard = $derived(
		Boolean(topic.trim() || examId || parsedFromIntent || intentParseFailed)
	);

	// Derived so the meta strings re-render when the UI language changes,
	// instead of being frozen at mount time. Displayed oldest-first (newest
	// at the bottom) so new arrivals append below instead of shoving rows
	// under the user's finger.
	const recentTestsView = $derived(
		[...recentTests].reverse().map((test) => ({
			id: test.id,
			topic: test.topic,
			meta: `${test.isFullExam ? $t('fullExamPaper') : $t('quizPractice')}${
				test.totalQuestions ? ` · ${test.totalQuestions} ${$t('qsShort')}` : ''
			} · ${$t('testId')}: ${test.id}`,
		}))
	);

	onMount(() => {
		const ua = window.navigator.userAgent || '';
		isAndroidDevice = /android/i.test(ua);
		isInCapacitorApp = Boolean(window.Capacitor?.isNativePlatform?.());
		bookmarkedExamIds = getBookmarkedExamIds();
		bookmarkedQuizPresets = getBookmarkedQuizPresets();
		unsubmittedTest = getUnsubmittedTest();
		const historyEntries = getHistory();
		const hiddenIds = getHiddenHistoryIds();
		// Merge, don't replace: the server list (when we have one) sets the
		// order and local-only rows survive, so rows never vanish mid-read.
		// A fresh server cache paints merged data immediately; a stale or
		// missing cache triggers one refetch that merges on arrival.
		const paintMerged = (serverRows) => {
			if (recentListTouched) return;
			recentTests = mergeRecentTests({
				local: historyEntries,
				server: serverRows,
				hidden: hiddenIds,
			});
		};
		const cached = readRecentCache(readJson(STORAGE_KEYS.SERVER_RECENT_TESTS, null));
		const cachedRows = cached && isCacheFresh(cached.at) ? cached.tests : [];
		paintMerged(cachedRows);
		if (cachedRows.length === 0) {
			void (async () => {
				try {
					const response = await fetch('/api/test?q=&limit=5&offset=0');
					if (!response.ok) return;
					const payload = await response.json().catch(() => null);
					const latest = Array.isArray(payload?.tests) ? payload.tests : [];
					if (latest.length === 0) return;
					writeJson(STORAGE_KEYS.SERVER_RECENT_TESTS, {
						at: Date.now(),
						tests: latest,
					});
					paintMerged(latest);
				} catch {
					// Offline or request failed: keep the merged local paint.
				}
			})();
		}
		streak = getStreak();
		lastTestId = historyEntries[0]?.id ? String(historyEntries[0].id) : null;
		// Central personalization (fail-open, once per load): Jev picks one
		// entry point to promote; hides stay behind existing toggles/links.
		void requestPersonalize('home', {
			hasUnsubmitted: Boolean(unsubmittedTest),
			historyCount: historyEntries.length,
			streak: streak?.currentStreak || 0,
		}).then((decision) => {
			if (!decision?.applied) return;
			if (decision.hide?.includes('manual-browsers')) {
				showManualConfig = false;
			}
			if (decision.promote?.includes('exam-browser')) {
				showManualConfig = true;
			}
		});
		showReturningCard = Boolean(
			!unsubmittedTest && (streak?.currentStreak > 0 || historyEntries.length > 0)
		);
		if (showReturningCard) {
			track('streak:view', {
				streak: streak?.currentStreak || 0,
				hasHistory: historyEntries.length > 0,
			});
		}
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
				numQuestions = Number(exam.defaultNumQuestions || 10);
				difficulty = exam.defaultDifficulty || 'intermediate';
				// Practice pages link full mocks as ?exam=id&numQuestions=N.
				// Honor an explicit count so "full mock (100)" really means 100.
				const requestedCount = Number(params.get('numQuestions'));
				if (Number.isFinite(requestedCount) && requestedCount > 0) {
					numQuestions = Math.max(1, Math.min(200, Math.round(requestedCount)));
				}
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
		if (params.get('daily') === '1') {
			// Micro-win deep link: start the Daily 5 without any setup taps.
			window.setTimeout(() => {
				void startDailyFive();
			}, 100);
		}
		const hasUrlConfig = Boolean(
			params.get('exam') || params.get('mode') || params.get('daily')
		);
		if (!hasUrlConfig) {
			const restoredDraft = readPlannerDraft();
			if (hasDraftContent(restoredDraft)) {
				plannerDraft = restoredDraft;
				if (restoredDraft.plan) {
					applyPlannerPlan(restoredDraft.plan);
				}
				intentStatus = restoredDraft.messages.length > 0 ? 'done' : 'idle';
			}
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
			if (!insightsData?.suggestedDifficulty || difficultyTouched || isFullExam) {
				return;
			}
			difficulty = insightsData.suggestedDifficulty;
		};

		const loadProfileState = async () => {
			const profileData = await fetchProfile();
			const insightsData = await fetchProfileInsights();
			applyProfilePrefill(insightsData);
			const needsSetup = !profileData || !profileData.setupComplete;
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
		if (
			status === 'loading' ||
			topic.trim().length > 0 ||
			selectedTopics.length > 0 ||
			examId !== '' ||
			error
		) {
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
			if (
				status !== 'loading' &&
				topic.trim().length === 0 &&
				selectedTopics.length === 0 &&
				examId === '' &&
				!error
			) {
				heroCollapsed = false;
			}
		};
		const handleHeroInteraction = (event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			// Taps inside the planner (recent tests, examples, composer) must
			// not collapse the hero: the layout shift between pointerdown and
			// click swallows the tap, forcing a second click. Collapse only
			// for content below the planner.
			if (
				target.closest('.home-wrap') &&
				!target.closest('.planner-panel') &&
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

	const PLANNER_PLAN_FIELDS = [
		'topic',
		'testType',
		'difficulty',
		'numQuestions',
		'language',
		'examId',
	];

	function snapshotPlan() {
		return {
			topic,
			testType,
			difficulty,
			numQuestions,
			examId: examId || null,
			isFullExam,
			language: paperLanguage,
		};
	}

	function persistPlannerDraft() {
		if (hasDraftContent(plannerDraft)) {
			writePlannerDraft(plannerDraft);
		} else {
			clearPlannerDraft();
		}
	}

	function applyPlannerPlan(plan, { markParsed = true } = {}) {
		if (!plan) return;
		if (typeof plan.topic === 'string' && plan.topic) topic = plan.topic;
		if (plan.testType) testType = plan.testType;
		if (plan.difficulty) difficulty = plan.difficulty;
		if (plan.numQuestions) numQuestions = plan.numQuestions;
		if (plan.language) paperLanguage = plan.language;
		if (plan.examId) {
			isFullExam = true;
			examId = plan.examId;
		} else {
			isFullExam = Boolean(plan.isFullExam);
			examId = '';
		}
		if (markParsed) parsedFromIntent = true;
	}

	// -------------------------------------------------------------------------
	// Live preview: Tier 0 is local and instant, Tier 1 is a slim Jev call
	// -------------------------------------------------------------------------

	function cancelPlannerPreview() {
		previewSeq += 1;
		previewAbort?.abort();
		previewAbort = null;
		window.clearTimeout(previewTimer);
		previewStatus = 'idle';
	}

	function applyLocalPreviewFor(text) {
		const local = buildLocalPreview(text);
		if (!local) return null;
		const patch = buildLocalPlanPatch(local, plannerDraft.explicit);
		if (patch) {
			if (patch.topic) topic = patch.topic;
			if (patch.examId) {
				examId = patch.examId;
				isFullExam = true;
				// The preview must match what generation will produce: full
				// exams use the exam's default question count.
				const exam = getIndianExamById(patch.examId);
				if (exam?.defaultNumQuestions) {
					numQuestions = Number(exam.defaultNumQuestions);
				}
			}
			if (patch.difficulty) difficulty = patch.difficulty;
			if (patch.language) paperLanguage = patch.language;
			if (patch.testType) testType = patch.testType;
			if (patch.numQuestions) numQuestions = patch.numQuestions;
			if (isMeaningfulPreview(local)) parsedFromIntent = true;
		}
		if (!needsJevPreview(local)) {
			previewStatus = 'ready';
			if (lastLocalPreviewText !== local.text) {
				lastLocalPreviewText = local.text;
				track('intent:preview', {
					source: 'local',
					ok: true,
					hasTopic: Boolean(local.topic),
				});
			}
		}
		return local;
	}

	function maybeRunJevPreview(text) {
		const trimmed = String(text || '').trim();
		if (!trimmed) return;
		const shouldRun = shouldRunPreview({
			text: trimmed,
			lastText: lastPreviewText,
			status: intentStatus,
			offline: isOffline,
			dataSaver: $isDataSaverActive,
			lastAt: lastPreviewAt,
			now: Date.now(),
			pausedUntil: previewPausedUntil,
		});
		if (!shouldRun) return;
		void runPlannerPreview(trimmed);
	}

	async function runPlannerPreview(text) {
		previewSeq += 1;
		const seq = previewSeq;
		previewAbort?.abort();
		const controller = new AbortController();
		previewAbort = controller;
		previewStatus = 'checking';
		lastPreviewText = text;
		lastPreviewAt = Date.now();
		const startedAt = performance.now();
		const latency = () => Math.round(performance.now() - startedAt);
		try {
			const response = await fetch('/api/parse-intent', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...buildTurnRequest(plannerDraft, text),
					mode: 'preview',
				}),
				signal: controller.signal,
			});
			if (seq !== previewSeq) return;
			if (response.status === 429) {
				previewPausedUntil = Date.now() + 5000;
				previewStatus = 'idle';
				track('intent:preview', {
					source: 'jev',
					ok: false,
					rateLimited: true,
					latencyMs: latency(),
				});
				return;
			}
			const data = await response.json().catch(() => ({}));
			if (seq !== previewSeq) return;
			if (!response.ok) {
				previewStatus = 'idle';
				track('intent:preview', {
					source: 'jev',
					ok: false,
					latencyMs: latency(),
					hasTopic: false,
				});
				return;
			}
			const plan = data.plan || null;
			const meaningful = isMeaningfulPreview({
				topic: plan?.topic,
				examId: plan?.examId,
				topicSource: data.topicSource,
			});
			// A preview whose topic is only the raw in-progress text must not
			// surface the card as if a subject had been resolved.
			applyPlannerPlan(
				plan && !meaningful ? { ...plan, topic: '' } : plan,
				{ markParsed: meaningful }
			);
			previewStatus = 'ready';
			track('intent:preview', {
				source: 'jev',
				ok: true,
				latencyMs: latency(),
				hasTopic: Boolean(data.plan?.topic),
				inputTokens: Number(data.usage?.input_tokens) || 0,
			});
		} catch (err) {
			if (err?.name === 'AbortError' || seq !== previewSeq) return;
			previewStatus = 'idle';
			track('intent:preview', {
				source: 'jev',
				ok: false,
				latencyMs: latency(),
				hasTopic: false,
			});
		} finally {
			if (seq === previewSeq) previewAbort = null;
		}
	}

	$effect(() => {
		const text = intentValue;
		if (typeof window === 'undefined') return;
		const local = untrack(() => applyLocalPreviewFor(text));
		window.clearTimeout(previewTimer);
		const trimmed = String(text || '').trim();
		if (!trimmed) return;
		// Nothing to ask the model when the local tier already resolved every
		// field the message mentions.
		if (local && !needsJevPreview(local)) return;
		previewTimer = window.setTimeout(() => {
			void maybeRunJevPreview(trimmed);
		}, PREVIEW_DEBOUNCE_MS);
		return () => window.clearTimeout(previewTimer);
	});

	async function runPlannerTurn(intentText) {
		cancelPlannerPreview();
		intentStatus = 'parsing';
		intentParseFailed = false;
		const requestPayload = buildTurnRequest(plannerDraft, intentText);
		const round = plannerDraft.round;
		track('intent:parse', { intent: intentText.slice(0, 64), round });
		const controller = new AbortController();
		const timeoutId = window.setTimeout(() => controller.abort(), 25000);
		try {
			const response = await fetch('/api/parse-intent', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestPayload),
				signal: controller.signal,
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				const apiError = new Error(data.error || 'Failed to parse intent');
				apiError.statusCode = response.status;
				throw apiError;
			}
			const plan = data.plan || null;
			const pendingTopicClarify = data.clarify?.id === 'topic';
			const meaningful = isMeaningfulPreview({
				topic: plan?.topic,
				examId: plan?.examId,
				topicSource: data.topicSource,
			});
			// While the planner is asking which subject the test should cover,
			// do not present the raw message as if it were the topic.
			if (plan && !meaningful && pendingTopicClarify) {
				applyPlannerPlan({ ...plan, topic: '' }, { markParsed: false });
			} else {
				applyPlannerPlan(plan);
			}
			plannerDraft = applyTurnResult(plannerDraft, data);
			persistPlannerDraft();
			intentStatus = 'done';
			if (data.clarify) {
				track('intent:clarification-asked', { field: data.clarify.id, round });
			}
			track('intent:parsed', {
				confidence: data.confidence,
				isFullExam: Boolean(data.plan?.isFullExam),
				round,
			});
		} catch (err) {
			console.error('Intent parsing error:', err);
			const timedOut = err?.name === 'AbortError';
			const rateLimited = err?.statusCode === 429;
			intentStatus = 'idle';
			intentParseFailed = !rateLimited;
			plannerDraft = applyTurnFailure(
				plannerDraft,
				rateLimited
					? 'rateLimitExceededRetry'
					: timedOut
						? 'generationTimedOutRetry'
						: 'plannerParseFailed'
			);
			persistPlannerDraft();
			if (!rateLimited && !timedOut && !topic.trim()) {
				topic = intentText;
			}
			parsedFromIntent = false;
			track('intent:parse-failed', { round, rateLimited, timedOut });
		} finally {
			window.clearTimeout(timeoutId);
		}
	}

	async function sendPlannerIntent(intentText) {
		if (!intentText || isOffline) return;
		plannerDraft = beginTurn(plannerDraft, intentText);
		persistPlannerDraft();
		intentValue = '';
		await runPlannerTurn(intentText);
	}

	function applyLocalClarifyAnswer(field, value) {
		if (field === 'topic') {
			topic = value;
			return;
		}
		if (field === 'examId') {
			if (value === 'none') {
				isFullExam = false;
				examId = '';
				return;
			}
			const exam = getIndianExamById(value);
			if (exam) {
				isFullExam = true;
				examId = exam.id;
				topic = `${exam.name} objective exam paper`;
				numQuestions = Number(exam.defaultNumQuestions || numQuestions);
				difficulty = exam.defaultDifficulty || difficulty;
				difficultyTouched = true;
			}
			return;
		}
		if (field === 'difficulty') {
			difficulty = value;
			difficultyTouched = true;
		}
	}

	async function answerClarification(option) {
		if (!option || status === 'loading') return;
		const field = plannerDraft.pendingClarify?.id;
		track('intent:clarification-answered', {
			field,
			outcome: 'answered',
			round: plannerDraft.round,
		});
		plannerDraft = beginClarifyAnswer(plannerDraft, option);
		persistPlannerDraft();
		applyLocalClarifyAnswer(field, option.value);
		await runPlannerTurn(option.label || option.value);
	}

	function skipClarification() {
		if (!plannerDraft.pendingClarify) return;
		const field = plannerDraft.pendingClarify.id;
		track('intent:clarification-answered', {
			field,
			outcome: 'skipped',
			round: plannerDraft.round,
		});
		plannerDraft = skipClarify(plannerDraft);
		persistPlannerDraft();
	}

	function resetPlanner() {
		cancelPlannerPreview();
		lastPreviewText = '';
		lastLocalPreviewText = '';
		plannerDraft = createPlannerDraft();
		clearPlannerDraft();
		intentValue = '';
		topic = '';
		parsedFromIntent = false;
		intentParseFailed = false;
		intentStatus = 'idle';
		numQuestions = 10;
		difficulty = 'intermediate';
		testType = 'multiple-choice';
		examId = '';
		isFullExam = false;
		difficultyTouched = false;
	}

	function handlePlannerChipEdit(field, value) {
		handleChipEdit(field, value);
		if (PLANNER_PLAN_FIELDS.includes(field)) {
			plannerDraft = markPlanEdited(plannerDraft, snapshotPlan(), field);
			persistPlannerDraft();
		}
	}

	function handleChipEdit(field, value) {
		track('preview:edit-chip', { field });
		if (field === 'topic') topic = value;
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
				numQuestions = Number(exam.defaultNumQuestions || 10);
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

	function toggleManualConfig() {
		if (!showManualConfig) {
			track('home:manual-expand');
		}
		showManualConfig = !showManualConfig;
	}

	function getExamRequestParams(
		exam,
		syllabusFocus = selectedSyllabusFocus,
		customTopic = topic
	) {
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
				headers: {
					'Content-Type': 'application/json',
					Accept: 'text/event-stream',
				},
				body: JSON.stringify({
					...requestParams,
					previousTestIds: historyEntries
						.filter(isStoredTest)
						.map((entry) => Number(entry.id)),
					attemptedTestIds: historyEntries
						.filter((entry) => entry.userAnswers)
						.filter(isStoredTest)
						.map((entry) => Number(entry.id)),
				}),
				signal: controller.signal,
			});

			// Progress streaming is best-effort: JSON responses (reused exams,
			// pre-generation errors, proxies that buffer) still work as before.
			const contentType = response.headers.get('content-type') || '';
			if (response.ok && contentType.includes('text/event-stream') && response.body) {
				return await readGenerationStream(response);
			}

			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				const apiError = new Error(localizedApiError(data, $t, response.status));
				apiError.status = response.status;
				apiError.code = typeof data?.code === 'string' ? data.code : null;
				apiError.retryable = response.status === 429 || response.status >= 500;
				throw apiError;
			}
			return data;
		} catch (caughtError) {
			if (caughtError.name === 'AbortError' && !generationCanceled) {
				const timeoutError = new Error($t('generationTimedOutRetry'), {
					cause: caughtError,
				});
				timeoutError.code = 'GENERATION_TIMEOUT';
				timeoutError.status = 408;
				timeoutError.retryable = true;
				throw timeoutError;
			}
			throw caughtError;
		} finally {
			window.clearTimeout(timeoutId);
			if (generationAbort === controller) {
				generationAbort = null;
			}
		}
	}

	/** Consumes the SSE generation stream, updating progress as it arrives. */
	async function readGenerationStream(response) {
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		for (;;) {
			const { value, done } = await reader.read();
			if (done) {
				break;
			}
			buffer += decoder.decode(value, { stream: true });
			const { events, rest } = parseSseBuffer(buffer);
			buffer = rest;
			for (const { event, data } of events) {
				if (event === 'progress') {
					generationProgress = {
						approved: Number(data?.approved) || 0,
						requested: Number(data?.requested) || 0,
						stage: typeof data?.stage === 'string' ? data.stage : null,
						round: Number(data?.round) || 0,
						batchIndex: Number(data?.batchIndex) || 0,
						batchTotal: Number(data?.batchTotal) || 0,
					};
				} else if (event === 'done') {
					generationDone = true;
					return data;
				} else if (event === 'error') {
					throw streamErrorToError(data);
				}
			}
		}
		throw streamErrorToError({
			error: $t('failedToGenerateQuiz'),
			code: 'GENERATION_STREAM_ENDED',
			status: 500,
		});
	}

	// The success path navigates straight to /test. Hold the ready state for a
	// beat so the trace can land; data-saver/reduced-motion users skip ahead.
	function generationSettleDelayMs() {
		if ($isDataSaverActive) {
			return 120;
		}
		if (
			typeof window !== 'undefined' &&
			window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
		) {
			return 120;
		}
		return 450;
	}

	async function runGeneration(requestParams) {
		if (isOffline) {
			error = $t('offlineAccessHistory');
			return;
		}
		cancelPlannerPreview();
		status = 'loading';
		error = '';
		retryLabel = '';
		generationCanceled = false;
		generationElapsed = 0;
		generationProgress = null;
		generationDone = false;
		generationFailed = false;
		window.clearTimeout(generationFailedTimer);
		generationFailedTimer = null;
		const generationStartedAt = Date.now();
		window.clearInterval(generationTimer);
		generationTimer = window.setInterval(() => {
			generationElapsed = Math.floor((Date.now() - generationStartedAt) / 1000);
		}, 1000);

		track('generate:start', {
			mode: requestParams.testMode || (isFullExam ? 'full-exam' : 'quiz-practice'),
			difficulty: requestParams.difficulty || difficulty,
			language: requestParams.language || paperLanguage,
			testType: requestParams.testType || testType,
			source: plannerDraft.messages.length > 0 ? 'composer' : 'live-preview',
		});

		try {
			for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
				try {
					if (attempt > 1) {
						retryLabel = `${$t('retrying')} ${attempt}/${MAX_RETRIES}`;
					}
					const data = await postGenerate(requestParams);
					// Let the trace settle on "Ready" before the hard
					// navigation; shortened for data-saver/reduced-motion.
					triggerVibration(HAPTIC_SUCCESS);
					await new Promise((resolve) =>
						window.setTimeout(resolve, generationSettleDelayMs())
					);
					track('generate:success', {
						mode:
							requestParams.testMode || (isFullExam ? 'full-exam' : 'quiz-practice'),
					});
					if (data?.trimmed) {
						track('generate:trimmed', {
							requested: Number(data.requestedCount) || 0,
							generated: Array.isArray(data.questions) ? data.questions.length : 0,
							mode:
								requestParams.testMode ||
								(isFullExam ? 'full-exam' : 'quiz-practice'),
						});
					}
					saveCurrentPaper(data);
					plannerDraft = createPlannerDraft();
					clearPlannerDraft();
					await goto(`/test?id=${data.id}`);
					return;
				} catch (caughtError) {
					if (generationCanceled) {
						error = $t('generationCanceled');
						break;
					}
					const canRetry = caughtError.retryable !== false;
					if (attempt < MAX_RETRIES && canRetry) {
						generationFailed = true;
						triggerVibration(HAPTIC_ERROR);
						window.clearTimeout(generationFailedTimer);
						generationFailedTimer = window.setTimeout(() => {
							generationFailed = false;
						}, 900);
					}
					if (attempt === MAX_RETRIES || !canRetry) {
						track('generate:fail', {
							attempt,
							code: caughtError.code || 'UNKNOWN',
							status: caughtError.status || 0,
							retryable: canRetry,
							elapsedSeconds: Math.floor((Date.now() - generationStartedAt) / 1000),
						});
						error = caughtError.message || $t('errorFailedGenerateAfterAttempts');
						break;
					}
					await new Promise((resolve) => window.setTimeout(resolve, 300 * attempt));
				}
			}
		} finally {
			window.clearInterval(generationTimer);
			window.clearTimeout(generationFailedTimer);
			generationTimer = null;
			generationFailedTimer = null;
			generationCanceled = false;
			generationProgress = null;
			generationDone = false;
			generationFailed = false;
			status = 'idle';
			retryLabel = '';
		}
	}

	function cancelGeneration() {
		if (status !== 'loading') {
			return;
		}
		generationCanceled = true;
		generationAbort?.abort();
		track('generate:cancel', { elapsedSeconds: generationElapsed });
	}

	async function handleGenerate() {
		if (!canGenerate) {
			error = isFullExam ? $t('errorSelectObjectiveExam') : $t('errorProvideTopic');
			return;
		}
		const params =
			isFullExam && selectedExam
				? getExamRequestParams(selectedExam)
				: getQuizRequestParams();
		await runGeneration(params);
	}

	async function handleWizardClose() {
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
		track('history:open-test', { id: testId, source: 'planner' });
		void goto(`/test?id=${testId}`);
	}

	async function quickStartExam(examQuickId) {
		const exam = getIndianExamById(examQuickId);
		if (!exam) return;
		track('generate:quick-start-exam', { examId: examQuickId });
		const params = getExamRequestParams(exam, exam.syllabus || [], '');
		await runGeneration({
			...params,
			numQuestions: Math.min(Number(params.numQuestions) || 10, 10),
		});
	}

	async function startDailyFive() {
		const lastEntry = getHistory()[0];
		const topicSeed = (lastEntry?.topic || '').trim() || $t('dailyFiveFallbackTopic');
		track('generate:quick-start-daily');
		await runGeneration({
			...getQuizRequestParams(),
			topic: topicSeed,
			selectedTopics: [],
			examId: null,
			examName: null,
			testMode: 'quiz-practice',
			numQuestions: 5,
		});
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
	<meta
		name="description"
		content="Create AI-powered quizzes and full-length objective exam papers for UPSC, SSC, Banking, Railways, NEET, JEE and board exams in Hindi and English."
	/>
	<meta name="robots" content="index, follow, max-image-preview:large" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="AI Quiz & Exam Paper Generator for India" />
	<meta
		property="og:description"
		content="Generate objective quiz practice and full-length exam papers for UPSC, SSC, Banking, Railways, NEET, JEE and board exams with AI. Supports Hindi and English."
	/>
	<meta name="twitter:title" content="AI Quiz & Exam Paper Generator for India" />
	<meta
		name="twitter:description"
		content="Generate objective quiz practice and full-length exam papers for Indian exams with AI. UPSC, SSC, Banking, Railways, NEET, JEE. Hindi and English."
	/>
</svelte:head>

<section
	class="container py-4 py-md-5"
	style="padding-top: calc(1.5rem + var(--sat, env(safe-area-inset-top, 0px))); padding-left: calc(1rem + var(--sal, env(safe-area-inset-left, 0px))); padding-right: calc(1rem + var(--sar, env(safe-area-inset-right, 0px)));"
>
	<div class="mx-auto home-wrap">
		<div
			class="text-center mb-4 hero-block"
			class:hero-collapsed={heroCollapsed}
		>
			<h1 class="hero-heading">{$t('homeH1')}</h1>
			<p class="hero-sub">{$t('homeSeoIntro')}</p>
		</div>

		{#snippet planCard()}
			<PreviewCard
				{topic}
				{numQuestions}
				{testType}
				{difficulty}
				language={paperLanguage}
				{examId}
				{isFullExam}
				parsed={parsedFromIntent}
				parsingFailed={intentParseFailed}
				draft={plannerDraft.messages.length === 0}
				checking={previewStatus === 'checking'}
				ongenerate={handleGenerate}
				oneditchip={handlePlannerChipEdit}
				disabled={status === 'loading'}
				{status}
			/>
		{/snippet}

		<div class="intent-section planner-panel mb-4">
			<ChatThread
				messages={plannerDraft.messages}
				pendingClarify={plannerDraft.pendingClarify}
				status={intentStatus}
				planCard={showPlanCard ? planCard : null}
				recentTests={recentTestsView}
				{plannerExamples}
				onquickreply={answerClarification}
				onskip={skipClarification}
				onstartover={resetPlanner}
				onopentest={handleTestNavigate}
				onrecenttouch={() => {
					recentListTouched = true;
				}}
				onexample={sendPlannerIntent}
			></ChatThread>
			<PlannerComposer
				bind:value={intentValue}
				onsubmit={sendPlannerIntent}
				onnavigate={handleTestNavigate}
				disabled={status === 'loading' || isOffline}
				status={intentStatus}
			/>
		</div>
		<div class="daily-five-row mb-4">
			<button
				class="daily-five-btn"
				type="button"
				disabled={status === 'loading'}
				onclick={startDailyFive}
			>
				<span aria-hidden="true">⚡</span> {$t('dailyFive')}
			</button>
			<span class="daily-five-hint">{$t('dailyFiveHint')}</span>
		</div>

		{#if unsubmittedTest?.id}
			<div
				class="alert alert-warning d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3"
			>
				<div>
					<div class="fw-bold">{$t('unsubmittedTest')}</div>
					<div class="small">
						{$t('unsubmittedTestMessagePrefix')} “{unsubmittedTest.topic ||
							$t('testPrefix')}” {$t('unsubmittedTestMessageSuffix')}
					</div>
				</div>
				<a
					class="btn btn-warning btn-sm fw-bold"
					href={`/test?id=${unsubmittedTest.id}`}
					onclick={() => track('home:resume-test')}
				>
					{$t('continueTest')}
				</a>
			</div>
		{/if}

		{#if showReturningCard}
			<div class="returning-card">
				<div>
					<div class="fw-bold">{$t('welcomeBack')}</div>
					<div class="small text-muted">
						{$t('streakLabel', { count: streak?.currentStreak || 0 })}
					</div>
				</div>
				{#if lastTestId}
					<a
						class="btn btn-outline-secondary btn-sm fw-bold"
						href={`/test?id=${lastTestId}`}
						onclick={() => track('home:resume-test')}
					>
						{$t('lastTest')}
					</a>
				{/if}
			</div>
		{/if}

		<QuickStart
			{bookmarkedExams}
			{bookmarkedQuizPresets}
			onQuickStartExam={quickStartExam}
			onQuickStartPreset={quickStartPreset}
			disabled={status === 'loading'}
		/>

		<nav class="popular-exams" aria-label={$t('practiceTitle')}>
			<span class="popular-exams-label">{$t('practiceTitle')}:</span>
			<a href="/practice/ssc-cgl">SSC CGL</a>
			<a href="/practice/ibps-po">IBPS PO</a>
			<a href="/practice/rrb-ntpc-graduate">RRB NTPC</a>
			<a href="/practice/upsc-cse-prelims">UPSC Prelims</a>
			<a href="/practice/neet-ug">NEET</a>
			<a href="/practice/jee-main">JEE Main</a>
			<a class="popular-exams-more" href="/practice">{$t('practiceAllExams')}</a>
		</nav>

		{#if tailoredSummary}
			<div class="tailored-chip">
				<span class="tailored-badge" aria-hidden="true">🎯</span>
				<span class="small">
					<strong>{$t('profileChipLabel')}:</strong>
					{tailoredSummary}
				</span>
				<a class="tailored-edit" href="/profile">{$t('profileChipEdit')}</a>
			</div>
		{/if}

		<div class="manual-section">
			<button
				class="manual-toggle"
				type="button"
				aria-expanded={showManualConfig}
				aria-controls="manual-config-panel"
				onclick={toggleManualConfig}
			>
				{$t('browseTopicsExams')}
			</button>
			{#if showManualConfig}
				<div class="manual-grid" id="manual-config-panel">
					<TopicBrowser
						{selectedCategory}
						{selectedTopics}
						ontopicchange={handleTopicBrowserChange}
					/>
					<ExamBrowser
						{examSearchQuery}
						{examGroupFilter}
						{showBookmarkedExamsOnly}
						{bookmarkedExamIds}
						selectedExamId={examId}
						onexamchange={handleExamBrowserChange}
						onbookmarktoggle={toggleExamBookmark}
						{visibleExams}
					/>
				</div>
			{/if}
		</div>

		{#if status === 'loading'}
			<GenerationTrace
				progress={generationProgress}
				elapsedSeconds={generationElapsed}
				done={generationDone}
				failed={generationFailed}
				onCancel={cancelGeneration}
			/>
		{/if}
		{#if isOffline}
			<div class="alert alert-warning mt-3 mb-0" role="status">
				{$t('offlineAccessHistory')}
			</div>
		{/if}
		{#if retryLabel}
			<div class="alert alert-light border mt-3 mb-0" role="status">{retryLabel}</div>
		{/if}
		{#if error}
			<div class="alert alert-danger mt-3 mb-0" role="alert">{error}</div>
		{/if}

		{#if isAndroidDevice && !isInCapacitorApp}
			<p class="android-link-row">
				<a
					href="/apk/selftest.apk"
					download="selftest.apk"
					onclick={() => track('apk:download')}
				>
					{$t('androidAppDownload')}
				</a>
			</p>
		{/if}
	</div>
</section>

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
		max-height: 260px;
		overflow: hidden;
		opacity: 1;
		transition:
			max-height 0.35s ease,
			opacity 0.25s ease,
			margin-bottom 0.35s ease;
	}

	.hero-block.hero-collapsed {
		max-height: 0;
		margin-bottom: 0;
		opacity: 0;
		pointer-events: none;
	}

	.hero-heading {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text);
		margin: 0;
	}

	.hero-sub {
		margin: 0.5rem auto 0;
		max-width: 36rem;
		color: var(--text-muted);
		font-size: 0.95rem;
		line-height: 1.6;
	}

	.intent-section {
		margin-bottom: 20px;
	}

	.planner-panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		height: clamp(440px, 68dvh, 720px);
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 20px;
		background: var(--surface);
		box-shadow: 0 8px 28px rgba(15, 23, 42, 0.06);
	}

	@media (max-width: 480px) {
		.planner-panel {
			height: clamp(300px, calc(min(var(--vvh, 100dvh), 100dvh) * 0.62), 560px);
			padding: 10px;
			border-radius: 16px;
		}
	}

	.daily-five-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin-top: 10px;
		flex-wrap: wrap;
	}

	.daily-five-btn {
		border: 1px solid color-mix(in srgb, var(--color-brand-600) 35%, transparent);
		background: color-mix(in srgb, var(--color-brand-600) 8%, transparent);
		color: var(--brand-text);
		font-weight: 600;
		font-size: 0.85rem;
		padding: 8px 14px;
		border-radius: 999px;
		min-height: 44px;
		cursor: pointer;
	}

	.daily-five-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.daily-five-hint {
		font-size: 0.76rem;
		color: var(--text-muted);
	}

	.popular-exams {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.35rem 0.5rem;
		margin-top: 12px;
		font-size: 0.8rem;
	}

	.popular-exams-label {
		color: var(--text-muted);
		font-weight: 600;
	}

	.popular-exams a {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		padding: 0 0.6rem;
		color: var(--brand-text);
		font-weight: 600;
		text-decoration: none;
	}

	.popular-exams-more {
		text-decoration: underline !important;
		text-underline-offset: 3px;
	}

	.android-link-row {
		margin: 20px 0 0;
		text-align: center;
		font-size: 0.82rem;
	}

	.returning-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 16px;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}

	.manual-section {
		margin-top: 16px;
	}

	.manual-toggle {
		display: block;
		margin: 0 auto;
		border: 0;
		background: transparent;
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 3px;
		min-height: 44px;
		padding: 8px 12px;
		cursor: pointer;
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
		color: var(--brand-text);
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
