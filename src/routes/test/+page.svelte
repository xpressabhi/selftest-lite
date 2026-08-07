<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { localizedApiError, t } from '$lib/client/i18n';
	import { track } from '$lib/client/telemetry';
	import AnimatedHeight from '$lib/client/AnimatedHeight.svelte';
	import { estimateQuestionCardHeight } from '$lib/client/pretextLayout';
	import { recordStreakActivity, unlockAchievements } from '$lib/client/learning';
	import MarkdownContent from '$lib/client/MarkdownContent.svelte';
	import ReviewSheet from '$lib/client/ReviewSheet.svelte';
	import { autoAdvance, setAutoAdvance } from '$lib/client/preferences';
	import {
		clearDraftAnswers,
		clearDraftFlags,
		clearUnsubmittedTest,
		getHistory,
		readDraftAnswers,
		readDraftFlags,
		resolveTestRecord,
		saveAttemptResult,
		saveUnsubmittedTest,
		submitTestAnswers,
		upsertHistory,
		writeDraftAnswers,
		writeDraftFlags,
	} from '$lib/client/storage';
	import { pushAttempt } from '$lib/client/sync';

	let questionPaper = $state(null);
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
	let questionCardWidth = $state(0);
	let questionCardEstimate = $state(null);
	let autoAdvanceTimer = null;

	let answeredCount = $derived(Object.keys(answers).length);
	let totalQuestions = $derived(questionPaper?.questions?.length || 0);
	let flaggedCount = $derived(flagged.length);
	let hasDraftAnswers = $derived(Object.keys(answers).length > 0);
	let testMode = $derived(
		questionPaper?.testMode || questionPaper?.requestParams?.testMode || 'quiz-practice',
	);
	let testDifficulty = $derived(
		questionPaper?.difficulty || questionPaper?.requestParams?.difficulty || '',
	);
	let testLanguage = $derived(
		questionPaper?.language || questionPaper?.requestParams?.language || 'english',
	);
	let positionPercent = $derived(
		totalQuestions > 0 ? Math.round(((currentQuestionIndex + 1) / totalQuestions) * 100) : 0,
	);
	let question = $derived(questionPaper?.questions?.[currentQuestionIndex]);

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

	onMount(async () => {
		const testId = page.url.searchParams.get('id');
		try {
			questionPaper = await resolveTestRecord(testId);
			if (!questionPaper) {
				error = $t('testNotFound');
				return;
			}
			if (questionPaper.userAnswers) {
				await goto(`/results?id=${questionPaper.id}`);
				return;
			}
			answers = readDraftAnswers(questionPaper.id);
			flagged = readDraftFlags(questionPaper.id);
			saveUnsubmittedTest(questionPaper);
		} catch (caughtError) {
			error = caughtError.message || $t('testNotFound');
		} finally {
			loading = false;
		}
	});

	function startTest() {
		if (!questionPaper || testStarted) {
			return;
		}
		startedAt = Date.now();
		showOverflowMenu = false;
		track('test:start', {
			id: questionPaper.id,
			mode: questionPaper.testMode || '',
			language: questionPaper.language || '',
		});
		testStarted = true;
	}

	function setAnswer(index, option) {
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
		track('test:answer', { q: index });
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
			const correctAnswer =
				typeof question?.answer === 'string' ? question.answer : null;
			return {
				index,
				correct:
					yourAnswer !== null && yourAnswer === correctAnswer,
				yourAnswer,
				correctAnswer,
			};
		});
		return {
			score: results.filter((result) => result.correct).length,
			totalQuestions: results.length,
			timeTaken,
			results,
		};
	}

	async function submitTest() {
		if (!questionPaper || submitting) {
			return;
		}
		submitting = true;
		error = '';
		track('test:submit');
		const finalAnswers = { ...answers };
		const timeTaken = Math.round((Date.now() - startedAt) / 1000);
		try {
			const hasLocalAnswerKey = questionPaper.questions.some(
				(question) => typeof question?.answer === 'string' && question.answer.length > 0,
			);
			const gradedResult = hasLocalAnswerKey
				? gradeLocally(questionPaper, finalAnswers, timeTaken)
				: await submitTestAnswers({
						id: questionPaper.id,
						answers: finalAnswers,
						timeTaken,
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
			clearUnsubmittedTest(questionPaper.id);
			upsertHistory(submittedPaper);
			// Locally-graded attempts never hit /api/test/submit; push them to
			// the server (best-effort, offline-safe) so history survives across
			// devices and survives sign-in via client_id attribution.
			pushAttempt({
				testId: questionPaper.id,
				userAnswers: finalAnswers,
				score: gradedResult.score,
				totalQuestions: gradedResult.totalQuestions,
				timeTaken,
				submittedAt: new Date().toISOString(),
			});
			const nextHistory = [
				submittedPaper,
				...getHistory().filter((entry) => String(entry.id) !== String(submittedPaper.id)),
			];
			const streak = recordStreakActivity();
			unlockAchievements(nextHistory, streak);
			showReviewSheet = false;
			goto(`/results?id=${questionPaper.id}`);
		} catch (caughtError) {
			track('test:submit-fail');
			const localized = caughtError?.data
				? localizedApiError(caughtError.data, $t, caughtError.status)
				: '';
			error = localized || caughtError.message || $t('submitFailed');
			submitting = false;
		}
	}

	async function shareTest() {
		if (!questionPaper) {
			return;
		}
		track('test:share');

		const url = `${window.location.origin}/test?id=${encodeURIComponent(questionPaper.id)}`;
		const title = `${questionPaper.topic} - ${questionPaper.questions.length} questions`;
		if (navigator.share) {
			await navigator.share({
				title,
				text: title,
				url,
			});
			return;
		}
		await navigator.clipboard.writeText(url);
		alert($t('shareLinkCopied'));
	}

	function nextQuestion() {
		track('test:next', { from: currentQuestionIndex });
		selectQuestion(
			Math.min(currentQuestionIndex + 1, (questionPaper?.questions?.length || 1) - 1),
		);
	}

	function previousQuestion() {
		track('test:prev', { from: currentQuestionIndex });
		selectQuestion(Math.max(currentQuestionIndex - 1, 0));
	}

	function selectQuestion(nextIndex) {
		if (nextIndex === currentQuestionIndex) {
			return;
		}
		window.clearTimeout(autoAdvanceTimer);
		track('test:jump', { to: nextIndex });
		navigationDirection = nextIndex > currentQuestionIndex ? 'forward' : 'backward';
		currentQuestionIndex = nextIndex;
	}

	function jumpFromSheet(index) {
		selectQuestion(index);
		showReviewSheet = false;
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
		goto('/');
	}
</script>

<svelte:head>
	<title>{questionPaper?.topic || $t('testPrefix')} | selftest.in</title>
</svelte:head>

<section class="test-shell">
	{#if loading}
		<div class="py-5 text-center">
			<div class="spinner-border text-primary" role="status"></div>
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
				<span aria-hidden="true">←</span>
				<span class="test-exit-label">{$t('exit')}</span>
			</button>
			<h1 class="test-topic">
				<MarkdownContent content={questionPaper.topic} tag="span" />
			</h1>
			<div class="test-header-actions">
				{#if testStarted}
					<button
						class="test-overflow-btn"
						type="button"
						aria-label={$t('menu')}
						aria-expanded={showOverflowMenu}
						onclick={() => (showOverflowMenu = !showOverflowMenu)}
					>
						⋯
					</button>
					{#if showOverflowMenu}
						<div class="test-overflow-menu">
							<label class="overflow-switch">
								<input
									type="checkbox"
									checked={$autoAdvance}
									onchange={(event) => setAutoAdvance(event.currentTarget.checked)}
								/>
								<span>{$t('autoAdvance')}</span>
							</label>
						</div>
					{/if}
				{/if}
			</div>
		</header>

		{#if !testStarted}
			<main class="test-summary-wrap">
				<div class="test-summary-card">
					<span class="test-summary-badge" aria-hidden="true">📝</span>
					<h2 class="test-summary-title">{$t('testSummaryTitle')}</h2>
					<p class="test-summary-topic">
						<MarkdownContent content={questionPaper.topic} tag="span" />
					</p>
					<div class="test-summary-meta">
						<span class="test-meta-chip">
							{$t('questionsCountFormat', { count: totalQuestions })}
						</span>
						<span class="test-meta-chip">
							{testMode === 'full-exam' ? $t('fullExamPaper') : $t('quizPractice')}
						</span>
						{#if testDifficulty}
							<span class="test-meta-chip">{$t(testDifficulty) || testDifficulty}</span>
						{/if}
						<span class="test-meta-chip">
							{testLanguage === 'hindi' ? $t('hindiLabel') : $t('englishLabel')}
						</span>
					</div>
					<p class="test-summary-body">{$t('testSummaryBody')}</p>
					<div class="test-summary-actions">
						<button class="btn btn-outline-primary" type="button" onclick={shareTest}>
							{$t('share')}
						</button>
						<button class="btn btn-primary" type="button" onclick={startTest}>
							{hasDraftAnswers ? $t('continueTest') : $t('startTest')}
						</button>
					</div>
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
			<div class="test-card-frame" bind:this={questionCardHost}>
				<div class="test-card-head">
					<span class="test-question-no">
						{$t('question')} {currentQuestionIndex + 1} {$t('of')} {totalQuestions}
					</span>
					<button
						class="test-flag"
						class:active={flagged.includes(currentQuestionIndex)}
						type="button"
						aria-pressed={flagged.includes(currentQuestionIndex)}
						onclick={() => toggleFlag(currentQuestionIndex)}
					>
						<span aria-hidden="true">⚑</span>
						<span>{flagged.includes(currentQuestionIndex) ? $t('flaggedQuestions') : $t('flagForReview')}</span>
					</button>
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
							<h2 class="test-question-text">
								<MarkdownContent content={question.question} />
							</h2>
							<div class="d-grid gap-2">
								{#each question.options || [] as option, optionIndex (optionIndex)}
									<button
										class="test-option"
										class:selected={answers[currentQuestionIndex] === option}
										type="button"
										onclick={() => setAnswer(currentQuestionIndex, option)}
									>
										<span class="test-option-letter" aria-hidden="true">
											{String.fromCharCode(65 + optionIndex)}
										</span>
										<span class="test-option-text">
											<MarkdownContent content={option} />
										</span>
										{#if answers[currentQuestionIndex] === option}
											<span class="test-option-check" aria-hidden="true">✓</span>
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
					<span class="test-flag-badge" aria-label={`${$t('flaggedQuestions')}: ${flaggedCount}`}>
						<span aria-hidden="true">⚑</span> {flaggedCount}
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
				answers={answers}
				flagged={flagged}
				currentIndex={currentQuestionIndex}
				submitting={submitting}
				error={error}
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
						<button class="btn btn-outline-secondary" type="button" onclick={() => (showExitModal = false)}>
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
		border-radius: 8px;
		background: transparent;
		color: inherit;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.test-exit:hover,
	.test-exit:focus-visible {
		background: var(--surface-muted);
		outline: none;
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
		font-size: 1.3rem;
		line-height: 1;
	}

	.test-overflow-btn:hover,
	.test-overflow-btn:focus-visible,
	.test-overflow-btn[aria-expanded='true'] {
		background: var(--surface-muted);
		outline: none;
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
		border-radius: 10px;
		background: var(--surface);
		box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
	}

	.test-overflow-menu button,
	.overflow-switch {
		display: flex;
		width: 100%;
		min-height: 44px;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: inherit;
		font-size: 0.9rem;
		font-weight: 600;
		text-align: left;
	}

	.test-overflow-menu button:hover {
		background: var(--surface-muted);
	}

	.overflow-switch {
		cursor: pointer;
	}

	.overflow-switch input {
		width: 18px;
		height: 18px;
		accent-color: var(--color-brand-600);
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

	.test-summary-wrap {
		display: flex;
		flex: 1 1 auto;
		align-items: center;
		justify-content: center;
		padding: 24px 16px calc(24px + env(safe-area-inset-bottom));
	}

	.test-summary-card {
		width: 100%;
		max-width: 480px;
		padding: 28px 22px;
		border: 1px solid var(--line);
		border-radius: 18px;
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
		border-radius: 16px;
		background: color-mix(in srgb, var(--color-brand-600) 12%, var(--surface));
		font-size: 1.6rem;
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
		padding: 16px 12px 24px;
		flex: 1 1 auto;
	}

	.test-card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 10px;
	}

	.test-question-no {
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 600;
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
		border-color: #d97706;
		background: rgba(217, 119, 6, 0.1);
		color: #b45309;
	}

	.test-flag:hover,
	.test-flag:focus-visible {
		outline: none;
		border-color: #d97706;
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
		border-radius: 12px;
		background: var(--surface);
		color: var(--text);
		font-size: 0.95rem;
		font-weight: 500;
		text-align: left;
		transition: border-color 150ms ease, background 150ms ease;
	}

	.test-option:hover,
	.test-option:focus-visible {
		border-color: var(--color-brand-500);
		outline: none;
	}

	.test-option.selected {
		border-color: var(--color-brand-600);
		background: color-mix(in srgb, var(--color-brand-600) 12%, var(--surface));
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
		border-color: var(--color-brand-600);
		background: var(--color-brand-600);
		color: #fff;
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
		color: #fff;
		font-size: 0.85rem;
		font-weight: 700;
	}

	.test-bottom-bar {
		position: sticky;
		bottom: 0;
		z-index: 1010;
		padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
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
	}

	.test-flag-badge {
		display: inline-flex;
		min-height: 44px;
		align-items: center;
		gap: 4px;
		padding: 0 12px;
		border-radius: 999px;
		background: rgba(217, 119, 6, 0.12);
		color: #b45309;
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
		border-radius: 14px;
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
