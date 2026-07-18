<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { t } from '$lib/client/i18n';
	import AnimatedHeight from '$lib/client/AnimatedHeight.svelte';
	import { estimateQuestionCardHeight } from '$lib/client/pretextLayout';
	import { recordStreakActivity, unlockAchievements } from '$lib/client/learning';
	import MarkdownContent from '$lib/client/MarkdownContent.svelte';
	import {
		clearDraftAnswers,
		clearUnsubmittedTest,
		getHistory,
		readDraftAnswers,
		resolveTestRecord,
		saveUnsubmittedTest,
		upsertHistory,
		writeDraftAnswers,
	} from '$lib/client/storage';

	let questionPaper = $state(null);
	let answers = $state({});
	let currentQuestionIndex = $state(0);
	let loading = $state(true);
	let error = $state('');
	let startedAt = $state(Date.now());
	let showQuestionPanel = $state(false);
	let navigationDirection = $state('forward');
	let questionCardHost = $state();
	let questionCardWidth = $state(0);
	let questionCardEstimate = $state(null);

	let answeredCount = $derived(Object.keys(answers).length);
	let totalQuestions = $derived(questionPaper?.questions?.length || 0);
	let unansweredCount = $derived(Math.max(0, totalQuestions - answeredCount));

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
			saveUnsubmittedTest(questionPaper);
			startedAt = Date.now();
		} catch (caughtError) {
			error = caughtError.message || $t('testNotFound');
		} finally {
			loading = false;
		}
	});

	function setAnswer(index, option) {
		answers = {
			...answers,
			[index]: option,
		};
	}

	function submitTest() {
		if (!questionPaper) {
			return;
		}
		if (unansweredCount > 0 && !confirm(`${$t('unansweredWarning')} ${unansweredCount} ${$t('unansweredQuestions')}. ${$t('submitNow')}?`)) {
			return;
		}
		const score = questionPaper.questions.filter(
			(question, index) => answers[index] === question.answer,
		).length;
		const submittedPaper = {
			...questionPaper,
			userAnswers: answers,
			score,
			totalQuestions: questionPaper.questions.length,
			timeTaken: Math.round((Date.now() - startedAt) / 1000),
			timestamp: Date.now(),
		};
		clearDraftAnswers(questionPaper.id);
		clearUnsubmittedTest(questionPaper.id);
		upsertHistory(submittedPaper);
		const nextHistory = [submittedPaper, ...getHistory().filter((entry) => String(entry.id) !== String(submittedPaper.id))];
		const streak = recordStreakActivity();
		unlockAchievements(nextHistory, streak);
		goto(`/results?id=${questionPaper.id}`);
	}

	async function shareTest() {
		if (!questionPaper) {
			return;
		}

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
		selectQuestion(
			Math.min(currentQuestionIndex + 1, (questionPaper?.questions?.length || 1) - 1),
		);
	}

	function previousQuestion() {
		selectQuestion(Math.max(currentQuestionIndex - 1, 0));
	}

	function selectQuestion(nextIndex) {
		if (nextIndex === currentQuestionIndex) {
			return;
		}
		navigationDirection = nextIndex > currentQuestionIndex ? 'forward' : 'backward';
		currentQuestionIndex = nextIndex;
	}
</script>

<svelte:head>
	<title>{questionPaper?.topic || $t('testPrefix')} | selftest.in</title>
</svelte:head>

<section class="container py-4">
	{#if loading}
		<div class="py-5 text-center">
			<div class="spinner-border text-primary" role="status"></div>
			<p class="text-muted mt-3">{$t('loading')}</p>
		</div>
	{:else if error}
		<div class="alert alert-danger">{error}</div>
		<a class="btn btn-primary" href="/">{$t('startNewTest')}</a>
	{:else if questionPaper}
		<div class="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-3">
			<div>
				<div class="d-flex flex-wrap align-items-center gap-2 mb-1">
					<p class="text-muted small mb-0">
						{$t('question')} {currentQuestionIndex + 1} {$t('of')} {questionPaper.questions.length}
					</p>
					<span class="badge text-bg-primary">{$t('testId')}: {questionPaper.id}</span>
				</div>
				<h1 class="h4 fw-bold mb-0">
					<MarkdownContent content={questionPaper.topic} tag="span" />
				</h1>
			</div>
			<div class="d-flex flex-wrap gap-2">
				<button class="btn btn-outline-secondary" type="button" onclick={() => (showQuestionPanel = !showQuestionPanel)}>
					{$t('questionsHeading')}
				</button>
				<button class="btn btn-outline-primary" type="button" onclick={shareTest}>
					{$t('share')}
				</button>
				<button class="btn btn-success" type="button" onclick={submitTest}>
					{$t('submitTest')}
				</button>
			</div>
		</div>

		<div class="submit-summary bg-body border rounded-3 p-3 mb-3">
			<div>
				<strong>{answeredCount}</strong>
				<span>{$t('answeredCount')}</span>
			</div>
			<div>
				<strong>{unansweredCount}</strong>
				<span>{$t('unansweredQuestions')}</span>
			</div>
			<div>
				<strong>{Math.round((Date.now() - startedAt) / 60000)}</strong>
				<span>{$t('minutesLabel')}</span>
			</div>
		</div>

		<div class="progress mb-3" role="progressbar">
			<div
				class="progress-bar"
				style={`width: ${((Object.keys(answers).length || 0) / questionPaper.questions.length) * 100}%`}
			></div>
		</div>

		{@const question = questionPaper.questions[currentQuestionIndex]}
		<div class="test-card-frame" bind:this={questionCardHost}>
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
						<div class="h5 lh-base mb-3">
							<MarkdownContent content={question.question} />
						</div>
						<div class="d-grid gap-2">
							{#each question.options || [] as option (option)}
								<button
									class="btn option-button text-start"
									class:btn-primary={answers[currentQuestionIndex] === option}
									class:btn-outline-secondary={answers[currentQuestionIndex] !== option}
									type="button"
									onclick={() => setAnswer(currentQuestionIndex, option)}
								>
									<MarkdownContent content={option} />
								</button>
							{/each}
						</div>
					</div>
				{/key}
			</AnimatedHeight>
		</div>

		{#if showQuestionPanel}
			<div class="question-panel bg-body border rounded-3 p-3 mt-3">
				<div class="d-flex justify-content-between align-items-center gap-2 mb-2">
					<h2 class="h6 fw-bold mb-0">{$t('questionsHeading')}</h2>
					<button class="btn btn-sm btn-outline-secondary" type="button" onclick={() => (showQuestionPanel = false)}>
						{$t('closeMenu')}
					</button>
				</div>
				<div class="question-grid">
					{#each questionPaper.questions as navigatorQuestion, index (navigatorQuestion.question)}
						<button
							class="question-dot"
							class:answered={answers[index]}
							class:active={index === currentQuestionIndex}
							aria-label={`Go to question ${index + 1}`}
							type="button"
							onclick={() => {
								selectQuestion(index);
								showQuestionPanel = false;
							}}
						>
							{index + 1}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<div class="d-flex align-items-center justify-content-between gap-2 mt-3">
			<button
				class="btn btn-outline-secondary"
				type="button"
				disabled={currentQuestionIndex === 0}
				onclick={previousQuestion}
			>
				{$t('tourPrevious')}
			</button>
			<div class="d-flex flex-wrap justify-content-center gap-1 compact-dots">
				{#each questionPaper.questions as navigatorQuestion, index (navigatorQuestion.question)}
					<button
						class="question-dot"
						class:answered={answers[index]}
						class:active={index === currentQuestionIndex}
						aria-label={`Go to question ${index + 1}`}
						type="button"
						onclick={() => selectQuestion(index)}
					>
						{index + 1}
					</button>
				{/each}
			</div>
			<button
				class="btn btn-outline-primary"
				type="button"
				disabled={currentQuestionIndex === questionPaper.questions.length - 1}
				onclick={nextQuestion}
			>
				{$t('tourNext')}
			</button>
		</div>
	{/if}
</section>

<style>
	:global(.test-card) {
		width: 100%;
	}

	.test-card-frame {
		max-width: 860px;
		margin: 0 auto;
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

	.option-button {
		min-height: 48px;
		white-space: normal;
	}

	.question-dot {
		width: 44px;
		height: 44px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
		color: var(--text);
		font-size: 0.8rem;
	}

	.question-dot.answered {
		border-color: var(--color-brand-600);
	}

	.question-dot.active {
		background: var(--color-brand-600);
		border-color: var(--color-brand-600);
		color: #fff;
	}

	.submit-summary {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
		text-align: center;
	}

	.submit-summary div {
		display: flex;
		min-height: 54px;
		align-items: center;
		flex-direction: column;
		justify-content: center;
		border-radius: 8px;
		background: var(--surface-muted);
	}

	.submit-summary span {
		color: var(--text-muted);
		font-size: 0.75rem;
	}

	.question-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
		gap: 8px;
	}

	@media (max-width: 575.98px) {
		.compact-dots {
			display: none !important;
		}
	}
</style>
