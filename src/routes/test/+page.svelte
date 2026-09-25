<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, onMount, tick } from 'svelte';
	import { localizedApiError, t } from '$lib/client/i18n';
	import { track } from '$lib/client/telemetry';
	import AnimatedHeight from '$lib/client/AnimatedHeight.svelte';
	import Icon from '$lib/client/Icon.svelte';
	import { estimateQuestionCardHeight } from '$lib/client/pretextLayout';
	import { recordStreakActivity, unlockAchievements } from '$lib/client/learning';
	import MarkdownContent from '$lib/client/MarkdownContent.svelte';
	import QuestionMatching from '$lib/client/QuestionMatching.svelte';
	import QuestionAssertionReasoning from '$lib/client/QuestionAssertionReasoning.svelte';
	import ReviewSheet from '$lib/client/ReviewSheet.svelte';
	import SquishSwitch from '$lib/client/SquishSwitch.svelte';
	import { prewarmRichMarkdown } from '$lib/client/markdownRenderer';
	import { prepareMathTextForRendering } from '$lib/shared/latex';
	import { autoAdvance, setAutoAdvance } from '$lib/client/preferences';
	import { HAPTIC_COMMIT, triggerVibration } from '$lib/client/haptics';
	import { keepScreenAwake, stopKeepingScreenAwake } from '$lib/client/screenWake';
	import {
		clearDraftAnswers,
		clearDraftFlags,
		clearDraftHints,
		clearUnsubmittedTest,
		getHistory,
		readDraftAnswers,
		readDraftFlags,
		readDraftHints,
		reportTestActivity,
		resolveTestRecord,
		saveAttemptResult,
		saveUnsubmittedTest,
		submitTestAnswers,
		upsertHistory,
		writeDraftAnswers,
		writeDraftFlags,
		writeDraftHints,
	} from '$lib/client/storage';
	import { pushAttempt } from '$lib/client/sync';
	import { showToast } from '$lib/client/toast';
	import { requestPersonalize } from '$lib/client/personalize';
	import { parseChallengeParams } from '$lib/client/challenge';
	import { computeAttemptMarks } from '$lib/shared/marks';
	import TestStatsCard from '$lib/client/TestStatsCard.svelte';
	import {
		CARD_HEIGHT,
		CARD_WIDTH,
		canvasToFile,
		cardFilename,
		loadCardLogo,
		shareCardFile,
	} from '$lib/client/cardKit';
	import { drawTestCard } from '$lib/client/testCard';

	let questionPaper = $state(null);
	let challenge = $state(null);
	let answers = $state({});
	let flagged = $state([]);
	let currentQuestionIndex = $state(0);
	let loading = $state(true);
	let error = $state('');
	let submitting = $state(false);
	let testStarted = $state(false);
	let startedAt = $state(Date.now());
	let showReviewSheet = $state(false);
	let showExitModal = $state(false);
	let showOverflowMenu = $state(false);
	let navigationDirection = $state('forward');
	let questionCardHost = $state();
	let questionHeading = $state();
	let overflowTrigger = $state();
	let overflowWrapper = $state();
	let overflowMenuElement = $state();
	let questionCardWidth = $state(0);
	let questionCardEstimate = $state(null);
	let autoAdvanceTimer = null;
	let liveAnnouncement = $state('');
	let elapsedSeconds = $state(0);
	let timerInterval = null;
	let swipeStartX = null;
	let swipeStartY = null;
	let testMomentFired = false;
	let navCount = 0;
	// 50-50 hint: thresholds mirror src/lib/server/hint.js (client cannot
	// import $lib/server/*, so the numbers are duplicated, not derived).
	const HINT_DWELL_SEC = 45;
	const HINT_SKIP_STREAK = 2;
	const MAX_HINTS = 3;
	let eliminated = $state({});
	let hintUnlocked = $state({});
	let hintLoading = $state(false);
	let skipStreak = $state(0);
	let questionStartElapsed = $state(0);

	const SWIPE_THRESHOLD_PX = 64;
	const START_HAPTIC = 15;
	const SUBMIT_HAPTIC = [25, 50, 25];

	let answeredCount = $derived(Object.keys(answers).length);
	let paperSections = $derived(questionPaper?.sections || []);
	let currentSection = $derived(
		paperSections.find((section) =>
			(section.questionIndexes || []).includes(currentQuestionIndex)
		) || null
	);
	let currentSectionPosition = $derived(
		currentSection ? paperSections.indexOf(currentSection) + 1 : 0
	);
	let sectionFirstQuestion = $derived(
		Boolean(currentSection && (currentSection.questionIndexes || [])[0] === currentQuestionIndex)
	);
	let suggestedSectionMinutes = $derived.by(() => {
		const duration = Number(questionPaper?.examMeta?.durationMinutes);
		if (!duration || !currentSection || !totalQuestions) {
			return null;
		}
		return Math.max(1, Math.round((duration * currentSection.questionCount) / totalQuestions));
	});
	let hintsUsedCount = $derived(Object.keys(eliminated).length);
	let canUseHint = $derived(
		testStarted &&
			!submitting &&
			!!hintUnlocked[currentQuestionIndex] &&
			!eliminated[currentQuestionIndex] &&
			!hintLoading &&
			hintsUsedCount < MAX_HINTS &&
			answers[currentQuestionIndex] == null
	);
	let showHintSoon = $derived(
		testStarted &&
			!eliminated[currentQuestionIndex] &&
			!hintUnlocked[currentQuestionIndex] &&
			(elapsedSeconds - questionStartElapsed > 15 || skipStreak >= 1)
	);
	// Charge bar (indication only, never seconds): fills as the unlock nears.
	let hintCharge = $derived(
		Math.min(
			1,
			Math.max(
				(elapsedSeconds - questionStartElapsed) / HINT_DWELL_SEC,
				skipStreak / HINT_SKIP_STREAK
			)
		)
	);
	let totalQuestions = $derived(questionPaper?.questions?.length || 0);
	let flaggedCount = $derived(flagged.length);
	let hasDraftAnswers = $derived(Object.keys(answers).length > 0);
	let testMode = $derived(
		questionPaper?.testMode || questionPaper?.requestParams?.testMode || 'quiz-practice'
	);
	let testDifficulty = $derived(
		questionPaper?.difficulty || questionPaper?.requestParams?.difficulty || ''
	);
	let testLanguage = $derived(
		questionPaper?.language || questionPaper?.requestParams?.language || 'english'
	);
	let positionPercent = $derived(
		totalQuestions > 0 ? Math.round(((currentQuestionIndex + 1) / totalQuestions) * 100) : 0
	);
	let question = $derived(questionPaper?.questions?.[currentQuestionIndex]);
	let questionFormatLabel = $derived(
		question?.format === 'matching'
			? $t('matchingColumns')
			: question?.format === 'assertion-reasoning'
				? $t('assertionReasoning')
				: ''
	);

	$effect(() => {
		if (!questionCardHost) {
			return;
		}

		const observer = new ResizeObserver(([entry]) => {
			questionCardWidth = Math.round(entry.contentRect.width);
		});
		questionCardWidth = Math.round(questionCardHost.getBoundingClientRect().width);
		observer.observe(questionCardHost);

		return () => observer.disconnect();
	});

	$effect(() => {
		const question = questionPaper?.questions?.[currentQuestionIndex];
		if (!question || questionCardWidth <= 0) {
			questionCardEstimate = null;
			return;
		}

		let cancelled = false;
		questionCardEstimate = null;
		void estimateQuestionCardHeight(question, questionCardWidth).then((height) => {
			if (!cancelled) {
				questionCardEstimate = height;
			}
		});

		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (questionPaper?.id) {
			writeDraftAnswers(questionPaper.id, answers);
		}
	});

	$effect(() => {
		if (questionPaper?.id) {
			writeDraftFlags(questionPaper.id, flagged);
		}
	});

	$effect(() => {
		if (questionPaper?.id) {
			writeDraftHints(questionPaper.id, eliminated);
		}
	});

	$effect(() => {
		if (!questionPaper?.questions?.length) {
			return;
		}
		const [previous, current, next] = [
			questionPaper.questions[currentQuestionIndex - 1],
			questionPaper.questions[currentQuestionIndex],
			questionPaper.questions[currentQuestionIndex + 1],
		];
		const toWarm = [current, next, previous]
			.filter(Boolean)
			.flatMap((q) => [q.question, ...(q.options || [])]);
		prewarmRichMarkdown(toWarm.map(prepareMathTextForRendering));
	});

	onMount(async () => {
		const testId = page.url.searchParams.get('id');
		challenge = parseChallengeParams(page.url.search);
		try {
			questionPaper = await resolveTestRecord(testId);
			if (!questionPaper) {
				error = $t('testNotFound');
				return;
			}
			if (questionPaper.userAnswers) {
				await goto(resultUrlWithChallenge(questionPaper.id));
				return;
			}
			answers = readDraftAnswers(questionPaper.id);
			flagged = readDraftFlags(questionPaper.id);
			eliminated = readDraftHints(questionPaper.id);
			saveUnsubmittedTest(questionPaper);
			reportTestActivity(questionPaper.id, 'view', { name: challenge?.by || '' });
		} catch (caughtError) {
			error = caughtError.message || $t('testNotFound');
		} finally {
			loading = false;
		}
	});

	// Challenge links keep `ch`/`by` through submission so the recipient
	// lands on a results page that can still show the comparison.
	function resultUrlWithChallenge(testId) {
		const params = new URLSearchParams({ id: String(testId) });
		if (challenge) {
			params.set('ch', String(challenge.score));
			params.set('by', challenge.by);
		}
		return `/results?${params.toString()}`;
	}

	function startTest() {
		if (!questionPaper || testStarted) {
			return;
		}
		startedAt = Date.now();
		elapsedSeconds = 0;
		questionStartElapsed = 0;
		skipStreak = 0;
		timerInterval = window.setInterval(() => {
			elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
			checkHintUnlock();
		}, 1000);
		showOverflowMenu = false;
		track('test:start', {
			id: questionPaper.id,
			mode: questionPaper.testMode || '',
			language: questionPaper.language || '',
		});
		testStarted = true;
		triggerVibration(START_HAPTIC);
		void keepScreenAwake();
	}

	onDestroy(() => {
		if (typeof window === 'undefined') {
			return;
		}
		window.clearTimeout(autoAdvanceTimer);
		if (timerInterval) {
			window.clearInterval(timerInterval);
		}
		stopKeepingScreenAwake();
	});

	function formatElapsed(totalSeconds) {
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
	}

	function closeOverflowMenu({ restoreFocus = false } = {}) {
		if (!showOverflowMenu) {
			return;
		}
		showOverflowMenu = false;
		if (restoreFocus) {
			overflowTrigger?.focus({ preventScroll: true });
		}
	}

	function handleDocumentClick(event) {
		if (!showOverflowMenu || overflowWrapper?.contains(event.target)) {
			return;
		}
		// Keep keyboard focus meaningful when the menu itself had focus.
		closeOverflowMenu({
			restoreFocus: overflowMenuElement?.contains(document.activeElement),
		});
	}

	function handleTestKeydown(event) {
		if (event.key === 'Escape' && showOverflowMenu && !showReviewSheet && !showExitModal) {
			event.preventDefault();
			closeOverflowMenu({ restoreFocus: true });
			return;
		}
		if (!testStarted || loading || submitting || showReviewSheet || showExitModal) {
			return;
		}
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
		) {
			return;
		}
		if (event.metaKey || event.ctrlKey || event.altKey) {
			return;
		}

		switch (event.key) {
			case 'ArrowRight':
				if (currentQuestionIndex < totalQuestions - 1) {
					event.preventDefault();
					nextQuestion();
				}
				break;
			case 'ArrowLeft':
				if (currentQuestionIndex > 0) {
					event.preventDefault();
					previousQuestion();
				}
				break;
			case 'Enter':
				// A focused button already activates on Enter; let it do its own
				// thing instead of double-advancing.
				if (target instanceof HTMLElement && ['BUTTON', 'A'].includes(target.tagName)) {
					return;
				}
				if (currentQuestionIndex === totalQuestions - 1) {
					event.preventDefault();
					showReviewSheet = true;
				} else {
					event.preventDefault();
					nextQuestion();
				}
				break;
			case 'f':
			case 'F':
				event.preventDefault();
				toggleFlag(currentQuestionIndex);
				break;
			default:
				if (/^[1-4]$/.test(event.key)) {
					const optionIndex = Number(event.key) - 1;
					const options = questionPaper?.questions?.[currentQuestionIndex]?.options || [];
					if (optionIndex < options.length) {
						event.preventDefault();
						setAnswer(currentQuestionIndex, options[optionIndex]);
					}
				}
				break;
		}
	}

	function setAnswer(index, option) {
		const options = questionPaper?.questions?.[index]?.options || [];
		const optionIndex = options.indexOf(option);
		if (optionIndex !== -1 && (eliminated[index] || []).includes(optionIndex)) {
			return;
		}
		const isClearing = answers[index] === option;
		if (isClearing) {
			const next = { ...answers };
			delete next[index];
			answers = next;
		} else {
			answers = {
				...answers,
				[index]: option,
			};
		}
		liveAnnouncement = `${$t('optionSelected', { option })}`;
		track('test:answer', { q: index });
		if (!isClearing && questionPaper?.id) {
			reportTestActivity(questionPaper.id, 'start');
		}
		skipStreak = 0;
		if (!isClearing && $autoAdvance && index < totalQuestions - 1) {
			window.clearTimeout(autoAdvanceTimer);
			autoAdvanceTimer = window.setTimeout(() => {
				selectQuestion(index + 1);
			}, 250);
		}
	}

	function toggleFlag(index) {
		flagged = flagged.includes(index)
			? flagged.filter((item) => item !== index)
			: [...flagged, index];
		track('test:flag', { q: index });
	}

	function gradeLocally(paper, userAnswers, timeTaken) {
		const results = paper.questions.map((question, index) => {
			const yourAnswer = userAnswers[index] ?? null;
			const correctAnswer = typeof question?.answer === 'string' ? question.answer : null;
			return {
				index,
				correct: yourAnswer !== null && yourAnswer === correctAnswer,
				yourAnswer,
				correctAnswer,
			};
		});
		const marksResult = computeAttemptMarks({
			questions: paper.questions,
			answers: userAnswers,
			sections: paper.sections || [],
		});
		return {
			score: results.filter((result) => result.correct).length,
			totalQuestions: results.length,
			timeTaken,
			results,
			...(marksResult
				? { marks: marksResult.marks, totalMarks: marksResult.totalMarks }
				: {}),
		};
	}

	async function submitTest() {
		if (!questionPaper || submitting) {
			return;
		}
		submitting = true;
		error = '';
		track('test:submit');
		const criticalSection = async () => {
			const finalAnswers = { ...answers };
			const timeTaken = Math.round((Date.now() - startedAt) / 1000);
			try {
				const hasLocalAnswerKey = questionPaper.questions.some(
					(question) => typeof question?.answer === 'string' && question.answer.length > 0
				);
				const gradedResult = hasLocalAnswerKey
					? gradeLocally(questionPaper, finalAnswers, timeTaken)
					: await submitTestAnswers({
							id: questionPaper.id,
							answers: finalAnswers,
							timeTaken,
							hintedIndexes: eliminated,
							name: challenge?.by || '',
						});
				saveAttemptResult(questionPaper.id, gradedResult);
				const submittedPaper = {
					...questionPaper,
					userAnswers: finalAnswers,
					score: gradedResult.score,
					totalQuestions: gradedResult.totalQuestions,
					timeTaken,
					timestamp: Date.now(),
				};
				clearDraftAnswers(questionPaper.id);
				clearDraftFlags(questionPaper.id);
				clearDraftHints(questionPaper.id);
				clearUnsubmittedTest(questionPaper.id);
				// Locally-graded attempts never hit /api/test/submit, so push
				// them to the server (best-effort, offline-safe) so history
				// survives across devices and survives sign-in. Server-graded
				// attempts are already stored, so pushing again would double-count.
				if (hasLocalAnswerKey) {
					pushAttempt({
						testId: questionPaper.id,
						userAnswers: finalAnswers,
						score: gradedResult.score,
						totalQuestions: gradedResult.totalQuestions,
						timeTaken,
						hintedIndexes: eliminated,
						marks: gradedResult.marks ?? null,
						totalMarks: gradedResult.totalMarks ?? null,
						submittedAt: new Date().toISOString(),
					});
				}
				const nextHistory = upsertHistory(submittedPaper, getHistory());
				const streak = recordStreakActivity();
				const newlyUnlocked = unlockAchievements(nextHistory, streak);
				for (const achievement of newlyUnlocked) {
					showToast(
						`${$t('achievementUnlocked')}: ${$t(`achievement_${achievement.id}_title`)}`,
						'success'
					);
				}
				stopKeepingScreenAwake();
				triggerVibration(SUBMIT_HAPTIC);
				showReviewSheet = false;
				goto(resultUrlWithChallenge(questionPaper.id));
			} catch (caughtError) {
				track('test:submit-fail');
				const localized = caughtError?.data
					? localizedApiError(caughtError.data, $t, caughtError.status)
					: '';
				error = localized || caughtError.message || $t('submitFailed');
				submitting = false;
			}
		};
		if (typeof navigator.locks?.request === 'function') {
			try {
				await navigator.locks.request(
					`selftest:submit:${questionPaper.id}`,
					criticalSection
				);
			} catch {
				await criticalSection();
			}
			return;
		}
		await criticalSection();
	}

	async function shareTest() {
		if (!questionPaper) {
			return;
		}
		track('test:share');

		const url = `${window.location.origin}/test?id=${encodeURIComponent(questionPaper.id)}`;
		const title = `${questionPaper.topic} - ${questionPaper.questions.length} ${$t('questions')}`;
		try {
			const canvas = document.createElement('canvas');
			canvas.width = CARD_WIDTH;
			canvas.height = CARD_HEIGHT;
			const logo = await loadCardLogo();
			const drawn = drawTestCard(
				canvas,
				{
					kicker: $t('shareTestKicker'),
					topic: questionPaper.topic || '',
					chips: [
						`${totalQuestions} ${$t('questions')}`,
						$t(testDifficulty) || testDifficulty,
						testLanguage === 'hindi' ? $t('hindiLabel') : $t('englishLabel'),
					],
					cta: $t('shareTestCta'),
					ctaSub: $t('shareTestCtaSub'),
					url,
				},
				logo
			);
			if (!drawn) {
				throw new Error('card');
			}
			const file = await canvasToFile(canvas, cardFilename('test'));
			const result = await shareCardFile(file, {
				title,
				text: $t('shareTestText', { topic: questionPaper.topic || '' }),
				url,
			});
			if (result === 'downloaded') {
				showToast($t('testCardSaved'), 'success');
			} else if (result === 'failed') {
				showToast($t('cardShareFailed'), 'warning');
			}
		} catch {
			showToast($t('cardShareFailed'), 'warning');
		}
	}

	function nextQuestion() {
		track('test:next', { from: currentQuestionIndex });
		selectQuestion(
			Math.min(currentQuestionIndex + 1, (questionPaper?.questions?.length || 1) - 1)
		);
	}

	function previousQuestion() {
		track('test:prev', { from: currentQuestionIndex });
		selectQuestion(Math.max(currentQuestionIndex - 1, 0));
	}

	function maybeFireTestMoment() {
		// Micro trigger (fail-open, once per test): after repeated navigation
		// on an unanswered question, ask Jev whether the learner is stuck. A
		// stuck verdict only flags the question for review — never advances,
		// submits, or reveals answers.
		if (!testStarted || testMomentFired || navCount < 4) {
			return;
		}
		if (answers[currentQuestionIndex] != null || totalQuestions === 0) {
			return;
		}
		testMomentFired = true;
		void requestPersonalize('test-moment', {
			dwellSec: elapsedSeconds,
			skips: navCount,
			flags: flagged.length,
			answeredRatio:
				Math.round((Object.keys(answers).length / Math.max(1, totalQuestions)) * 100) / 100,
		}).then((decision) => {
			if (!decision?.applied) return;
			if (
				decision.promote?.includes('hint') &&
				!flagged.includes(currentQuestionIndex)
			) {
				toggleFlag(currentQuestionIndex);
			}
			// Jev agrees the learner is stuck: unlock the 50-50 button too.
			if (decision.promote?.includes('hint')) {
				unlockHint(currentQuestionIndex, 'jev');
			}
		});
	}

	function unlockHint(index, source) {
		if (eliminated[index] || hintUnlocked[index]) {
			return;
		}
		if (answers[index] != null) {
			return;
		}
		if (Object.keys(eliminated).length >= MAX_HINTS) {
			return;
		}
		hintUnlocked = { ...hintUnlocked, [index]: true };
		track('test:hint-offer', { q: index, source });
	}

	function checkHintUnlock() {
		if (!testStarted || submitting) {
			return;
		}
		const index = currentQuestionIndex;
		if (eliminated[index] || hintUnlocked[index]) {
			return;
		}
		if (answers[index] != null) {
			return;
		}
		if (Object.keys(eliminated).length >= MAX_HINTS) {
			return;
		}
		const dwellSec = elapsedSeconds - questionStartElapsed;
		if (dwellSec >= HINT_DWELL_SEC || skipStreak >= HINT_SKIP_STREAK) {
			unlockHint(index, 'local');
		}
	}

	function localElimination(question) {
		const options = Array.isArray(question?.options) ? question.options : [];
		const answer = typeof question?.answer === 'string' ? question.answer.trim() : null;
		if (answer === null) {
			return [];
		}
		const wrong = [];
		for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
			const text = typeof options[optionIndex] === 'string' ? options[optionIndex].trim() : '';
			if (text !== answer) {
				wrong.push(optionIndex);
			}
			if (wrong.length === 2) {
				break;
			}
		}
		return wrong.length === 2 ? wrong : [];
	}

	function isEliminated(optionIndex) {
		return (eliminated[currentQuestionIndex] || []).includes(optionIndex);
	}

	async function useHint() {
		const index = currentQuestionIndex;
		if (!canUseHint || eliminated[index]) {
			return;
		}
		hintLoading = true;
		track('test:hint-use', { q: index });
		try {
			const question = questionPaper.questions[index];
			if (typeof question?.answer === 'string' && question.answer.length > 0) {
				// Review paper: the key is already local, no network needed.
				const picked = localElimination(question);
				if (picked.length !== 2) {
					throw new Error($t('failedToGenerateExplanation'));
				}
				eliminated = { ...eliminated, [index]: picked };
			} else {
				const response = await fetch('/api/test/hint', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: questionPaper.id, index }),
				});
				const data = await response.json().catch(() => ({}));
				if (!response.ok || !Array.isArray(data?.eliminated)) {
					throw new Error(data?.error || $t('failedToGenerateExplanation'));
				}
				eliminated = { ...eliminated, [index]: data.eliminated };
			}
			triggerVibration(HAPTIC_COMMIT);
		} catch (caughtError) {
			track('test:hint-fail', { q: index });
			showToast(caughtError?.message || $t('failedToGenerateExplanation'), 'warning');
		} finally {
			hintLoading = false;
		}
	}

	function selectQuestion(nextIndex) {
		if (nextIndex === currentQuestionIndex) {
			return;
		}
		window.clearTimeout(autoAdvanceTimer);
		// The keyed question card is swapped below; if focus lived inside it the
		// node disappears and focus would fall back to <body>.
		const activeElement = document.activeElement;
		const shouldRestoreFocus =
			activeElement instanceof HTMLElement && questionCardHost?.contains(activeElement);
		track('test:jump', { to: nextIndex });
		const leavingUnanswered = answers[currentQuestionIndex] == null;
		navigationDirection = nextIndex > currentQuestionIndex ? 'forward' : 'backward';
		if (nextIndex > currentQuestionIndex && leavingUnanswered) {
			skipStreak += 1;
		} else {
			skipStreak = 0;
		}
		currentQuestionIndex = nextIndex;
		questionStartElapsed = elapsedSeconds;
		navCount += 1;
		checkHintUnlock();
		maybeFireTestMoment();
		liveAnnouncement = $t('questionOf', {
			current: nextIndex + 1,
			total: questionPaper?.questions?.length || 0,
		});
		if (shouldRestoreFocus) {
			void tick().then(() => {
				questionHeading?.focus({ preventScroll: true });
			});
		}
	}

	function jumpFromSheet(index) {
		selectQuestion(index);
		showReviewSheet = false;
	}

	function handleSwipeStart(event) {
		if (!testStarted || showReviewSheet || showExitModal) {
			return;
		}
		if (event.touches?.length !== 1) {
			return;
		}
		swipeStartX = event.touches[0].clientX;
		swipeStartY = event.touches[0].clientY;
	}

	function handleSwipeEnd(event) {
		if (swipeStartX === null || swipeStartY === null) {
			return;
		}
		const touch = event.changedTouches?.[0];
		if (!touch) {
			swipeStartX = null;
			swipeStartY = null;
			return;
		}
		const deltaX = touch.clientX - swipeStartX;
		const deltaY = touch.clientY - swipeStartY;
		swipeStartX = null;
		swipeStartY = null;
		if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) {
			return;
		}
		if (deltaX < 0) {
			track('test:swipe', { direction: 'next' });
			nextQuestion();
		} else {
			track('test:swipe', { direction: 'prev' });
			previousQuestion();
		}
	}

	function requestExit() {
		if (answeredCount > 0) {
			showExitModal = true;
			return;
		}
		leaveTest();
	}

	function leaveTest() {
		track('test:exit');
		stopKeepingScreenAwake();
		goto('/');
	}
</script>

<svelte:head>
	<title>{questionPaper?.topic || $t('testPrefix')} | selftest.in</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<svelte:window onkeydown={handleTestKeydown} onclick={handleDocumentClick} />

<section class="test-shell">
	<div class="visually-hidden" aria-live="polite">{liveAnnouncement}</div>
	{#if loading}
		<div class="py-5 text-center">
			<div
				class="test-loading-skeleton ai-shimmer"
				role="status"
				aria-label={$t('loading')}
			></div>
			<p class="text-muted mt-3">{$t('loading')}</p>
		</div>
	{:else if error}
		<div class="container py-4">
			<div class="alert alert-danger">{error}</div>
			<a class="btn btn-primary" href="/">{$t('startNewTest')}</a>
		</div>
	{:else if questionPaper}
		<header class="test-header">
			<button class="test-exit" type="button" onclick={requestExit} aria-label={$t('exit')}>
				<Icon name="arrow-left" size={18} />
				<span class="test-exit-label">{$t('exit')}</span>
			</button>
			<h1 class="test-topic">
				<MarkdownContent content={questionPaper.topic} tag="span" />
			</h1>
			{#if testStarted}
				<span
					class="test-timer"
					role="timer"
					aria-label={`${$t('timeSpent')}: ${formatElapsed(elapsedSeconds)}`}
				>
					{formatElapsed(elapsedSeconds)}
				</span>
			{/if}
			<div class="test-header-actions" bind:this={overflowWrapper}>
				{#if testStarted}
					<button
						bind:this={overflowTrigger}
						class="test-overflow-btn"
						type="button"
						aria-label={$t('menu')}
						aria-haspopup="menu"
						aria-expanded={showOverflowMenu}
						onclick={() => (showOverflowMenu = !showOverflowMenu)}
					>
						<Icon name="menu" size={20} />
					</button>
					{#if showOverflowMenu}
						<div class="test-overflow-menu" bind:this={overflowMenuElement}>
							<div class="overflow-switch-row">
								<SquishSwitch
									checked={$autoAdvance}
									label={$t('autoAdvance')}
									onchange={(checked) => {
										track('settings:auto-advance-toggle', {
											enabled: checked,
										});
										setAutoAdvance(checked);
									}}
								/>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</header>

		{#if !testStarted}
			<main class="test-summary-wrap">
				<div class="test-summary-card">
					<span class="test-summary-badge" aria-hidden="true">
						<Icon name="note" size={26} />
					</span>
					<h2 class="test-summary-title">{$t('testSummaryTitle')}</h2>
					<p class="test-summary-topic">
						<MarkdownContent content={questionPaper.topic} tag="span" />
					</p>
					{#if questionPaper.examMeta && (questionPaper.examMeta.schoolName || questionPaper.examMeta.examName)}
						<p class="test-summary-exam text-muted small">
							{[
								questionPaper.examMeta.schoolName,
								questionPaper.examMeta.examName,
							]
								.filter(Boolean)
								.join(' · ')}
						</p>
					{/if}
					<div class="test-summary-meta">
						<span class="test-meta-chip">
							{$t('questionsCountFormat', { count: totalQuestions })}
						</span>
						<span class="test-meta-chip">
							{testMode === 'full-exam' ? $t('fullExamPaper') : $t('quizPractice')}
						</span>
						{#if testDifficulty}
							<span class="test-meta-chip"
								>{$t(testDifficulty) || testDifficulty}</span
							>
						{/if}
						<span class="test-meta-chip">
							{testLanguage === 'hindi' ? $t('hindiLabel') : $t('englishLabel')}
						</span>
					</div>
					{#if questionPaper.trimmed && Number(questionPaper.requestedCount) > totalQuestions}
						<p class="test-trimmed-notice" role="status">
							{$t('paperTrimmedNotice', {
								done: totalQuestions,
								total: Number(questionPaper.requestedCount),
							})}
						</p>
					{/if}
					<p class="test-summary-body">{$t('testSummaryBody')}</p>
					<p class="test-summary-id">{$t('testId')}: {questionPaper.id}</p>
					<div class="test-summary-actions">
						<button class="btn btn-outline-primary" type="button" onclick={shareTest}>
							{$t('share')}
						</button>
						<button class="btn btn-primary" type="button" onclick={startTest}>
							{hasDraftAnswers ? $t('continueTest') : $t('startTest')}
						</button>
					</div>
				</div>
				<TestStatsCard testId={questionPaper.id} />
			</main>
		{:else}
			<div class="test-progress-track" aria-hidden="true">
				<div class="test-progress-fill" style={`width: ${positionPercent}%`}></div>
			</div>

			{#if error}
				<div class="test-error alert alert-danger" role="alert">{error}</div>
			{/if}

			<main class="test-main">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="test-card-frame"
					bind:this={questionCardHost}
					ontouchstart={handleSwipeStart}
					ontouchend={handleSwipeEnd}
				>
					<div class="test-card-head">
						<span class="test-question-no">
							{$t('question')}
							{currentQuestionIndex + 1}
							{$t('of')}
							{totalQuestions}
						</span>
						{#if questionFormatLabel}
							<span class="test-format-chip">{questionFormatLabel}</span>
						{/if}
						<div class="test-card-tools">
							<span class="hint-btn">
								<button
									class="test-hint"
									class:ready={canUseHint}
									class:used={eliminated[currentQuestionIndex]}
									type="button"
									disabled={!canUseHint}
									aria-label={eliminated[currentQuestionIndex]
										? $t('hintUsed')
										: $t('hintFiftyFifty')}
									title={canUseHint ? $t('hintFiftyFifty') : $t('hintUnlockSoon')}
									onclick={useHint}
								>
									<span aria-hidden="true">50-50</span>
									<span class="visually-hidden">
										{eliminated[currentQuestionIndex] ? $t('hintUsed') : $t('hintFiftyFifty')}
									</span>
								</button>
								{#if showHintSoon && !eliminated[currentQuestionIndex]}
									<span class="hint-charge" aria-hidden="true">
										<span style={`width: ${Math.round(hintCharge * 100)}%`}></span>
									</span>
								{/if}
							</span>
							<button
								class="test-flag"
							class:active={flagged.includes(currentQuestionIndex)}
							type="button"
							aria-pressed={flagged.includes(currentQuestionIndex)}
							aria-label={flagged.includes(currentQuestionIndex)
								? $t('flaggedQuestions')
								: $t('flagForReview')}
							onclick={() => toggleFlag(currentQuestionIndex)}
						>
							<Icon name="flag" size={18} />
							<span
								>{flagged.includes(currentQuestionIndex)
									? $t('flaggedQuestions')
									: $t('flagForReview')}</span
							>
						</button>
						{#if showHintSoon}
							<span class="hint-soon" role="status">{$t('hintUnlockSoon')}</span>
						{/if}
						</div>
					</div>
					<AnimatedHeight
						class="test-card bg-body border rounded-3 p-3 p-md-4 shadow-sm"
						estimatedHeight={questionCardEstimate}
					>
						{#key currentQuestionIndex}
							<div
								class="question-content"
								class:question-content-forward={navigationDirection === 'forward'}
								class:question-content-backward={navigationDirection === 'backward'}
							>
								{#if currentSection}
									<div class="test-section-banner">
										<span class="test-section-label">
											{$t('sectionLabel', {
												index: currentSectionPosition,
												total: paperSections.length,
											})}
										</span>
										<span class="test-section-name">{currentSection.name}</span>
										{#if currentSection.marksPerQuestion}
											<span class="test-section-marks">
												{$t('marksEachLabel', {
													count: currentSection.marksPerQuestion,
												})}{#if suggestedSectionMinutes}
													&middot;
													{$t('sectionMinutesLabel', {
														minutes: suggestedSectionMinutes,
													})}{/if}
											</span>
										{/if}
									</div>
									{#if sectionFirstQuestion && currentSection.instructions}
										<p class="test-section-instructions">
											{currentSection.instructions}
										</p>
									{/if}
								{/if}
								<h2
									class="test-question-text"
									class:visually-hidden={!question.question}
									bind:this={questionHeading}
									tabindex="-1"
								>
									{#if question.question}
										<MarkdownContent content={question.question} />
									{:else}
										{$t('question')}
										{currentQuestionIndex + 1}
										{$t('of')}
										{totalQuestions}
									{/if}
								</h2>
								{#if question.format === 'matching'}
									<QuestionMatching {question} />
								{:else if question.format === 'assertion-reasoning'}
									<QuestionAssertionReasoning {question} />
								{/if}
								<div class="d-grid gap-2">
									{#each question.options || [] as option, optionIndex (optionIndex)}
										<button
											class="test-option"
											class:selected={answers[currentQuestionIndex] ===
												option}
											class:eliminated={isEliminated(optionIndex)}
											type="button"
											aria-pressed={answers[currentQuestionIndex] === option}
											aria-disabled={isEliminated(optionIndex)}
											disabled={isEliminated(optionIndex)}
											onclick={() => setAnswer(currentQuestionIndex, option)}
										>
											<span class="test-option-letter" aria-hidden="true">
												{String.fromCharCode(65 + optionIndex)}
											</span>
											<span class="test-option-text">
												<MarkdownContent content={option} links="text" />
											</span>
											{#if answers[currentQuestionIndex] === option}
												<span class="test-option-check" aria-hidden="true">
													<Icon name="check" size={16} />
												</span>
											{/if}
										</button>
									{/each}
								</div>
							</div>
						{/key}
					</AnimatedHeight>
				</div>
			</main>

			<footer class="test-bottom-bar">
				<div class="test-bottom-inner">
					<button
						class="test-progress-pill"
						type="button"
						aria-label={$t('questionsHeading')}
						onclick={() => (showReviewSheet = true)}
					>
						<span class="pill-fill" style={`width: ${positionPercent}%`}></span>
						<span class="pill-label">{answeredCount}/{totalQuestions}</span>
					</button>
					{#if flaggedCount > 0}
						<span
							class="test-flag-badge"
							aria-label={`${$t('flaggedQuestions')}: ${flaggedCount}`}
						>
							<Icon name="flag" size={14} />
							{flaggedCount}
						</span>
					{/if}
					<div class="test-nav-actions">
						<button
							class="btn btn-outline-secondary"
							type="button"
							disabled={currentQuestionIndex === 0}
							onclick={previousQuestion}
						>
							{$t('tourPrevious')}
						</button>
						{#if currentQuestionIndex === totalQuestions - 1}
							<button
								class="btn btn-success"
								type="button"
								disabled={submitting}
								onclick={() => (showReviewSheet = true)}
							>
								{submitting ? $t('submittingAnswers') : $t('submitTest')}
							</button>
						{:else}
							<button class="btn btn-primary" type="button" onclick={nextQuestion}>
								{$t('tourNext')}
							</button>
						{/if}
					</div>
				</div>
			</footer>
		{/if}

		{#if showReviewSheet}
			<ReviewSheet
				total={totalQuestions}
				{answers}
				{flagged}
				currentIndex={currentQuestionIndex}
				{submitting}
				{error}
				onClose={() => (showReviewSheet = false)}
				onJump={jumpFromSheet}
				onSubmit={submitTest}
			/>
		{/if}

		{#if showExitModal}
			<div
				class="exit-backdrop"
				role="presentation"
				onclick={(event) => {
					if (event.target === event.currentTarget) {
						showExitModal = false;
					}
				}}
			>
				<div
					class="exit-modal"
					role="dialog"
					aria-modal="true"
					tabindex="-1"
					aria-label={$t('leaveTestTitle')}
				>
					<h2 class="h5 fw-bold mb-1">{$t('leaveTestTitle')}</h2>
					<p class="text-muted small mb-3">{$t('leaveTestBody')}</p>
					<div class="d-flex flex-wrap gap-2">
						<button
							class="btn btn-outline-secondary"
							type="button"
							onclick={() => (showExitModal = false)}
						>
							{$t('keepTaking')}
						</button>
						<button class="btn btn-danger" type="button" onclick={leaveTest}>
							{$t('leave')}
						</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</section>

<style>
	.test-shell {
		min-height: 100vh;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	.test-header {
		position: sticky;
		top: 0;
		z-index: 1020;
		display: flex;
		min-height: 58px;
		align-items: center;
		gap: 10px;
		padding: 6px 12px;
		border-bottom: 1px solid var(--line);
		background: var(--surface);
	}

	.test-exit {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		gap: 6px;
		padding: 0 10px;
		border: 0;
		border-radius: var(--radius-control);
		background: transparent;
		color: inherit;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.test-exit:hover,
	.test-exit:focus-visible {
		background: var(--surface-muted);
	}

	.test-exit-label {
		display: none;
	}

	.test-topic {
		min-width: 0;
		margin: 0;
		flex: 1 1 auto;
		overflow: hidden;
		font-size: 1rem;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.test-topic :global(*) {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.test-timer {
		flex: 0 0 auto;
		padding: 4px 10px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface-muted);
		color: var(--text-muted);
		font-size: 0.78rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.02em;
	}

	.test-header-actions {
		position: relative;
		flex: 0 0 auto;
	}

	.test-overflow-btn {
		display: grid;
		width: 44px;
		height: 44px;
		place-items: center;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: inherit;
	}

	.test-overflow-btn:hover,
	.test-overflow-btn:focus-visible,
	.test-overflow-btn[aria-expanded='true'] {
		background: var(--surface-muted);
	}

	.test-overflow-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 1040;
		display: grid;
		min-width: 230px;
		padding: 6px;
		border: 1px solid var(--line);
		border-radius: var(--radius-overlay);
		background: var(--surface);
		box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
	}

	.overflow-switch-row {
		display: flex;
		width: 100%;
		min-height: 44px;
		align-items: center;
		padding: 6px 12px;
	}

	.test-progress-track {
		height: 3px;
		background: var(--line);
	}

	.test-progress-fill {
		height: 100%;
		background: var(--color-brand-600);
		transition: width 240ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.test-error {
		margin: 12px 12px 0;
	}

	.test-loading-skeleton {
		width: 100%;
		max-width: 480px;
		height: 200px;
		margin: 0 auto;
		border-radius: var(--radius-surface);
	}

	.test-summary-wrap {
		display: flex;
		flex: 1 1 auto;
		align-items: center;
		justify-content: center;
		padding: 24px 16px calc(24px + var(--sab, env(safe-area-inset-bottom, 0px)));
	}

	.test-summary-card {
		width: 100%;
		max-width: 480px;
		padding: 28px 22px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
		box-shadow: 0 12px 34px rgba(15, 23, 42, 0.08);
		text-align: center;
	}

	.test-summary-badge {
		display: grid;
		width: 56px;
		height: 56px;
		margin: 0 auto 12px;
		place-items: center;
		border-radius: var(--radius-overlay);
		background: color-mix(in srgb, var(--color-brand-600) 12%, var(--surface));
		color: var(--brand-text);
	}

	.test-summary-title {
		margin: 0 0 8px;
		font-size: 1.15rem;
		font-weight: 700;
	}

	.test-summary-topic {
		margin: 0 0 14px;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-muted);
		line-height: 1.5;
	}

	.test-summary-topic :global(*) {
		color: var(--text-muted);
	}

	.test-summary-exam {
		margin: 0 0 14px;
	}

	.test-summary-meta {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
		margin-bottom: 16px;
	}

	.test-meta-chip {
		display: inline-flex;
		min-height: 32px;
		align-items: center;
		gap: 6px;
		padding: 4px 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface-muted);
		color: var(--text);
		font-size: 0.8rem;
		font-weight: 600;
	}

	.test-summary-body {
		margin: 0 0 20px;
		color: var(--text-muted);
		font-size: 0.9rem;
		line-height: 1.55;
	}

	.test-trimmed-notice {
		margin: 0 0 16px;
		padding: 9px 12px;
		border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent);
		border-radius: var(--radius-surface);
		background: color-mix(in srgb, var(--warn) 10%, transparent);
		color: var(--warn);
		font-size: 0.8rem;
		line-height: 1.45;
	}

	.test-summary-id {
		margin: -10px 0 18px;
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		font-variant-numeric: tabular-nums;
	}

	.test-summary-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 10px;
	}

	.test-summary-actions .btn {
		min-height: 48px;
		padding-inline: 24px;
		font-weight: 600;
	}

	.test-summary-actions .btn-outline-primary {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}

	@media (min-width: 640px) {
		.test-summary-card {
			padding-inline: 36px;
		}
	}

	.test-main {
		width: 100%;
		max-width: 860px;
		margin: 0 auto;
		/* Clear the sticky footer (~64px) plus safe area so focused options and
		   the last question are never covered. */
		padding: 16px 12px calc(96px + var(--sab, 0px));
		flex: 1 1 auto;
	}

	.test-card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 10px;
	}

	.test-card-tools {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.test-format-chip {
		margin-right: auto;
		padding: 2px 8px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--brand-text) 10%, transparent);
		color: var(--brand-text);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.hint-btn {
		position: relative;
		display: inline-flex;
	}

	.hint-charge {
		position: absolute;
		left: 12px;
		right: 12px;
		bottom: 7px;
		height: 2px;
		border-radius: 2px;
		background: color-mix(in srgb, var(--text-muted) 25%, transparent);
		overflow: hidden;
		pointer-events: none;
	}

	.hint-charge > span {
		display: block;
		height: 100%;
		border-radius: 2px;
		background: var(--brand-text);
		transition: width 1s linear;
	}

	:global(html.data-saver) .hint-charge > span,
	:global(html.reduce-motion) .hint-charge > span {
		transition: none;
	}

	.test-hint {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		gap: 6px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 700;
		opacity: 0.65;
	}

	.test-hint.ready {
		border-color: var(--brand-text);
		background: color-mix(in srgb, var(--color-brand-600) 12%, var(--surface));
		color: var(--brand-text);
		opacity: 1;
	}

	.test-hint.used {
		border-color: var(--line);
		background: var(--surface-muted);
		opacity: 0.7;
	}

	.hint-soon {
		font-size: 0.72rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.test-section-banner {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 8px;
		padding-bottom: 8px;
		margin-bottom: 10px;
		border-bottom: 1px solid var(--line);
	}

	.test-section-label {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.test-section-name {
		font-size: 0.85rem;
		font-weight: 700;
	}

	.test-section-marks {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.test-section-instructions {
		margin: 0 0 10px;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.test-question-no {
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.test-flag {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		gap: 6px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 600;
	}

	.test-flag.active {
		border-color: var(--warn);
		background: color-mix(in srgb, var(--warn) 12%, transparent);
		color: var(--warn);
	}

	.test-flag:hover,
	.test-flag:focus-visible {
		border-color: var(--warn);
	}

	:global(.test-card) {
		width: 100%;
	}

	.test-question-text {
		margin: 0 0 14px;
		font-size: 1.05rem;
		font-weight: 600;
		line-height: 1.5;
	}

	.test-option {
		position: relative;
		display: flex;
		min-height: 52px;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
		color: var(--text);
		font-size: 0.95rem;
		font-weight: 500;
		text-align: left;
		transition:
			border-color 150ms ease,
			background 150ms ease;
	}

	.test-option:hover,
	.test-option:focus-visible {
		border-color: var(--color-brand-500);
	}

	.test-option.selected {
		border-color: var(--brand-text);
		background: color-mix(in srgb, var(--color-brand-600) 12%, var(--surface));
	}

	.test-option.eliminated {
		cursor: not-allowed;
		opacity: 0.55;
		transform: scale(0.985);
		transition:
			border-color 150ms ease,
			background 150ms ease,
			opacity var(--motion-base) var(--ease-out),
			transform var(--motion-base) var(--ease-commit);
	}

	/* Spring strike: the line sweeps across the label as the hint lands. */
	.test-option.eliminated .test-option-text {
		position: relative;
	}

	.test-option.eliminated .test-option-text::after {
		position: absolute;
		top: 50%;
		left: 0;
		width: 100%;
		height: 1.5px;
		border-radius: 999px;
		background: currentColor;
		opacity: 0.75;
		content: '';
		transform: scaleX(0);
		transform-origin: left center;
		animation: eliminate-strike var(--motion-slow) var(--ease-commit) forwards;
	}

	@keyframes eliminate-strike {
		to {
			transform: scaleX(1);
		}
	}

	.test-option.eliminated .test-option-letter {
		position: relative;
		color: transparent;
	}

	.test-option.eliminated .test-option-letter::before,
	.test-option.eliminated .test-option-letter::after {
		position: absolute;
		top: 50%;
		left: 50%;
		width: 14px;
		height: 1.5px;
		border-radius: 999px;
		background: var(--text-muted);
		content: '';
		transform: translate(-50%, -50%) scaleX(0) rotate(45deg);
		animation: eliminate-cross-a var(--motion-fast) var(--ease-commit) 90ms forwards;
	}

	.test-option.eliminated .test-option-letter::after {
		transform: translate(-50%, -50%) scaleX(0) rotate(-45deg);
		animation-name: eliminate-cross-b;
		animation-delay: 130ms;
	}

	@keyframes eliminate-cross-a {
		to {
			transform: translate(-50%, -50%) scaleX(1) rotate(45deg);
		}
	}

	@keyframes eliminate-cross-b {
		to {
			transform: translate(-50%, -50%) scaleX(1) rotate(-45deg);
		}
	}

	.test-option-letter {
		display: grid;
		width: 32px;
		height: 32px;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface-muted);
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 700;
	}

	.test-option.selected .test-option-letter {
		border-color: var(--brand-text);
		background: var(--color-brand-600);
		color: var(--on-brand);
	}

	.test-option-text {
		flex: 1 1 auto;
	}

	.test-option-check {
		display: grid;
		width: 28px;
		height: 28px;
		flex: 0 0 auto;
		place-items: center;
		border-radius: 999px;
		background: var(--color-brand-600);
		color: var(--on-brand);
	}

	.test-bottom-bar {
		position: sticky;
		bottom: 0;
		z-index: 1010;
		padding: 8px 12px calc(8px + var(--sab, env(safe-area-inset-bottom, 0px)));
		border-top: 1px solid var(--line);
		background: var(--surface);
	}

	.test-bottom-inner {
		display: flex;
		max-width: 860px;
		align-items: center;
		gap: 10px;
		margin: 0 auto;
	}

	.test-progress-pill {
		position: relative;
		display: grid;
		min-width: 92px;
		min-height: 48px;
		overflow: hidden;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface-muted);
		color: var(--text);
		font-size: 0.85rem;
		font-weight: 700;
	}

	.pill-fill {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		background: color-mix(in srgb, var(--color-brand-600) 18%, transparent);
		transition: width 240ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.pill-label {
		position: relative;
		font-variant-numeric: tabular-nums;
	}

	.test-flag-badge {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		gap: 4px;
		padding: 0 12px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--warn) 14%, transparent);
		color: var(--warn);
		font-size: 0.8rem;
		font-weight: 700;
	}

	.test-nav-actions {
		display: flex;
		gap: 8px;
		margin-left: auto;
	}

	.test-nav-actions .btn {
		min-height: 48px;
	}

	.exit-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1200;
		display: grid;
		place-items: center;
		padding: 20px;
		background: rgba(15, 23, 42, 0.55);
	}

	.exit-modal {
		width: 100%;
		max-width: 380px;
		padding: 20px;
		border: 1px solid var(--line);
		border-radius: var(--radius-overlay);
		background: var(--surface);
		box-shadow: 0 20px 50px rgba(15, 23, 42, 0.28);
	}

	.question-content-forward {
		animation: question-content-forward 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	.question-content-backward {
		animation: question-content-backward 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	@keyframes question-content-forward {
		from {
			opacity: 0;
			transform: translate3d(16px, 0, 0);
		}
		to {
			opacity: 1;
			transform: translate3d(0, 0, 0);
		}
	}

	@keyframes question-content-backward {
		from {
			opacity: 0;
			transform: translate3d(-16px, 0, 0);
		}
		to {
			opacity: 1;
			transform: translate3d(0, 0, 0);
		}
	}

	@media (min-width: 640px) {
		.test-header {
			padding-inline: 20px;
		}

		.test-exit-label {
			display: inline;
		}

		.test-main {
			padding-inline: 20px;
		}
	}

	@media (max-width: 439.98px) {
		.test-flag span:last-child {
			display: none;
		}

		.test-flag {
			min-width: 44px;
			justify-content: center;
			padding: 0 10px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.test-progress-fill,
		.pill-fill {
			transition: none;
		}
	}
</style>
