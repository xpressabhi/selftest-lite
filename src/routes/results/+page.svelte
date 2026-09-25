<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, onMount, tick } from 'svelte';
	import AnimatedHeight from '$lib/client/AnimatedHeight.svelte';
	import Icon from '$lib/client/Icon.svelte';
	import { localizedApiError, t } from '$lib/client/i18n';
	import { isDataSaverActive, language } from '$lib/client/preferences';
	import { COUNT_UP_MS, countUpValue, shouldCountUp } from '$lib/client/countUp.js';
	import { HAPTIC_COMMIT, HAPTIC_SUCCESS, triggerVibration } from '$lib/client/haptics';
	import { track } from '$lib/client/telemetry';
	import {
		buildReviewQueue,
		buildScoreComparison,
		buildTopicMasteryItems,
		formatDuration,
		getAchievements,
		getStats,
	} from '$lib/client/learning';
	import MarkdownContent from '$lib/client/MarkdownContent.svelte';
	import TestStatsCard from '$lib/client/TestStatsCard.svelte';
	import QuestionMatching from '$lib/client/QuestionMatching.svelte';
	import QuestionAssertionReasoning from '$lib/client/QuestionAssertionReasoning.svelte';
	import { questionTextFor } from '$lib/shared/questionText';
	import {
		disableReminders,
		enableReminders,
		getReminderHour,
		isReminderEnabled,
		remindersSupported,
		setReminderHour,
	} from '$lib/client/reminders';
	import { showToast } from '$lib/client/toast';
	import { user } from '$lib/client/auth';
	import { requestPersonalize } from '$lib/client/personalize';
	import {
		buildChallengeUrl,
		compareScores,
		parseChallengeParams,
	} from '$lib/client/challenge';
	import { drawScoreCard } from '$lib/client/scoreCard';
	import {
		CARD_HEIGHT,
		CARD_WIDTH,
		canvasToFile,
		cardFilename,
		loadCardLogo,
		shareCardFile,
	} from '$lib/client/cardKit';
	import {
		clearAttemptResult,
		clearDraftAnswers,
		clearDraftFlags,
		clearUnsubmittedTest,
		getAttemptResult,
		getHistory,
		getQuestionBookmarks,
		resolveTestRecord,
		saveCurrentPaper,
		toggleQuestionBookmark,
		upsertHistory,
	} from '$lib/client/storage';

	let questionPaper = $state(null);
	let loading = $state(true);
	let error = $state('');
	let loadingExplanation = $state({});
	let explanationError = $state({});
	let stats = $state(null);
	let achievements = $state([]);
	let topicMastery = $state([]);
	let reviewQueue = $state({ today: [], upcoming: [] });
	let bookmarkedQuestionKeys = $state([]);
	let displayedPercentage = $state(0);
	let scoreSettled = $state(false);
	let bookmarkPulse = $state(null);
	let bookmarkPulseTimer = null;
	let countUpFrame = null;
	let countUpStarted = false;
	let filter = $state('all');
	let resultsHide = $state([]);
	let challenge = $state(null);
	let challengeViewTracked = false;
	let expanded = $state({});
	let expansionInitialized = false;
	const AUTO_EXPLAIN_KEY = 'selftest_auto_explain';
	const COMPARISON_KEYS = {
		best: 'resultsCompareBest',
		ahead: 'resultsCompareAhead',
		behind: 'resultsCompareBehind',
		same: 'resultsCompareSame',
		baseline: 'resultsCompareFirst',
	};
	let autoExplainEnabled = $state(false);
	let autoExplainRunning = $state(false);
	let autoExplainCanceled = false;
	let reportTarget = $state(null);
	let reportSent = $state({});
	let ratingSent = $state(false);
	let historyCount = $state(0);
	let reminderEnabled = $state(false);
	let reminderBusy = $state(false);
	let reminderHour = $state(null);
	const reminderHours = Array.from({ length: 24 }, (_, hour) => hour);
	let comparison = $state(null);
	let shareSheetOpen = $state(false);
	let shareButton = $state();
	let shareSheetWrap = $state();
	let shareSheetFirstItem = $state();
	let reminderToggleEl = $state();
	let showRetakeConfirm = $state(false);
	let retakeTrigger = $state();
	let retakeConfirmButton = $state();

	let challengeOutcome = $derived(
		challenge && questionPaper?.userAnswers
			? compareScores(questionPaper.score ?? 0, challenge.score)
			: null
	);

	// Per-section scores for pattern-based papers. Uses the graded `correct`
	// flags when present and falls back to comparing stored answers.
	let sectionBreakdown = $derived.by(() => {
		const sections = questionPaper?.sections || [];
		const questions = questionPaper?.questions || [];
		if (!sections.length || !questions.length || !questionPaper?.userAnswers) {
			return [];
		}
		return sections.map((section) => {
			const indexes = section.questionIndexes || [];
			let correct = 0;
			for (const index of indexes) {
				const question = questions[index];
				if (!question) {
					continue;
				}
				if (question.correct === true) {
					correct += 1;
				} else if (
					question.correct === undefined &&
					questionPaper.userAnswers[index] === question.answer
				) {
					correct += 1;
				}
			}
			return { id: section.id, name: section.name, correct, total: indexes.length };
		});
	});

	$effect(() => {
		if (challengeOutcome && !challengeViewTracked) {
			challengeViewTracked = true;
			track('results:challenge-view', { outcome: challengeOutcome });
		}
	});

	let wrongIndices = $derived(
		(questionPaper?.questions || [])
			.map((_question, index) => index)
			.filter((index) => {
				const userAnswer = questionPaper?.userAnswers?.[index];
				if (userAnswer == null) {
					return false;
				}
				const question = questionPaper.questions[index];
				const isCorrect = question.correct ?? userAnswer === question.answer;
				return isCorrect === false;
			})
	);

	let totalQuestions = $derived(questionPaper?.questions?.length || 0);
	let percentage = $derived(
		questionPaper?.totalQuestions
			? Math.round((questionPaper.score / questionPaper.totalQuestions) * 100)
			: 0
	);

	let correctCount = $derived(
		(questionPaper?.questions || []).filter(
			(question, index) =>
				(question.correct ?? questionPaper.userAnswers?.[index] === question.answer) ===
				true
		).length
	);
	let unansweredCount = $derived(
		(questionPaper?.questions || []).filter(
			(question, index) => questionPaper.userAnswers?.[index] == null
		).length
	);
	let incorrectCount = $derived(totalQuestions - correctCount - unansweredCount);

	let filteredQuestions = $derived(
		(questionPaper?.questions || [])
			.map((question, index) => ({ question, index }))
			.filter(({ question, index }) => {
				const isCorrect =
					question.correct ?? questionPaper.userAnswers?.[index] === question.answer;
				if (filter === 'correct') {
					return isCorrect === true;
				}
				if (filter === 'incorrect') {
					return isCorrect === false;
				}
				if (filter === 'unanswered') {
					return questionPaper.userAnswers?.[index] == null;
				}
				return true;
			})
	);

	const RING_RADIUS = 42;
	const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

	// Count the score up once the paper arrives, then settle the ring. Skipped
	// for data-saver and reduced-motion users, who see the final value.
	$effect(() => {
		if (!questionPaper || countUpStarted || percentage <= 0) {
			return;
		}
		countUpStarted = true;
		const reduceMotion =
			typeof window !== 'undefined' &&
			window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		if (!shouldCountUp({ dataSaver: $isDataSaverActive, reduceMotion })) {
			displayedPercentage = percentage;
			scoreSettled = true;
			return;
		}
		const startedAt = performance.now();
		const tick = (now) => {
			const elapsed = now - startedAt;
			displayedPercentage = countUpValue(percentage, elapsed, COUNT_UP_MS);
			if (elapsed < COUNT_UP_MS) {
				countUpFrame = requestAnimationFrame(tick);
			} else {
				countUpFrame = null;
				scoreSettled = true;
				triggerVibration(HAPTIC_SUCCESS);
			}
		};
		countUpFrame = requestAnimationFrame(tick);
	});

	onDestroy(() => {
		if (countUpFrame !== null) {
			cancelAnimationFrame(countUpFrame);
		}
		if (bookmarkPulseTimer) {
			clearTimeout(bookmarkPulseTimer);
		}
	});

	$effect(() => {
		if (!questionPaper || expansionInitialized) {
			return;
		}
		expansionInitialized = true;
		const defaults = {};
		questionPaper.questions.forEach((question, index) => {
			const isCorrect =
				question.correct ?? questionPaper.userAnswers?.[index] === question.answer;
			defaults[index] = isCorrect !== true;
		});
		expanded = defaults;
	});

	onMount(async () => {
		try {
			autoExplainEnabled = window.localStorage.getItem(AUTO_EXPLAIN_KEY) === 'true';
		} catch {
			autoExplainEnabled = false;
		}
		historyCount = getHistory().length;
		reminderHour = getReminderHour();
		if (remindersSupported()) {
			void isReminderEnabled().then((enabled) => {
				reminderEnabled = enabled;
			});
		}
		const testId = page.url.searchParams.get('id');
		challenge = parseChallengeParams(page.url.search);
		if (challenge) {
			track('results:challenge-accept', {});
		}
		try {
			let resolved = await resolveTestRecord(testId);
			if (!resolved) {
				error = $t('resultNotFound');
				return;
			}

			const attemptResult = getAttemptResult(testId);
			if (attemptResult?.results) {
				const resultByIndex = new Map(
					attemptResult.results.map((item) => [item.index, item])
				);
				resolved = {
					...resolved,
					...attemptResult,
					userAnswers:
						resolved.userAnswers ||
						Object.fromEntries(
							attemptResult.results.map((item) => [item.index, item.yourAnswer])
						),
					questions: resolved.questions.map((question, index) => {
						const graded = resultByIndex.get(index);
						if (!graded) {
							return question;
						}
						return {
							...question,
							answer: graded.correctAnswer,
							correct: graded.correct,
						};
					}),
				};
			}

			questionPaper = resolved;
			if (!questionPaper.userAnswers) {
				error = $t('testNotSubmitted');
			} else if (
				questionPaper.questions.some(
					(question) =>
						question.correct === undefined && typeof question.answer !== 'string'
				)
			) {
				error = $t('resultNotAvailable');
			}
		} catch (caughtError) {
			error = caughtError.message || $t('failedToLoadResult');
		} finally {
			track('results:view', { id: testId });
			refreshLearningPanels();
			loading = false;
			// Central focus (fail-open, once): expand the Jev-picked panel and
			// collapse low-value ones; the full review list stays available.
			if (questionPaper?.questions?.length) {
				const total = questionPaper.questions.length;
				const wrong = questionPaper.questions.filter(
					(question, index) =>
						(question.correct ?? questionPaper.userAnswers?.[index] === question.answer) === false
				).length;
				void requestPersonalize('results', {
					scorePct: total > 0 ? Math.round(((total - wrong) / total) * 100) : 0,
					wrongCount: wrong,
					total,
				}).then((decision) => {
					if (!decision?.applied) return;
					if (decision.action === 'fix_mistakes' && wrong > 0) {
						filter = 'incorrect';
					}
					if (Array.isArray(decision.hide) && decision.hide.length > 0) {
						resultsHide = decision.hide;
					}
				});
			}
			if (autoExplainEnabled) {
				void runAutoExplain();
			}
		}
	});

	onDestroy(() => {
		autoExplainCanceled = true;
	});

	function refreshLearningPanels() {
		const history = getHistory();
		stats = getStats(history);
		achievements = getAchievements();
		topicMastery = buildTopicMasteryItems(history);
		reviewQueue = buildReviewQueue(history);
		comparison = questionPaper
			? buildScoreComparison(history, questionPaper.id, percentage)
			: null;
		const bookmarkKeys = new Set(
			getQuestionBookmarks().map((item) => `${item.question}::${item.answer}`)
		);
		bookmarkedQuestionKeys = (questionPaper?.questions || [])
			.filter((question) => bookmarkKeys.has(questionKey(question)))
			.map((question) => questionKey(question));
	}

	function questionKey(question) {
		return `${questionTextFor(question)}::${question.answer}`;
	}

	function toggleBookmark(question) {
		const key = questionKey(question);
		const wasBookmarked = bookmarkedQuestionKeys.includes(key);
		toggleQuestionBookmark(question, {
			testId: questionPaper.id,
			topic: questionPaper.topic,
		});
		if (!wasBookmarked) {
			triggerVibration(HAPTIC_COMMIT);
			bookmarkPulse = key;
			window.clearTimeout(bookmarkPulseTimer);
			bookmarkPulseTimer = window.setTimeout(() => {
				bookmarkPulse = null;
			}, 450);
		}
		track('results:bookmark-question', { q: questionTextFor(question).slice(0, 40) });
		refreshLearningPanels();
	}

	function toggleExpanded(index) {
		expanded = {
			...expanded,
			[index]: !expanded[index],
		};
		track('results:toggle-question', { q: index });
	}

	function reviewWrongAnswers() {
		filter = 'incorrect';
		const firstWrong = wrongIndices[0];
		if (firstWrong === undefined) {
			return;
		}
		expanded = { ...expanded, [firstWrong]: true };
		requestAnimationFrame(() => {
			const prefersReducedMotion = window.matchMedia(
				'(prefers-reduced-motion: reduce)'
			).matches;
			document.getElementById(`question-${firstWrong}`)?.scrollIntoView({
				behavior: prefersReducedMotion ? 'auto' : 'smooth',
				block: 'start',
			});
		});
	}

	function practiceWeakQuestions() {
		const weakQuestions = wrongIndices
			.map((index) => questionPaper.questions[index])
			.filter(Boolean)
			.map((question) => {
				// Preserve structured format fields (matching columns,
				// assertion/reason) so the review paper renders correctly.
				const copy = {
					question: question.question,
					options: [...(question.options || [])],
					answer: question.answer,
				};
				if (question.format) {
					copy.format = question.format;
				}
				if (Array.isArray(question.columnA)) {
					copy.columnA = [...question.columnA];
				}
				if (Array.isArray(question.columnB)) {
					copy.columnB = [...question.columnB];
				}
				if (typeof question.assertion === 'string') {
					copy.assertion = question.assertion;
				}
				if (typeof question.reason === 'string') {
					copy.reason = question.reason;
				}
				return copy;
			});
		if (weakQuestions.length === 0) {
			return;
		}
		track('results:practice-weak', { count: weakQuestions.length });
		saveCurrentPaper({
			...questionPaper,
			id: `review-${questionPaper.id}-${Date.now()}`,
			topic: `${questionPaper.topic}: ${$t('reviewWrongAnswers')}`,
			questions: weakQuestions,
			userAnswers: undefined,
			score: undefined,
			totalQuestions: weakQuestions.length,
		});
		void goto('/test');
	}

	async function runAutoExplain() {
		if (autoExplainRunning || !questionPaper || $isDataSaverActive) {
			return;
		}
		const targets = wrongIndices
			.filter((index) => !questionPaper.questions[index]?.explanation)
			.slice(0, 5);
		if (targets.length === 0) {
			return;
		}
		autoExplainRunning = true;
		autoExplainCanceled = false;
		try {
			for (const index of targets) {
				if (autoExplainCanceled) {
					break;
				}
				await fetchExplanation(index, questionPaper.questions[index]);
			}
		} finally {
			autoExplainRunning = false;
		}
	}

	function toggleAutoExplain() {
		autoExplainEnabled = !autoExplainEnabled;
		try {
			window.localStorage.setItem(AUTO_EXPLAIN_KEY, String(autoExplainEnabled));
		} catch {
			// Preference persistence is best-effort.
		}
		track('results:auto-explain-toggle', { enabled: autoExplainEnabled });
		if (autoExplainEnabled) {
			void runAutoExplain();
		} else {
			autoExplainCanceled = true;
		}
	}

	function reportQuestion(index) {
		reportTarget = index;
	}

	function submitQuestionReport(reason) {
		if (reportTarget === null || !questionPaper) {
			return;
		}
		track('question:report', {
			testId: questionPaper.id,
			index: reportTarget,
			reason,
		});
		reportSent = { ...reportSent, [reportTarget]: true };
		reportTarget = null;
		showToast($t('reportThanks'), 'success');
	}

	function rateTest(rating) {
		if (ratingSent || !questionPaper) {
			return;
		}
		ratingSent = true;
		track('test:rating', {
			rating,
			testId: questionPaper.id,
			score: questionPaper.score,
			total: questionPaper.totalQuestions,
		});
		showToast($t('ratingThanks'), 'success');
	}

	async function toggleReminders(event) {
		// currentTarget is only valid during dispatch, so capture it first.
		const input = event.currentTarget;
		reminderBusy = true;
		const result = reminderEnabled ? await disableReminders() : await enableReminders();
		if (result.ok) {
			reminderEnabled = !reminderEnabled;
		} else {
			// The checkbox toggles visually on click; put it back when the
			// change did not stick.
			input.checked = reminderEnabled;
			const message =
				result.reason === 'denied'
					? $t('reminderDenied')
					: result.reason === 'unconfigured'
						? $t('reminderUnconfigured')
						: $t('reminderFailed');
			showToast(message, 'warning');
		}
		reminderBusy = false;
	}

	async function revealReminderSettings() {
		await tick();
		reminderToggleEl?.focus({ preventScroll: true });
		reminderToggleEl?.scrollIntoView({
			behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
				? 'auto'
				: 'smooth',
			block: 'center',
		});
	}

	const HOUR_LOCALES = { hindi: 'hi-IN', english: 'en-IN' };

	function formatHour(hour) {
		const locale = HOUR_LOCALES[$language] || 'en-IN';
		return new Intl.DateTimeFormat(locale, { hour: 'numeric', hour12: true }).format(
			new Date(2000, 0, 1, hour, 0, 0)
		);
	}

	async function changeReminderTime(event) {
		// currentTarget is only valid during dispatch, so capture it first.
		const select = event.currentTarget;
		const hour = select.value === '' ? null : Number(select.value);
		reminderBusy = true;
		const result = await setReminderHour(hour);
		if (result.ok) {
			reminderHour = hour;
			showToast(
				hour === null
					? $t('reminderTimeSmart')
					: $t('reminderTimeSet', { time: formatHour(hour) }),
				'success'
			);
		} else {
			select.value = reminderHour === null ? '' : String(reminderHour);
			showToast($t('reminderFailed'), 'warning');
		}
		reminderBusy = false;
	}

	function reviewHref(item) {
		const params = new URLSearchParams({
			mode: 'quiz-practice',
			topic: item.topic,
			difficulty: item.difficulty,
			testType: item.testType,
			numQuestions: String(item.numQuestions),
			paperLanguage: item.paperLanguage,
		});
		return `/?${params.toString()}`;
	}

	async function fetchExplanation(index, question) {
		if (loadingExplanation[index] || question.explanation) {
			return;
		}
		track('results:explain', { q: index });

		loadingExplanation = {
			...loadingExplanation,
			[index]: true,
		};
		explanationError = {
			...explanationError,
			[index]: '',
		};

		try {
			const response = await fetch('/api/explain', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					topic: questionPaper.topic,
					question: questionTextFor(question),
					answer: question.answer,
					language: questionPaper.requestParams?.language || 'english',
				}),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(localizedApiError(data, $t, response.status));
			}

			const questions = questionPaper.questions.map((item, questionIndex) =>
				questionIndex === index
					? {
							...item,
							explanation: data.explanation,
						}
					: item
			);
			questionPaper = {
				...questionPaper,
				questions,
			};
			upsertHistory(questionPaper);
		} catch (caughtError) {
			track('results:explain-fail', { q: index });
			explanationError = {
				...explanationError,
				[index]: caughtError.message,
			};
		} finally {
			loadingExplanation = {
				...loadingExplanation,
				[index]: false,
			};
		}
	}

	function challengeShareUrl() {
		const base = `/test?id=${encodeURIComponent(questionPaper.id)}`;
		if (!/^\d+$/.test(String(questionPaper.id))) {
			return `${window.location.origin}${base}`;
		}
		const name = ($user?.name || '').trim() || $t('challengeDefault');
		return `${window.location.origin}${buildChallengeUrl(base, questionPaper.score ?? 0, name)}`;
	}

	async function shareResult() {
		track('results:share');
		const url = challengeShareUrl();
		const title = `${questionPaper.topic} - ${questionPaper.questions.length} ${$t('questions')}`;
		const text = $t('shareResultText', {
			score: questionPaper.score ?? 0,
			total: questionPaper.totalQuestions ?? totalQuestions,
			percentage,
			topic: questionPaper.topic,
		});
		if (navigator.share) {
			await navigator.share({
				title,
				text,
				url,
			});
			return;
		}
		await navigator.clipboard.writeText(`${text}\n${url}`);
		showToast($t('shareLinkCopied'), 'success');
	}

	async function shareCard() {
		if (!questionPaper) {
			return;
		}
		track('results:share-card');
		try {
			const canvas = document.createElement('canvas');
			canvas.width = CARD_WIDTH;
			canvas.height = CARD_HEIGHT;
			const numericId = /^\d+$/.test(String(questionPaper.id));
			// The card prints a clean, short link; the share text keeps the
			// full challenge URL with score and name.
			const displayLink = numericId
				? `${window.location.origin}/test?id=${encodeURIComponent(questionPaper.id)}`
				: '';
			const logo = await loadCardLogo();
			const drawn = drawScoreCard(
				canvas,
				{
					topic: questionPaper.topic || '',
					score: questionPaper.score ?? 0,
					total: questionPaper.totalQuestions ?? totalQuestions,
					pct: percentage,
					timeLabel: `${$t('timeSpent')}: ${formatDuration(questionPaper.timeTaken || 0, $t('minuteShort'), $t('hourShort'))}`,
					challenge: $t('challengeCta', {
						score: questionPaper.score ?? 0,
						total: questionPaper.totalQuestions ?? totalQuestions,
					}),
					link: displayLink,
				},
				logo
			);
			if (!drawn) {
				throw new Error('card');
			}
			const file = await canvasToFile(canvas, cardFilename('score'));
			const result = await shareCardFile(file, {
				title: questionPaper.topic,
				text: $t('shareResultText', {
					score: questionPaper.score ?? 0,
					total: questionPaper.totalQuestions ?? totalQuestions,
					percentage,
					topic: questionPaper.topic,
				}),
				url: numericId ? challengeShareUrl() : '',
			});
			if (result === 'downloaded') {
				showToast($t('cardSaved'), 'success');
			} else if (result === 'failed') {
				showToast($t('cardShareFailed'), 'warning');
			}
		} catch {
			showToast($t('cardShareFailed'), 'warning');
		}
	}

	async function toggleShareSheet() {
		shareSheetOpen = !shareSheetOpen;
		if (shareSheetOpen) {
			await tick();
			shareSheetFirstItem?.focus({ preventScroll: true });
		}
	}

	function closeShareSheet(restoreFocus = true) {
		if (!shareSheetOpen) {
			return;
		}
		shareSheetOpen = false;
		if (restoreFocus) {
			shareButton?.focus({ preventScroll: true });
		}
	}

	function handleShareSheetKeydown(event) {
		if (event.key === 'Escape') {
			closeShareSheet();
		}
	}

	function handleDocumentClick(event) {
		if (!shareSheetOpen) {
			return;
		}
		const target = event.target;
		if (target instanceof Node && shareSheetWrap?.contains(target)) {
			return;
		}
		closeShareSheet(false);
	}

	async function runShareAction(action) {
		closeShareSheet();
		if (action === 'link') {
			await shareResult();
			return;
		}
		await shareCard();
	}

	function printResult() {
		window.print();
		track('results:print');
	}

	function practiceMoreHref() {
		const requestParams = questionPaper?.requestParams || {};
		const params = new URLSearchParams({
			mode: 'quiz-practice',
			topic: questionPaper?.topic || '',
			difficulty: requestParams.difficulty || 'intermediate',
			testType: requestParams.testType || 'multiple-choice',
			numQuestions: String(Math.min(20, Number(requestParams.numQuestions) || 10)),
			paperLanguage: requestParams.language || 'english',
		});
		return `/?${params.toString()}`;
	}

	async function requestRetake() {
		showRetakeConfirm = true;
		await tick();
		retakeConfirmButton?.focus({ preventScroll: true });
	}

	async function cancelRetake() {
		showRetakeConfirm = false;
		await tick();
		retakeTrigger?.focus({ preventScroll: true });
	}

	function retakeTest() {
		if (!questionPaper?.id) {
			return;
		}
		showRetakeConfirm = false;
		track('results:retake', { id: questionPaper.id });
		const stripped = { ...questionPaper };
		delete stripped.userAnswers;
		delete stripped.score;
		delete stripped.totalQuestions;
		delete stripped.timeTaken;
		clearAttemptResult(questionPaper.id);
		clearDraftAnswers(questionPaper.id);
		clearDraftFlags(questionPaper.id);
		clearUnsubmittedTest(questionPaper.id);
		upsertHistory(stripped);
		void goto(`/test?id=${encodeURIComponent(questionPaper.id)}`);
	}
</script>

<svelte:head>
	<title>{questionPaper?.topic || $t('testResults')} | selftest.in</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<svelte:window onkeydown={handleShareSheetKeydown} onclick={handleDocumentClick} />

<section class="container py-4">
	{#if loading}
		<div class="py-5 text-center">
			<div class="thinking-dots" role="status" aria-label={$t('loading')}>
				<span></span><span></span><span></span>
			</div>
			<p class="text-muted mt-3">{$t('loading')}</p>
		</div>
	{:else if error}
		<div class="alert alert-warning" role="alert">{error}</div>
		<div class="d-flex flex-wrap gap-2">
			{#if questionPaper?.id && !questionPaper.userAnswers}
				<a
					class="btn btn-primary"
					href={`/test?id=${encodeURIComponent(questionPaper.id)}`}
				>
					{$t('backToTest')}
				</a>
			{/if}
			<a class="btn btn-outline-primary" href="/history">{$t('history')}</a>
		</div>
	{:else if questionPaper}
		<div class="result-hero-card mb-4">
			<div class="hero-top">
				<span class="hero-eyebrow">{$t('resultsHeroEyebrow')}</span>
				<div class="hero-share-wrap" bind:this={shareSheetWrap}>
					<button
						bind:this={shareButton}
						class="hero-share"
						type="button"
						aria-expanded={shareSheetOpen}
						aria-controls="result-share-sheet"
						onclick={toggleShareSheet}
					>
						<span class="visually-hidden">{$t('share')}</span>
						<Icon name="share" size={16} />
					</button>
					{#if shareSheetOpen}
						<div
							id="result-share-sheet"
							class="hero-share-sheet"
							role="menu"
							aria-label={$t('share')}
						>
							<button
								bind:this={shareSheetFirstItem}
								class="share-sheet-item"
								type="button"
								role="menuitem"
								onclick={() => runShareAction('link')}
							>
								{$t('resultsShareLink')}
							</button>
							<button
								class="share-sheet-item"
								type="button"
								role="menuitem"
								onclick={() => runShareAction('card')}
							>
								{$t('resultsShareCard')}
							</button>
						</div>
					{/if}
				</div>
			</div>

			<div class="hero-body">
				<h1 class="hero-topic">
					<MarkdownContent content={questionPaper.topic} tag="span" />
				</h1>

				<div class="hero-score">
					<div class="hero-ring-wrap">
						<div
							class="score-ring"
							class:settled={scoreSettled}
							role="img"
							aria-label={`${percentage}%`}
						>
							<svg viewBox="0 0 100 100" aria-hidden="true">
								<circle class="ring-track" cx="50" cy="50" r={RING_RADIUS}></circle>
								<circle
									class="ring-progress"
									cx="50"
									cy="50"
									r={RING_RADIUS}
									stroke-dasharray={RING_CIRCUMFERENCE}
									stroke-dashoffset={RING_CIRCUMFERENCE * (1 - percentage / 100)}
								></circle>
							</svg>
							<span class="score-ring-label">
								<span class="score-ring-pct">{displayedPercentage}%</span>
								<span class="score-ring-sub">
									{$t('resultsCorrectOf', {
										correct: correctCount,
										total: questionPaper.totalQuestions ?? totalQuestions,
									})}
								</span>
							</span>
						</div>
					</div>
					<p class="hero-meta">
						{formatDuration(questionPaper.timeTaken || 0, $t('minuteShort'), $t('hourShort'))}
						&middot;
						{$t('questionsCountFormat', {
							count: questionPaper.totalQuestions ?? totalQuestions,
						})}
					</p>
					{#if questionPaper.marks !== undefined && questionPaper.marks !== null && questionPaper.totalMarks}
						<span class="hero-compare is-best">
							{$t('resultsMarksOf', {
								marks: questionPaper.marks,
								total: questionPaper.totalMarks,
							})}
						</span>
					{/if}
					{#if comparison}
						<span class="hero-compare is-{comparison.state}">
							{$t(COMPARISON_KEYS[comparison.state], { delta: comparison.delta })}
						</span>
					{/if}
				</div>

				{#if wrongIndices.length > 0}
					<button class="hero-cta no-print" type="button" onclick={practiceWeakQuestions}>
						<Icon name="zap" size={18} />
						{$t('practiceWeak', { count: wrongIndices.length })}
						<Icon name="arrow-right" size={18} />
					</button>
				{:else}
					<a class="hero-cta no-print" href={practiceMoreHref()}>
						{$t('resultsPracticeMoreCta')}
						<Icon name="arrow-right" size={18} />
					</a>
				{/if}
			</div>
		</div>

		<div class="hero-links no-print">
			{#if wrongIndices.length > 0}
				<button class="result-link" type="button" onclick={reviewWrongAnswers}>
					{$t('reviewWrongAnswers')}
				</button>
			{/if}
			<a class="result-link" href="/">{$t('newQuizShort')}</a>
		</div>

		<div class="hero-utility no-print">
			<button class="utility-link" type="button" onclick={printResult}>{$t('print')}</button>
			<button bind:this={retakeTrigger} class="utility-link" type="button" onclick={requestRetake}>
				{$t('retakeTest')}
			</button>
			<span class="utility-id">{$t('testId')}: {questionPaper.id}</span>
			{#if bookmarkedQuestionKeys.length > 0}
				<span class="bookmark-count" aria-hidden="true">
					<Icon name="bookmark" size={14} />
					{#key bookmarkedQuestionKeys.length}
						<span class="bookmark-number">{bookmarkedQuestionKeys.length}</span>
					{/key}
				</span>
			{/if}
			{#if remindersSupported() && historyCount >= 1 && !reminderEnabled}
				<button class="utility-link reminder-link" type="button" onclick={revealReminderSettings}>
					<span class="reminder-link-icon" aria-hidden="true">
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							width="14"
							height="14"
						>
							<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
							<path d="M13.7 21a2 2 0 0 1-3.4 0" />
						</svg>
					</span>
					{$t('dailyReminder')}
					<span class="review-chevron" aria-hidden="true">
						<Icon name="chevron-down" size={16} />
					</span>
				</button>
			{/if}
		</div>

		{#if showRetakeConfirm}
			<div
				class="retake-confirm result-retake no-print"
				role="group"
				aria-label={$t('retakeConfirmTitle')}
			>
				<p class="retake-confirm-title">{$t('retakeConfirmTitle')}</p>
				<p class="retake-confirm-body">{$t('retakeConfirmBody')}</p>
				<div class="d-flex flex-wrap gap-2">
					<button
						bind:this={retakeConfirmButton}
						class="btn btn-sm btn-danger"
						type="button"
						onclick={retakeTest}
					>
						{$t('retakeTest')}
					</button>
					<button
						class="btn btn-sm btn-outline-secondary"
						type="button"
						onclick={cancelRetake}
					>
						{$t('cancel')}
					</button>
				</div>
			</div>
		{/if}


		{#if challengeOutcome}
			<section class="challenge-card bg-body border rounded-3 p-3 mb-4" aria-live="polite">
				<p class="fw-bold mb-1">
					{$t('challengeVs', { by: challenge.by, score: challenge.score })}
				</p>
				<p class="mb-2">
					{$t(
						challengeOutcome === 'win'
							? 'challengeWin'
							: challengeOutcome === 'lose'
								? 'challengeLose'
								: 'challengeDraw'
					)}
					<span class="text-muted small">
						({questionPaper.score ?? 0}/{questionPaper.totalQuestions ?? totalQuestions})
					</span>
				</p>
				<button
					class="btn btn-sm btn-warning"
					type="button"
					onclick={shareResult}
				>
					{$t('challengeBack')}
				</button>
			</section>
		{/if}

		{#if questionPaper?.id}
			<TestStatsCard testId={questionPaper.id} />
		{/if}

		{#if questionPaper?.examMeta && (questionPaper.examMeta.schoolName || questionPaper.examMeta.examName)}
			<p class="text-muted small mb-3">
				{[
					questionPaper.examMeta.schoolName,
					questionPaper.examMeta.examName,
					questionPaper.examMeta.patternYear
						? $t('examPaperPatternMetaShort', {
								year: questionPaper.examMeta.patternYear,
							})
						: null,
				]
					.filter(Boolean)
					.join(' · ')}
			</p>
		{/if}

		{#if sectionBreakdown.length > 0}
			<section class="section-breakdown bg-body border rounded-3 p-3 mb-4">
				<h2 class="h6 fw-bold mb-2">{$t('sectionBreakdownTitle')}</h2>
				<ul class="section-breakdown-list">
					{#each sectionBreakdown as section (section.id)}
						<li class="section-breakdown-row">
							<span class="section-breakdown-name">{section.name}</span>
							<span class="section-breakdown-score">{section.correct}/{section.total}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<div
			class="filter-bar bg-body border rounded-3 p-2 mb-4"
			role="group"
			aria-label={$t('reviewAnswers')}
		>
			<button
				class="filter-chip"
				class:active={filter === 'all'}
				type="button"
				aria-pressed={filter === 'all'}
				onclick={() => (filter = 'all')}
			>
				{$t('filterAll')}<span class="filter-count">{totalQuestions}</span>
			</button>
			<button
				class="filter-chip"
				class:active={filter === 'correct'}
				type="button"
				aria-pressed={filter === 'correct'}
				onclick={() => (filter = 'correct')}
			>
				{$t('filterCorrect')}<span class="filter-count">{correctCount}</span>
			</button>
			<button
				class="filter-chip"
				class:active={filter === 'incorrect'}
				type="button"
				aria-pressed={filter === 'incorrect'}
				onclick={() => (filter = 'incorrect')}
			>
				{$t('filterIncorrect')}<span class="filter-count">{incorrectCount}</span>
			</button>
			<button
				class="filter-chip"
				class:active={filter === 'unanswered'}
				type="button"
				aria-pressed={filter === 'unanswered'}
				onclick={() => (filter = 'unanswered')}
			>
				{$t('filterUnanswered')}<span class="filter-count">{unansweredCount}</span>
			</button>
		</div>

		<label class="auto-explain-row no-print">
			<input
				type="checkbox"
				checked={autoExplainEnabled}
				disabled={$isDataSaverActive}
				onchange={toggleAutoExplain}
			/>
			<span class="small text-muted">
				{$t('autoExplainWrong')}
				{#if autoExplainRunning}&middot; {$t('explainingProgress')}{/if}
			</span>
		</label>
		{#if $isDataSaverActive}
			<p class="auto-explain-note small text-muted no-print">{$t('autoExplainDataSaver')}</p>
		{/if}

		<div class="row g-3 mb-4">
			<div class="col-md-6">
				<section class="result-panel bg-body border rounded-3 p-3">
					<h2 class="h6 fw-bold">{$t('yourProgress')}</h2>
					<div class="stats-grid">
						<div>
							<strong>{stats?.totalTests || 0}</strong><span>{$t('quizzes')}</span>
						</div>
						<div>
							<strong>{stats?.averageScore || 0}%</strong><span>{$t('avgScore')}</span
							>
						</div>
						<div>
							<strong>{stats?.totalQuestions || 0}</strong><span
								>{$t('questionsHeading')}</span
							>
						</div>
						<div>
							<strong
								>{formatDuration(
									stats?.totalTime || 0,
									$t('minuteShort'),
									$t('hourShort')
								)}</strong
							><span>{$t('timeSpent')}</span>
						</div>
					</div>
				</section>
			</div>
		</div>

		{#if achievements.some((item) => item.unlocked) || topicMastery.length > 0}
			<div class="row g-3 mb-4">
				{#if !resultsHide.includes('achievements')}
					<section class="col-lg-6">
					<div class="result-panel bg-body border rounded-3 p-3">
						<h2 class="h6 fw-bold">{$t('achievements')}</h2>
						<div class="d-flex flex-wrap gap-2">
							{#each achievements
								.filter((item) => item.unlocked)
								.slice(0, 6) as achievement (achievement.id)}
								<span class="badge text-bg-success achievement-badge"
									>{$t(`achievement_${achievement.id}_title`)}</span
								>
							{/each}
						</div>
					</div>
				</section>
				{/if}
				<section class="col-lg-6">
					<div class="result-panel bg-body border rounded-3 p-3">
						<h2 class="h6 fw-bold">{$t('topicMasteryTitle')}</h2>
						{#each topicMastery as item (item.id)}
							<div class="d-flex justify-content-between gap-3 border-bottom py-2">
								<span class="text-truncate">{item.topic}</span>
								<span
									class={item.status === 'strong'
										? 'text-success'
										: 'text-warning'}
								>
									{item.latestAccuracy}%
								</span>
							</div>
						{/each}
					</div>
				</section>
			</div>
		{/if}

		{#if (reviewQueue.today.length > 0 || reviewQueue.upcoming.length > 0) && !resultsHide.includes('review-queue')}
			<section class="bg-body border rounded-3 p-3 mb-4">
				<h2 class="h6 fw-bold">{$t('reviewQueueTitle')}</h2>
				<p class="text-muted small">{$t('reviewQueueBody')}</p>
				<div class="d-grid gap-2">
					{#each [...reviewQueue.today, ...reviewQueue.upcoming].slice(0, 4) as item (item.id)}
						<a class="review-item" href={reviewHref(item)}>
							<span>{item.topic}</span>
							<strong>{item.accuracy}%</strong>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		{#if filteredQuestions.length === 0}
			<div class="bg-body border rounded-3 p-4 mb-4 text-center text-muted">
				{$t('noFilteredResults')}
			</div>
		{/if}

		<div class="d-grid gap-3">
			{#each filteredQuestions as { question, index } (`${index}-${question.question}`)}
				{@const userAnswer = questionPaper.userAnswers?.[index]}
				{@const isCorrect = question.correct ?? userAnswer === question.answer}
				<article id={`question-${index}`} class="bg-body border rounded-3 p-3 shadow-sm">
					<button
						class="review-card-head"
						type="button"
						aria-expanded={expanded[index] === true}
						onclick={() => toggleExpanded(index)}
					>
						<span class="review-card-question">
							<span class="review-card-number">{index + 1}.</span>
							<MarkdownContent
								content={question.question?.trim() ||
									(question.format === 'assertion-reasoning'
										? $t('assertionReasoning')
										: '')}
								links="text"
							/>
						</span>
						<span
							class="badge"
							class:bg-success={isCorrect}
							class:bg-danger={!isCorrect}
						>
							{isCorrect
								? $t('correct')
								: userAnswer == null
									? $t('notAnswered')
									: $t('incorrect')}
						</span>
						<span
							class="review-chevron"
							class:open={expanded[index] === true}
							aria-hidden="true"
						>
							<Icon name="chevron-down" size={16} />
						</span>
					</button>
					<AnimatedHeight class="review-region">
						{#if expanded[index] === true}
							<div class="review-card-body">
								<button
									class="btn btn-sm btn-outline-secondary mb-2 no-print bookmark-btn"
									class:is-pulsing={bookmarkPulse === questionKey(question)}
									type="button"
									onclick={() => toggleBookmark(question)}
								>
									<span class="bookmark-flip" aria-hidden="true">
										<Icon name="bookmark" size={14} />
									</span>
									{bookmarkedQuestionKeys.includes(questionKey(question))
										? $t('removeQuestionBookmark')
										: $t('bookmarkQuestion')}
								</button>
								{#if reportSent[index]}
									<span class="badge text-bg-secondary mb-2 ms-1 no-print"
										>{$t('reportThanks')}</span
									>
								{:else if reportTarget === index}
									<span class="d-inline-flex flex-wrap gap-1 mb-2 ms-1 no-print">
										<button
											class="btn btn-sm btn-outline-danger"
											type="button"
											onclick={() => submitQuestionReport('wrong-key')}
										>
											{$t('reportWrongAnswer')}
										</button>
										<button
											class="btn btn-sm btn-outline-secondary"
											type="button"
											onclick={() => submitQuestionReport('ambiguous')}
										>
											{$t('reportAmbiguous')}
										</button>
										<button
											class="btn btn-sm btn-outline-secondary"
											type="button"
											onclick={() => submitQuestionReport('off-syllabus')}
										>
											{$t('reportOffSyllabus')}
										</button>
									</span>
								{:else}
									<button
										class="btn btn-sm btn-outline-secondary mb-2 ms-1 no-print"
										type="button"
										onclick={() => reportQuestion(index)}
									>
										{$t('reportQuestion')}
									</button>
								{/if}
								{#if question.format === 'matching'}
									<QuestionMatching {question} />
								{:else if question.format === 'assertion-reasoning'}
									<QuestionAssertionReasoning {question} />
								{/if}
								<p class="mb-1">
									<span class="fw-semibold">{$t('yourAnswer')}:</span>
									<span
										class:text-success={isCorrect}
										class:text-danger={!isCorrect}
									>
										<MarkdownContent
											content={userAnswer || $t('notAnswered')}
										/>
									</span>
								</p>
								{#if question.options?.length}
									<div class="answer-options mb-3">
										<div class="small fw-semibold text-muted mb-1">
											{$t('options')}
										</div>
										{#each question.options as option, optionIndex (optionIndex)}
											{@const optionIsCorrect = option === question.answer}
											{@const optionIsUserAnswer = option === userAnswer}
											<div
												class="review-option"
												class:correct-option={optionIsCorrect}
												class:user-option={optionIsUserAnswer &&
													!optionIsCorrect}
											>
												{#if optionIsCorrect || optionIsUserAnswer}
													<span
														class="review-option-glyph"
														aria-hidden="true"
													>
														<Icon
															name={optionIsCorrect ? 'check' : 'x'}
															size={16}
														/>
													</span>
												{/if}
												<MarkdownContent content={option} />
												<span class="visually-hidden">
													{optionIsCorrect
														? $t('correct')
														: optionIsUserAnswer
															? $t('incorrect')
															: ''}
												</span>
											</div>
										{/each}
									</div>
								{/if}
								<p class="mb-3">
									<span class="fw-semibold">{$t('correctAnswer')}:</span>
									<span class="text-success"
										><MarkdownContent content={question.answer} /></span
									>
								</p>
								<AnimatedHeight class="explanation-region" aria-live="polite">
									{#if question.explanation}
										<div class="alert alert-light border mb-0">
											<MarkdownContent content={question.explanation} />
										</div>
									{:else}
										<button
											class="btn btn-sm btn-outline-primary"
											class:explanation-loading={loadingExplanation[index]}
											type="button"
											disabled={loadingExplanation[index]}
											onclick={() => fetchExplanation(index, question)}
										>
											{#if loadingExplanation[index]}
												<span class="thinking-dots">
													<span></span><span></span><span></span>
												</span>
												<span style="margin-left:6px"
													>{$t('generatingExplanation')}</span
												>
											{:else}
												{$t('generateExplanation')}
											{/if}
										</button>
									{/if}
								</AnimatedHeight>
								{#if explanationError[index]}
									<div
										class="text-danger small mt-2 d-flex flex-wrap align-items-center gap-2"
										role="status"
									>
										<span>{explanationError[index]}</span>
										<button
											class="btn btn-sm btn-outline-danger"
											type="button"
											onclick={() => fetchExplanation(index, question)}
										>
											{$t('tryAgain')}
										</button>
									</div>
								{/if}
							</div>
						{/if}
					</AnimatedHeight>
				</article>
			{/each}
		</div>

		<footer class="result-footer no-print">
			<div class="result-footer-card">
				<span class="result-footer-label">{$t('rateTest')}</span>
				<div class="result-footer-rating">
					<button
						class="btn btn-sm btn-outline-success"
						type="button"
						aria-label={$t('rateTestUp')}
						onclick={() => rateTest('up')}
					>
						<Icon name="thumb-up" size={18} />
					</button>
					<button
						class="btn btn-sm btn-outline-danger"
						type="button"
						aria-label={$t('rateTestDown')}
						onclick={() => rateTest('down')}
					>
						<Icon name="thumb-down" size={18} />
					</button>
				</div>
				{#if remindersSupported() && historyCount >= 1}
					<div class="result-footer-reminder">
						<label class="d-inline-flex align-items-center gap-2">
							<input
								bind:this={reminderToggleEl}
								type="checkbox"
								checked={reminderEnabled}
								disabled={reminderBusy}
								onchange={toggleReminders}
							/>
							<span class="small text-muted">{$t('dailyReminder')}</span>
						</label>
						<label class="d-inline-flex align-items-center gap-2">
							<span class="small text-muted">{$t('reminderTimeLabel')}</span>
							<select
								class="form-select w-auto"
								value={reminderHour === null ? '' : String(reminderHour)}
								disabled={reminderBusy}
								onchange={changeReminderTime}
							>
								<option value="">{$t('reminderTimeSmart')}</option>
								{#each reminderHours as hour (hour)}
									<option value={String(hour)}>{formatHour(hour)}</option>
								{/each}
							</select>
						</label>
					</div>
				{/if}
			</div>
		</footer>
	{/if}
</section>

<style>
	.result-hero-card {
		--hero-text: var(--text);
		--hero-muted: var(--text-muted);
		position: relative;
		overflow: hidden;
		max-width: 860px;
		padding: 18px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: color-mix(in srgb, var(--color-brand-600) 5%, var(--surface));
		box-shadow: 0 12px 30px -24px rgba(15, 23, 42, 0.4);
		color: var(--hero-text);
	}

	@media (min-width: 768px) {
		.result-hero-card {
			padding: 24px;
		}
	}

	.hero-top {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	.hero-eyebrow {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--brand-text);
	}

	.hero-share-wrap {
		position: relative;
	}

	.hero-share {
		position: relative;
		display: grid;
		width: 34px;
		height: 34px;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface-muted);
		color: var(--brand-text);
	}

	.hero-share:hover,
	.hero-share:focus-visible {
		border-color: var(--brand-text);
		background: color-mix(in srgb, var(--color-brand-600) 10%, var(--surface));
	}

	.hero-share:active {
		transform: translateY(1px);
	}

	/* Expand the 34px control to a 44px touch target. */
	.hero-share::after {
		position: absolute;
		inset: -5px;
		content: '';
	}

	.hero-share-sheet {
		position: absolute;
		z-index: 30;
		top: calc(100% + 8px);
		right: 0;
		display: grid;
		min-width: 210px;
		gap: 2px;
		padding: 6px;
		border: 1px solid var(--line);
		border-radius: var(--radius-overlay);
		background: var(--surface);
		box-shadow: 0 18px 36px -16px rgba(15, 23, 42, 0.35);
	}

	.share-sheet-item {
		display: flex;
		min-height: 44px;
		align-items: center;
		padding: 0 12px;
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		color: var(--text);
		font-size: 0.9rem;
		font-weight: 600;
		text-align: left;
	}

	.share-sheet-item:hover,
	.share-sheet-item:focus-visible {
		background: var(--surface-muted);
	}

	.hero-body {
		max-width: 440px;
		margin: 0 auto;
	}

	.hero-topic {
		margin: 12px 0 16px;
		color: var(--hero-text);
		font-size: 1rem;
		font-weight: 650;
		line-height: 1.35;
	}

	.hero-score {
		display: grid;
		justify-items: center;
	}

	.hero-ring-wrap {
		position: relative;
	}

	.hero-meta {
		margin: 14px 0 0;
		color: var(--hero-muted);
		font-size: 0.82rem;
		font-variant-numeric: tabular-nums;
	}

	.hero-compare {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 12px;
		padding: 5px 11px;
		border: 1px solid transparent;
		border-radius: 999px;
		font-size: 0.78rem;
		font-weight: 650;
	}

	.hero-compare.is-best {
		border-color: color-mix(in srgb, var(--warn) 45%, transparent);
		background: color-mix(in srgb, var(--warn) 14%, transparent);
		color: var(--warn);
	}

	.hero-compare.is-ahead {
		border-color: color-mix(in srgb, var(--ok) 35%, transparent);
		background: color-mix(in srgb, var(--ok) 12%, transparent);
		color: var(--ok);
	}

	.hero-compare.is-behind,
	.hero-compare.is-same {
		border-color: var(--line);
		background: var(--surface-muted);
		color: var(--hero-muted);
	}

	.hero-compare.is-baseline {
		border-style: dashed;
		border-color: var(--line);
		color: var(--hero-muted);
		font-weight: 500;
	}

	.hero-cta {
		display: inline-flex;
		width: 100%;
		min-height: 48px;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin-top: 16px;
		border: 0;
		border-radius: var(--radius-control);
		background: var(--color-brand-600);
		color: var(--on-brand);
		font-size: 0.95rem;
		font-weight: 750;
		text-decoration: none;
		transition: background var(--motion-fast) var(--ease-out);
	}

	.hero-cta:hover,
	.hero-cta:focus-visible {
		background: var(--color-brand-700);
	}

	.hero-cta:active {
		transform: translateY(1px);
	}

	.hero-links {
		display: flex;
		max-width: 860px;
		flex-wrap: wrap;
		justify-content: center;
		gap: 2px;
		margin-top: 6px;
	}

	.result-link {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		padding: 0 14px;
		border: 0;
		background: none;
		color: var(--brand-text);
		font-size: 0.9rem;
		font-weight: 600;
		text-decoration: none;
	}

	.result-link:hover,
	.result-link:focus-visible {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.hero-utility {
		display: flex;
		max-width: 860px;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0 12px;
		margin-top: 2px;
		color: var(--text-muted);
		font-size: 0.75rem;
	}

	.hero-utility > * + *::before {
		margin-right: 10px;
		color: var(--line);
		content: '·';
	}

	.utility-link {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		padding: 0;
		border: 0;
		background: none;
		color: var(--text-muted);
		font: inherit;
		text-decoration: underline;
		text-decoration-color: var(--line);
		text-underline-offset: 3px;
	}

	.utility-link:hover,
	.utility-link:focus-visible {
		color: var(--text);
	}

	.utility-id {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
	}

	.reminder-link {
		gap: 6px;
	}

	.reminder-link-icon {
		display: inline-flex;
		color: var(--brand-text);
	}

	.result-retake {
		max-width: 860px;
		margin-top: 10px;
	}

	.auto-explain-row {
		display: flex;
		min-height: 44px;
		align-items: center;
		gap: 10px;
		margin: -6px 0 16px;
		padding: 0 4px;
	}

	.auto-explain-note {
		margin: -12px 0 16px;
		padding: 0 4px;
	}

	.result-footer {
		max-width: 860px;
		margin-top: 18px;
	}

	.result-footer-card {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 18px;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface-muted);
	}

	.result-footer-label {
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.result-footer-rating {
		display: flex;
		gap: 8px;
	}

	.result-footer-rating :global(.btn) {
		min-width: 44px;
		min-height: 44px;
	}

	.result-footer-reminder {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 18px;
	}

	.result-panel {
		height: 100%;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.stats-grid div {
		display: flex;
		min-height: 64px;
		align-items: center;
		flex-direction: column;
		justify-content: center;
		border-radius: var(--radius-control);
		background: var(--surface-muted);
	}

	.stats-grid strong {
		font-size: 1.1rem;
	}

	.stats-grid span {
		color: var(--text-muted);
		font-size: 0.75rem;
	}

	.achievement-badge {
		min-height: 32px;
		display: inline-flex;
		align-items: center;
	}

	.review-item {
		display: flex;
		min-height: 44px;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		color: inherit;
		text-decoration: none;
	}

	.section-breakdown-list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.section-breakdown-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 6px 0;
		border-top: 1px solid var(--line);
		font-size: 0.85rem;
	}

	.section-breakdown-row:first-child {
		border-top: none;
	}

	.section-breakdown-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.section-breakdown-score {
		font-weight: 700;
		white-space: nowrap;
	}

	.challenge-card {
		max-width: 860px;
		border-color: color-mix(in srgb, var(--color-brand-600) 35%, transparent);
	}

	.answer-options {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 6px;
	}

	:global(.explanation-region) {
		width: 100%;
	}

	:global(.explanation-loading) {
		position: relative;
		overflow: hidden;
	}

	:global(.explanation-loading)::after {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			90deg,
			transparent,
			color-mix(in srgb, var(--brand-text) 18%, transparent),
			transparent
		);
		content: '';
		transform: translateX(-100%);
		animation: explanation-shimmer 1.2s ease-in-out infinite;
	}

	@keyframes explanation-shimmer {
		to {
			transform: translateX(100%);
		}
	}

	.review-option {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
	}

	.review-option :global(.markdown-content) {
		flex: 1 1 auto;
		min-width: 0;
	}

	.review-option-glyph {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		margin-top: 2px;
	}

	.correct-option .review-option-glyph {
		color: var(--ok);
	}

	.user-option .review-option-glyph {
		color: var(--danger);
	}

	.retake-confirm {
		flex: 1 1 100%;
		padding: 10px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-control);
		background: var(--surface-muted);
	}

	.retake-confirm-title {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 700;
	}

	.retake-confirm-body {
		margin: 2px 0 10px;
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.correct-option {
		border-color: var(--ok);
		background: color-mix(in srgb, var(--ok) 8%, transparent);
	}

	.user-option {
		border-color: var(--danger);
		background: color-mix(in srgb, var(--danger) 8%, transparent);
	}

	.filter-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		max-width: 860px;
	}

	.filter-chip {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		gap: 8px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text-muted);
		font-size: 0.85rem;
		font-weight: 600;
	}

	.filter-chip:hover,
	.filter-chip:focus-visible {
		border-color: var(--color-brand-500);
	}

	.filter-chip.active {
		border-color: var(--brand-text);
		background: color-mix(in srgb, var(--color-brand-600) 12%, var(--surface));
		color: var(--brand-text);
	}

	.filter-count {
		display: grid;
		min-width: 22px;
		height: 22px;
		place-items: center;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--surface-muted);
		font-size: 0.72rem;
	}

	.filter-chip.active .filter-count {
		background: var(--color-brand-600);
		color: var(--on-brand);
	}

	.score-ring {
		position: relative;
		width: 140px;
		height: 140px;
	}

	@media (min-width: 480px) {
		.score-ring {
			width: 168px;
			height: 168px;
		}
	}

	.score-ring.settled {
		animation: ring-settle 320ms var(--ease-commit);
	}

	@keyframes ring-settle {
		0% {
			transform: scale(1);
		}
		55% {
			transform: scale(1.045);
		}
		100% {
			transform: scale(1);
		}
	}

	.bookmark-flip {
		display: inline-block;
		margin-right: 4px;
	}

	.bookmark-btn.is-pulsing .bookmark-flip {
		animation: bookmark-pop 420ms var(--ease-commit);
	}

	@keyframes bookmark-pop {
		0% {
			transform: scale(1) rotate(0);
		}
		45% {
			transform: scale(1.35) rotate(-12deg);
		}
		100% {
			transform: scale(1) rotate(0);
		}
	}

	.bookmark-count {
		display: inline-flex;
		min-height: 31px;
		align-items: center;
		gap: 4px;
		padding: 0 10px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface-muted);
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 700;
	}

	.bookmark-number {
		display: inline-block;
		font-variant-numeric: tabular-nums;
		animation: bookmark-roll var(--motion-base) var(--ease-out);
	}

	@keyframes bookmark-roll {
		from {
			transform: translateY(80%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.score-ring svg {
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
	}

	.ring-track {
		fill: none;
		stroke: var(--line);
		stroke-width: 8;
	}

	.ring-progress {
		fill: none;
		stroke: var(--brand-text);
		stroke-width: 8;
		stroke-linecap: round;
		transition: stroke-dashoffset 500ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.score-ring-label {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: var(--hero-text);
	}

	.score-ring-pct {
		font-size: 2.1rem;
		font-weight: 750;
		letter-spacing: -0.03em;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	@media (min-width: 480px) {
		.score-ring-pct {
			font-size: 2.5rem;
		}
	}

	.score-ring-sub {
		margin-top: 5px;
		color: var(--hero-muted);
		font-size: 0.7rem;
		font-weight: 600;
	}

	.review-card-head {
		display: flex;
		width: 100%;
		min-height: 44px;
		align-items: flex-start;
		gap: 10px;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		text-align: left;
	}

	.review-card-head:hover .review-card-question,
	.review-card-head:focus-visible .review-card-question {
		color: var(--brand-text);
	}

	.review-card-question {
		flex: 1 1 auto;
		font-weight: 600;
		line-height: 1.5;
	}

	.review-card-number {
		color: var(--text-muted);
		font-weight: 600;
	}

	.review-chevron {
		display: inline-flex;
		align-items: center;
		margin-top: 2px;
		color: var(--text-muted);
		transition: transform 180ms ease;
	}

	.review-chevron.open {
		transform: rotate(180deg);
	}

	:global(.review-region) {
		width: 100%;
	}

	.review-card-body {
		padding-top: 12px;
	}

	@media print {
		.no-print {
			display: none !important;
		}

		.result-hero-card {
			--hero-text: #0f172a;
			--hero-muted: #475569;
			overflow: visible;
			border-color: #cbd5e1;
			background: var(--on-brand);
			box-shadow: none;
			color: var(--hero-text);
		}

		.hero-eyebrow {
			color: #475569;
		}

		.ring-track {
			stroke: #e2e8f0;
		}

		.ring-progress {
			stroke: var(--color-brand-600);
		}

		.hero-compare {
			border-color: #cbd5e1 !important;
			background: transparent !important;
			color: #0f172a !important;
		}
	}

	@media (max-width: 767.98px) {
		.result-panel {
			height: auto;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.ring-progress,
		.review-chevron {
			transition: none;
		}
	}
</style>
