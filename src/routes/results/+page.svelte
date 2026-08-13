<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import AnimatedHeight from '$lib/client/AnimatedHeight.svelte';
	import { localizedApiError, t } from '$lib/client/i18n';
	import { track } from '$lib/client/telemetry';
	import {
		buildReviewQueue,
		buildTopicMasteryItems,
		formatDuration,
		getAchievements,
		getStats,
		getStreak,
		getWeekActivity,
	} from '$lib/client/learning';
	import MarkdownContent from '$lib/client/MarkdownContent.svelte';
	import { showToast } from '$lib/client/toast';
	import {
		clearAttemptResult,
		clearDraftAnswers,
		clearDraftFlags,
		clearUnsubmittedTest,
		getAttemptResult,
		getHistory,
		getQuestionBookmarks,
		resolveTestRecord,
		toggleQuestionBookmark,
		upsertHistory,
	} from '$lib/client/storage';

	let questionPaper = $state(null);
	let loading = $state(true);
	let error = $state('');
	let loadingExplanation = $state({});
	let explanationError = $state({});
	let stats = $state(null);
	let streak = $state(null);
	let weekActivity = $state([]);
	let achievements = $state([]);
	let topicMastery = $state([]);
	let reviewQueue = $state({ today: [], upcoming: [] });
	let bookmarkedQuestionKeys = $state([]);
	let filter = $state('all');
	let expanded = $state({});
	let expansionInitialized = false;

	let totalQuestions = $derived(questionPaper?.questions?.length || 0);
	let percentage = $derived(
		questionPaper?.totalQuestions
			? Math.round((questionPaper.score / questionPaper.totalQuestions) * 100)
			: 0,
	);

	let correctCount = $derived(
		(questionPaper?.questions || []).filter(
			(question, index) =>
				(question.correct ?? (questionPaper.userAnswers?.[index] === question.answer)) === true,
		).length,
	);
	let unansweredCount = $derived(
		(questionPaper?.questions || []).filter(
			(question, index) => questionPaper.userAnswers?.[index] == null,
		).length,
	);
	let incorrectCount = $derived(totalQuestions - correctCount - unansweredCount);

	let filteredQuestions = $derived(
		(questionPaper?.questions || [])
			.map((question, index) => ({ question, index }))
			.filter(({ question, index }) => {
				const isCorrect = question.correct ?? (questionPaper.userAnswers?.[index] === question.answer);
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
			}),
	);

	const RING_RADIUS = 42;
	const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

	$effect(() => {
		if (!questionPaper || expansionInitialized) {
			return;
		}
		expansionInitialized = true;
		const defaults = {};
		questionPaper.questions.forEach((question, index) => {
			const isCorrect =
				question.correct ?? (questionPaper.userAnswers?.[index] === question.answer);
			defaults[index] = isCorrect !== true;
		});
		expanded = defaults;
	});

	onMount(async () => {
		const testId = page.url.searchParams.get('id');
		try {
			let resolved = await resolveTestRecord(testId);
			if (!resolved) {
				error = $t('resultNotFound');
				return;
			}

			const attemptResult = getAttemptResult(testId);
			if (attemptResult?.results) {
				const resultByIndex = new Map(
					attemptResult.results.map((item) => [item.index, item]),
				);
				resolved = {
					...resolved,
					...attemptResult,
					userAnswers:
						resolved.userAnswers ||
						Object.fromEntries(
							attemptResult.results.map((item) => [item.index, item.yourAnswer]),
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
						question.correct === undefined &&
						typeof question.answer !== 'string',
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
		}
	});

	function refreshLearningPanels() {
		const history = getHistory();
		stats = getStats(history);
		streak = getStreak();
		weekActivity = getWeekActivity(streak);
		achievements = getAchievements();
		topicMastery = buildTopicMasteryItems(history);
		reviewQueue = buildReviewQueue(history);
		const bookmarkKeys = new Set(
			getQuestionBookmarks().map((item) => `${item.question}::${item.answer}`),
		);
		bookmarkedQuestionKeys = (questionPaper?.questions || [])
			.filter((question) => bookmarkKeys.has(questionKey(question)))
			.map((question) => questionKey(question));
	}

	function questionKey(question) {
		return `${question.question}::${question.answer}`;
	}

	function toggleBookmark(question) {
		toggleQuestionBookmark(question, {
			testId: questionPaper.id,
			topic: questionPaper.topic,
		});
		track('results:bookmark-question', { q: question.question?.slice(0, 40) });
		refreshLearningPanels();
	}

	function toggleExpanded(index) {
		expanded = {
			...expanded,
			[index]: !expanded[index],
		};
		track('results:toggle-question', { q: index });
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
					question: question.question,
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
					: item,
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

	async function shareResult() {
		track('results:share');
		const url = `${window.location.origin}/test?id=${encodeURIComponent(questionPaper.id)}`;
		const title = `${questionPaper.topic} - ${questionPaper.questions.length} questions`;
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

	function retakeTest() {
		if (!questionPaper?.id) {
			return;
		}
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
</svelte:head>

<section class="container py-4">
	{#if loading}
		<div class="py-5 text-center">
			<div class="thinking-dots" role="status" aria-label={$t('loading')}>
				<span></span><span></span><span></span>
			</div>
			<p class="text-muted mt-3">{$t('loading')}</p>
		</div>
	{:else if error}
		<div class="alert alert-warning">{error}</div>
		<div class="d-flex flex-wrap gap-2">
			{#if questionPaper?.id && !questionPaper.userAnswers}
				<a class="btn btn-primary" href={`/test?id=${encodeURIComponent(questionPaper.id)}`}>
					{$t('backToTest')}
				</a>
			{/if}
			<a class="btn btn-outline-primary" href="/history">{$t('history')}</a>
		</div>
	{:else if questionPaper}
		<div class="result-summary bg-body border rounded-3 p-4 shadow-sm mb-4">
			<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
				<p class="text-muted small mb-0">{$t('score')}</p>
				<span class="badge text-bg-primary">{$t('testId')}: {questionPaper.id}</span>
			</div>
			<h1 class="display-6 fw-bold mb-2">
				<MarkdownContent content={questionPaper.topic} tag="span" />
			</h1>
			<div class="d-flex flex-wrap align-items-center gap-3">
				<div class="score-ring" role="img" aria-label={`${percentage}%`}>
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
					<span class="score-ring-label">{percentage}%</span>
				</div>
				<div>
					<div class="h4 mb-1">
						{questionPaper.score} / {questionPaper.totalQuestions}
					</div>
					<p class="text-muted mb-0">
						{$t('timeSpent')}: {Math.round((questionPaper.timeTaken || 0) / 60)} {$t('minuteShort')}
					</p>
				</div>
			</div>
			<div class="d-flex flex-wrap gap-2 mt-3 no-print">
				<button class="btn btn-sm btn-outline-secondary" type="button" onclick={() => { window.print(); track('results:print'); }}>
					{$t('print')}
				</button>
				<button class="btn btn-sm btn-outline-primary" type="button" onclick={shareResult}>
					{$t('share')}
				</button>
				<button class="btn btn-sm btn-outline-secondary" type="button" onclick={retakeTest}>
					{$t('retakeTest')}
				</button>
				<a class="btn btn-sm btn-outline-primary" href={practiceMoreHref()}>
					{$t('practiceMore')}
				</a>
				<a class="btn btn-sm btn-primary" href="/">{$t('startNewQuiz')}</a>
			</div>
		</div>

		<div class="filter-bar bg-body border rounded-3 p-2 mb-4" role="group" aria-label={$t('reviewAnswers')}>
			<button class="filter-chip" class:active={filter === 'all'} type="button" onclick={() => (filter = 'all')}>
				{$t('filterAll')}<span class="filter-count">{totalQuestions}</span>
			</button>
			<button class="filter-chip" class:active={filter === 'correct'} type="button" onclick={() => (filter = 'correct')}>
				{$t('filterCorrect')}<span class="filter-count">{correctCount}</span>
			</button>
			<button class="filter-chip" class:active={filter === 'incorrect'} type="button" onclick={() => (filter = 'incorrect')}>
				{$t('filterIncorrect')}<span class="filter-count">{incorrectCount}</span>
			</button>
			<button class="filter-chip" class:active={filter === 'unanswered'} type="button" onclick={() => (filter = 'unanswered')}>
				{$t('filterUnanswered')}<span class="filter-count">{unansweredCount}</span>
			</button>
		</div>

		<div class="row g-3 mb-4">
			<div class="col-md-6">
				<section class="result-panel bg-body border rounded-3 p-3">
					<div class="d-flex align-items-center justify-content-between gap-3">
						<div>
							<h2 class="h6 fw-bold mb-1">{$t('streaks')}</h2>
							<p class="text-muted small mb-0">{$t('dayStreak')}</p>
						</div>
						<div class="display-6 fw-bold text-primary">{streak?.currentStreak || 0}</div>
					</div>
					<div class="week-strip mt-3">
						{#each weekActivity as day (day.date)}
							<span class:active={day.active} class:today={day.isToday} title={day.date}></span>
						{/each}
					</div>
					<p class="small text-muted mt-2 mb-0">{$t('best')}: {streak?.longestStreak || 0}</p>
				</section>
			</div>
			<div class="col-md-6">
				<section class="result-panel bg-body border rounded-3 p-3">
					<h2 class="h6 fw-bold">{$t('yourProgress')}</h2>
					<div class="stats-grid">
						<div><strong>{stats?.totalTests || 0}</strong><span>{$t('quizzes')}</span></div>
						<div><strong>{stats?.averageScore || 0}%</strong><span>{$t('avgScore')}</span></div>
						<div><strong>{stats?.totalQuestions || 0}</strong><span>{$t('questionsHeading')}</span></div>
						<div><strong>{formatDuration(stats?.totalTime || 0, $t('minuteShort'), $t('hourShort'))}</strong><span>{$t('timeSpent')}</span></div>
					</div>
				</section>
			</div>
		</div>

		{#if achievements.some((item) => item.unlocked) || topicMastery.length > 0}
			<div class="row g-3 mb-4">
				<section class="col-lg-6">
					<div class="result-panel bg-body border rounded-3 p-3">
						<h2 class="h6 fw-bold">{$t('achievements')}</h2>
						<div class="d-flex flex-wrap gap-2">
							{#each achievements.filter((item) => item.unlocked).slice(0, 6) as achievement (achievement.id)}
								<span class="badge text-bg-success achievement-badge">{$t(`achievement_${achievement.id}_title`)}</span>
							{/each}
						</div>
					</div>
				</section>
				<section class="col-lg-6">
					<div class="result-panel bg-body border rounded-3 p-3">
						<h2 class="h6 fw-bold">{$t('topicMasteryTitle')}</h2>
						{#each topicMastery as item (item.id)}
							<div class="d-flex justify-content-between gap-3 border-bottom py-2">
								<span class="text-truncate">{item.topic}</span>
								<span class={item.status === 'strong' ? 'text-success' : 'text-warning'}>
									{item.latestAccuracy}%
								</span>
							</div>
						{/each}
					</div>
				</section>
			</div>
		{/if}

		{#if reviewQueue.today.length > 0 || reviewQueue.upcoming.length > 0}
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
				{@const isCorrect = question.correct ?? (userAnswer === question.answer)}
				<article class="bg-body border rounded-3 p-3 shadow-sm">
					<button
						class="review-card-head"
						type="button"
						aria-expanded={expanded[index] === true}
						onclick={() => toggleExpanded(index)}
					>
						<span class="review-card-question">
							<span class="review-card-number">{index + 1}.</span>
							<MarkdownContent content={question.question} />
						</span>
						<span class="badge" class:bg-success={isCorrect} class:bg-danger={!isCorrect}>
							{isCorrect ? $t('correct') : userAnswer == null ? $t('notAnswered') : $t('incorrect')}
						</span>
						<span class="review-chevron" class:open={expanded[index] === true} aria-hidden="true">▾</span>
					</button>
					<AnimatedHeight class="review-region">
						{#if expanded[index] === true}
							<div class="review-card-body">
								<button
									class="btn btn-sm btn-outline-secondary mb-2 no-print"
									type="button"
									onclick={() => toggleBookmark(question)}
								>
									{bookmarkedQuestionKeys.includes(questionKey(question))
										? $t('removeQuestionBookmark')
										: $t('bookmarkQuestion')}
								</button>
								<p class="mb-1">
									<span class="fw-semibold">{$t('yourAnswer')}:</span>
									<span class:text-success={isCorrect} class:text-danger={!isCorrect}>
										<MarkdownContent content={userAnswer || $t('notAnswered')} />
									</span>
								</p>
								{#if question.options?.length}
									<div class="answer-options mb-3">
										<div class="small fw-semibold text-muted mb-1">{$t('options')}</div>
										{#each question.options as option, optionIndex (optionIndex)}
											<div
												class="review-option"
												class:correct-option={option === question.answer}
												class:user-option={option === userAnswer && option !== question.answer}
											>
												<MarkdownContent content={option} />
											</div>
										{/each}
									</div>
								{/if}
								<p class="mb-3">
									<span class="fw-semibold">{$t('correctAnswer')}:</span>
									<span class="text-success"><MarkdownContent content={question.answer} /></span>
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
												<span style="margin-left:6px">{$t('generatingExplanation')}</span>
											{:else}
												{$t('generateExplanation')}
											{/if}
										</button>
									{/if}
								</AnimatedHeight>
								{#if explanationError[index]}
									<div class="text-danger small mt-2">{explanationError[index]}</div>
								{/if}
							</div>
						{/if}
					</AnimatedHeight>
				</article>
			{/each}
		</div>
	{/if}
</section>

<style>
	.result-summary {
		max-width: 860px;
	}

	.result-summary h1 {
		font-size: clamp(1.75rem, 7vw, 2.25rem);
	}

	.result-panel {
		height: 100%;
	}

	.week-strip {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 6px;
	}

	.week-strip span {
		height: 12px;
		border-radius: 999px;
		background: var(--surface-muted);
	}

	.week-strip span.active {
		background: var(--color-brand-600);
	}

	.week-strip span.today {
		outline: 2px solid rgba(var(--brand-rgb), 0.25);
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
		border-radius: 8px;
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
		border-radius: 8px;
		color: inherit;
		text-decoration: none;
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
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.22), transparent);
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
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: 8px;
	}

	.correct-option {
		border-color: #059669;
		background: rgba(25, 135, 84, 0.08);
	}

	.user-option {
		border-color: #dc2626;
		background: rgba(220, 53, 69, 0.08);
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
		border-color: var(--color-brand-600);
		background: color-mix(in srgb, var(--color-brand-600) 12%, var(--surface));
		color: var(--color-brand-600);
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
		color: #fff;
	}

	.score-ring {
		position: relative;
		width: 96px;
		height: 96px;
	}

	.score-ring svg {
		width: 100%;
		height: 100%;
		transform: rotate(-90deg);
	}

	.ring-track {
		fill: none;
		stroke: var(--surface-muted);
		stroke-width: 8;
	}

	.ring-progress {
		fill: none;
		stroke: var(--color-brand-600);
		stroke-width: 8;
		stroke-linecap: round;
		transition: stroke-dashoffset 500ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.score-ring-label {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: 1.35rem;
		font-weight: 700;
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
		color: var(--color-brand-600);
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
		margin-top: 2px;
		color: var(--text-muted);
		font-size: 0.9rem;
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
