<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, onMount, tick } from 'svelte';
	import { localizedApiError, t } from '$lib/client/i18n';
	import { track } from '$lib/client/telemetry';
	import Icon from '$lib/client/Icon.svelte';
	import { estimateQuestionCardHeight } from '$lib/client/pretextLayout';
	import { recordStreakActivity, unlockAchievements } from '$lib/client/learning';
	import MarkdownContent from '$lib/client/MarkdownContent.svelte';
	import ReviewSheet from '$lib/client/ReviewSheet.svelte';
	import SquishSwitch from '$lib/client/SquishSwitch.svelte';
	import { prepareMathTextForRendering } from '$lib/shared/latex';
	import {
		HINT_DWELL_SEC,
		HINT_SKIP_STREAK,
		MAX_HINTS_PER_TEST as MAX_HINTS,
	} from '$lib/shared/hint';
	import { autoAdvance, setAutoAdvance } from '$lib/client/preferences';
	import { HAPTIC_COMMIT, triggerVibration } from '$lib/client/haptics';
	import { focusTrap } from '$lib/client/focusTrap';
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
	import TestBottomBar from '$lib/client/TestBottomBar.svelte';
	import TestQuestionCard from '$lib/client/TestQuestionCard.svelte';
	import TestStatsCard from '$lib/client/TestStatsCard.svelte';
	import { drawTestCard } from '$lib/client/testCard';
	import { shareCard } from '$lib/client/shareCardFlow';

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
		const values = toWarm.map(prepareMathTextForRendering);
		// Keep the markdown pipeline off the initial bundle: warm it during idle
		// time, and let MarkdownContent's own dynamic import cover the first
		// render if it happens sooner.
		const schedule =
			typeof window.requestIdleCallback === 'function'
				? window.requestIdleCallback.bind(window)
				: (callback) => window.setTimeout(callback, 1500);
		const cancel =
			typeof window.cancelIdleCallback === 'function'
				? window.cancelIdleCallback.bind(window)
				: window.clearTimeout.bind(window);
		const idleId = schedule(() => {
			import('$lib/client/markdownRenderer').then(({ prewarmRichMarkdown }) => {
				prewarmRichMarkdown(values);
			});
		});
		return () => cancel(idleId);
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
		await shareCard({
			draw: drawTestCard,
			card: {
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
			kind: 'test',
			title,
			text: $t('shareTestText', { topic: questionPaper.topic || '' }),
			url,
			savedToastKey: 'testCardSaved',
		});
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

	// Lock background scrolling while the exit dialog is open; Escape and focus
	// containment come from the shared focusTrap action on the dialog.
	$effect(() => {
		if (!showExitModal) {
			return;
		}
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previousOverflow;
		};
	});

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

<section class="app-container test-shell">
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
		<div class="test-error-wrap py-4">
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
				<div class="test-stats-slot">
					<TestStatsCard testId={questionPaper.id} />
				</div>
			</main>
		{:else}
			<div class="test-progress-track" aria-hidden="true">
				<div class="test-progress-fill" style={`width: ${positionPercent}%`}></div>
			</div>

			{#if error}
				<div class="test-error alert alert-danger" role="alert">{error}</div>
			{/if}

			<main class="test-main">
				<TestQuestionCard
					bind:host={questionCardHost}
					bind:heading={questionHeading}
					{question}
					questionIndex={currentQuestionIndex}
					{totalQuestions}
					{navigationDirection}
					{questionFormatLabel}
					{currentSection}
					{currentSectionPosition}
					sectionCount={paperSections.length}
					{sectionFirstQuestion}
					{suggestedSectionMinutes}
					estimatedHeight={questionCardEstimate}
					selectedAnswer={answers[currentQuestionIndex]}
					eliminatedOptions={eliminated[currentQuestionIndex]}
					flagActive={flagged.includes(currentQuestionIndex)}
					{canUseHint}
					{showHintSoon}
					{hintCharge}
					onAnswer={(option) => setAnswer(currentQuestionIndex, option)}
					onFlag={() => toggleFlag(currentQuestionIndex)}
					onHint={useHint}
					onSwipeStart={handleSwipeStart}
					onSwipeEnd={handleSwipeEnd}
				/>
			</main>

			<TestBottomBar
				{positionPercent}
				{answeredCount}
				{totalQuestions}
				{flaggedCount}
				currentQuestionIndex={currentQuestionIndex}
				{submitting}
				onOpenReview={() => (showReviewSheet = true)}
				onPrevious={previousQuestion}
				onNext={nextQuestion}
			/>
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
					use:focusTrap={{ onEscape: () => (showExitModal = false) }}
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
		z-index: var(--z-header);
		display: flex;
		min-height: 58px;
		align-items: center;
		gap: 10px;
		padding-block: calc(6px + var(--sat, env(safe-area-inset-top, 0px))) 6px;
		border-bottom: 1px solid var(--line);
		background: var(--surface);
	}

	.test-exit {
		display: inline-flex;
		min-width: 44px;
		min-height: 44px;
		align-items: center;
		justify-content: center;
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
		z-index: var(--z-dropdown);
		display: grid;
		min-width: 230px;
		padding: 6px;
		border: 1px solid var(--line);
		border-radius: var(--radius-overlay);
		background: var(--surface);
		box-shadow: var(--shadow-2);
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

	/* Summary + activity. Phone: one centered column, both cards 480 max.
	   Desktop (≥1024): two columns, summary 480 + activity 300–360. The
	   old single non-wrapping row squeezed both cards at every width and
	   spilled the stat-tile labels. */
	.test-summary-wrap {
		display: flex;
		flex: 1 1 auto;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 24px 16px calc(24px + var(--sab, env(safe-area-inset-bottom, 0px)));
	}

	.test-stats-slot {
		width: 100%;
		max-width: 480px;
	}

	.test-stats-slot :global(.test-stats-card) {
		width: 100%;
		margin-top: 0;
	}

	.test-summary-card {
		width: 100%;
		max-width: 480px;
		padding: 1.5rem 1.25rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
		box-shadow: var(--shadow-1);
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
			padding-inline: 1.5rem;
		}
	}

	/* Desktop: the activity card has room beside the summary. Below 1024
	   the pair stacks so neither card is squeezed. */
	@media (min-width: 1024px) {
		.test-summary-wrap {
			display: grid;
			grid-template-columns: minmax(0, 480px) minmax(300px, 360px);
			align-items: start;
			justify-content: center;
			gap: 24px;
		}

		.test-stats-slot {
			max-width: 360px;
		}
	}

	.test-main {
		width: 100%;
		max-width: 860px;
		margin: 0 auto;
		/* Clear the sticky footer (~64px) plus safe area so focused options and
		   the last question are never covered. */
		padding: 16px 0 calc(96px + var(--sab, 0px));
		flex: 1 1 auto;
	}

	.exit-backdrop {
		position: fixed;
		inset: 0;
		z-index: var(--z-modal-backdrop);
		display: grid;
		place-items: center;
		padding: 20px;
		background: var(--backdrop);
	}

	.exit-modal {
		width: 100%;
		max-width: 380px;
		padding: 20px;
		border: 1px solid var(--line);
		border-radius: var(--radius-overlay);
		background: var(--surface);
		box-shadow: var(--shadow-2);
	}

	@media (min-width: 640px) {
		.test-exit-label {
			display: inline;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.test-progress-fill {
			transition: none;
		}
	}
</style>
