<script>
	import AnimatedHeight from './AnimatedHeight.svelte';
	import Icon from './Icon.svelte';
	import { t } from './i18n';
	import MarkdownContent from './MarkdownContent.svelte';
	import QuestionAssertionReasoning from './QuestionAssertionReasoning.svelte';
	import QuestionMatching from './QuestionMatching.svelte';

	let {
		question,
		index,
		userAnswers,
		expanded,
		bookmarkPulse,
		bookmarkedQuestionKeys,
		reportSent,
		reportTarget,
		loadingExplanation,
		explanationError,
		questionKey,
		onToggleExpanded,
		onToggleBookmark,
		onReportQuestion,
		onSubmitReport,
		onFetchExplanation,
	} = $props();

	let userAnswer = $derived(userAnswers?.[index]);
	let isCorrect = $derived(question.correct ?? userAnswer === question.answer);
</script>

<article id={`question-${index}`} class="bg-body border rounded-3 p-3 shadow-sm">
	<button
		class="review-card-head"
		type="button"
		aria-expanded={expanded[index] === true}
		onclick={() => onToggleExpanded(index)}
	>
		<span class="review-card-question">
			<span class="review-card-number">{index + 1}.</span>
			<MarkdownContent
				content={question.question?.trim() ||
					(question.format === 'assertion-reasoning' ? $t('assertionReasoning') : '')}
				links="text"
			/>
		</span>
		<span class="badge" class:bg-success={isCorrect} class:bg-danger={!isCorrect}>
			{isCorrect ? $t('correct') : userAnswer == null ? $t('notAnswered') : $t('incorrect')}
		</span>
		<span class="review-chevron" class:open={expanded[index] === true} aria-hidden="true">
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
					onclick={() => onToggleBookmark(question)}
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
							onclick={() => onSubmitReport('wrong-key')}
						>
							{$t('reportWrongAnswer')}
						</button>
						<button
							class="btn btn-sm btn-outline-secondary"
							type="button"
							onclick={() => onSubmitReport('ambiguous')}
						>
							{$t('reportAmbiguous')}
						</button>
						<button
							class="btn btn-sm btn-outline-secondary"
							type="button"
							onclick={() => onSubmitReport('off-syllabus')}
						>
							{$t('reportOffSyllabus')}
						</button>
					</span>
				{:else}
					<button
						class="btn btn-sm btn-outline-secondary mb-2 ms-1 no-print"
						type="button"
						onclick={() => onReportQuestion(index)}
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
					<span class:text-success={isCorrect} class:text-danger={!isCorrect}>
						<MarkdownContent content={userAnswer || $t('notAnswered')} />
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
								class:user-option={optionIsUserAnswer && !optionIsCorrect}
							>
								{#if optionIsCorrect || optionIsUserAnswer}
									<span class="review-option-glyph" aria-hidden="true">
										<Icon name={optionIsCorrect ? 'check' : 'x'} size={16} />
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
							onclick={() => onFetchExplanation(index, question)}
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
					<div
						class="text-danger small mt-2 d-flex flex-wrap align-items-center gap-2"
						role="status"
					>
						<span>{explanationError[index]}</span>
						<button
							class="btn btn-sm btn-outline-danger"
							type="button"
							onclick={() => onFetchExplanation(index, question)}
						>
							{$t('tryAgain')}
						</button>
					</div>
				{/if}
			</div>
		{/if}
	</AnimatedHeight>
</article>

<style>
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

	.correct-option {
		border-color: var(--ok);
		background: color-mix(in srgb, var(--ok) 8%, transparent);
	}

	.user-option {
		border-color: var(--danger);
		background: color-mix(in srgb, var(--danger) 8%, transparent);
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
		min-width: 0;
		overflow-wrap: anywhere;
		font-weight: 600;
		line-height: 1.5;
	}

	.review-card-number {
		color: var(--text-muted);
		font-weight: 600;
	}

	/* Shared with the reminder link in the results page, which keeps its own
	   scoped copy of this rule. */
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
	}

	@media (prefers-reduced-motion: reduce) {
		.review-chevron {
			transition: none;
		}
	}
</style>
