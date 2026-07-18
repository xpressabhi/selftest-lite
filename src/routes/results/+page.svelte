<script>
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import AnimatedHeight from '$lib/client/AnimatedHeight.svelte';
	import { t } from '$lib/client/i18n';
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
	import {
		getHistory,
		isQuestionBookmarked,
		resolveTestRecord,
		toggleQuestionBookmark,
		upsertHistory,
	} from '$lib/client/storage';

	let questionPaper = null;
	let loading = true;
	let error = '';
	let loadingExplanation = {};
	let explanationError = {};
	let stats = null;
	let streak = null;
	let weekActivity = [];
	let achievements = [];
	let topicMastery = [];
	let reviewQueue = { today: [], upcoming: [] };
	let bookmarkedQuestionKeys = [];

	$: percentage = questionPaper?.totalQuestions
		? Math.round((questionPaper.score / questionPaper.totalQuestions) * 100)
		: 0;

	onMount(async () => {
		const testId = page.url.searchParams.get('id');
		try {
			questionPaper = await resolveTestRecord(testId);
			if (!questionPaper) {
				error = 'Result not found.';
				return;
			}
			if (!questionPaper.userAnswers) {
				error = 'This test has not been submitted yet.';
			}
		} catch (caughtError) {
			error = caughtError.message || 'Failed to load result.';
		} finally {
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
		bookmarkedQuestionKeys = (questionPaper?.questions || [])
			.filter((question) => isQuestionBookmarked(question))
			.map((question) => `${question.question}::${question.answer}`);
	}

	function questionKey(question) {
		return `${question.question}::${question.answer}`;
	}

	function toggleBookmark(question) {
		toggleQuestionBookmark(question, {
			testId: questionPaper.id,
			topic: questionPaper.topic,
		});
		refreshLearningPanels();
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
				throw new Error(data?.error || 'Unable to fetch explanation.');
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
		const url = `${window.location.origin}/results?id=${encodeURIComponent(questionPaper.id)}`;
		const title = `${questionPaper.topic} - ${questionPaper.score}/${questionPaper.totalQuestions}`;
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
</script>

<svelte:head>
	<title>{questionPaper?.topic || $t('testResults')} | selftest.in</title>
</svelte:head>

<section class="container py-4">
	{#if loading}
		<div class="py-5 text-center">
			<div class="spinner-border text-primary" role="status"></div>
			<p class="text-muted mt-3">{$t('loading')}</p>
		</div>
	{:else if error}
		<div class="alert alert-warning">{error}</div>
		<a class="btn btn-primary" href="/history">{$t('history')}</a>
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
				<div class="score-circle">{percentage}%</div>
				<div>
					<div class="h4 mb-1">
						{questionPaper.score} / {questionPaper.totalQuestions}
					</div>
					<p class="text-muted mb-0">
						{$t('timeSpent')}: {Math.round((questionPaper.timeTaken || 0) / 60)} min
					</p>
				</div>
			</div>
			<div class="d-flex flex-wrap gap-2 mt-3 no-print">
				<button class="btn btn-sm btn-outline-secondary" type="button" onclick={() => window.print()}>
					{$t('print')}
				</button>
				<button class="btn btn-sm btn-outline-primary" type="button" onclick={shareResult}>
					{$t('share')}
				</button>
				<a class="btn btn-sm btn-primary" href="/">{$t('startNewQuiz')}</a>
			</div>
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
								<span class="badge text-bg-success achievement-badge">{achievement.title}</span>
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

		<div class="d-grid gap-3">
			{#each questionPaper.questions as question, index (`${index}-${question.question}`)}
				{@const userAnswer = questionPaper.userAnswers?.[index]}
				{@const isCorrect = userAnswer === question.answer}
				<article class="bg-body border rounded-3 p-3 shadow-sm">
					<div class="d-flex align-items-start justify-content-between gap-3">
						<div class="h6 lh-base mb-2">
							<span>{index + 1}. </span><MarkdownContent content={question.question} />
						</div>
						<span class:badge={true} class:bg-success={isCorrect} class:bg-danger={!isCorrect}>
							{isCorrect ? $t('correct') : $t('reviewAnswers')}
						</span>
					</div>
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
							{#each question.options as option (option)}
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
								{loadingExplanation[index] ? $t('generatingExplanation') : $t('generateExplanation')}
							</button>
						{/if}
					</AnimatedHeight>
					{#if explanationError[index]}
						<div class="text-danger small mt-2">{explanationError[index]}</div>
					{/if}
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

	.score-circle {
		display: grid;
		width: 88px;
		height: 88px;
		place-items: center;
		border-radius: 999px;
		background: var(--color-brand-600);
		color: #fff;
		font-size: 1.5rem;
		font-weight: 700;
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
</style>
