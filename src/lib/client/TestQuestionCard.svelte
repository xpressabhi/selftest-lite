<script>
	import AnimatedHeight from './AnimatedHeight.svelte';
	import Icon from './Icon.svelte';
	import MarkdownContent from './MarkdownContent.svelte';
	import QuestionAssertionReasoning from './QuestionAssertionReasoning.svelte';
	import QuestionMatching from './QuestionMatching.svelte';
	import { t } from './i18n';

	let {
		question = null,
		questionIndex = 0,
		totalQuestions = 0,
		navigationDirection = 'forward',
		questionFormatLabel = '',
		currentSection = null,
		currentSectionPosition = 0,
		sectionCount = 0,
		sectionFirstQuestion = false,
		suggestedSectionMinutes = null,
		estimatedHeight = null,
		selectedAnswer = null,
		eliminatedOptions = null,
		flagActive = false,
		canUseHint = false,
		showHintSoon = false,
		hintCharge = 0,
		onAnswer = () => {},
		onFlag = () => {},
		onHint = () => {},
		onSwipeStart = () => {},
		onSwipeEnd = () => {},
		host = $bindable(),
		heading = $bindable(),
	} = $props();

	let hintUsed = $derived(Boolean(eliminatedOptions));

	function isEliminated(optionIndex) {
		return (eliminatedOptions || []).includes(optionIndex);
	}
</script>

<!-- Question card: per-question chrome (number, format chip, hint, flag),
     the section banner, the question stem, the format-specific body and the
     option list. The page owns state and handlers and passes them in. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="test-card-frame"
	bind:this={host}
	ontouchstart={onSwipeStart}
	ontouchend={onSwipeEnd}
>
	<div class="test-card-head">
		<span class="test-question-no">
			{$t('question')}
			{questionIndex + 1}
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
					class:used={hintUsed}
					type="button"
					disabled={!canUseHint}
					aria-label={hintUsed ? $t('hintUsed') : $t('hintFiftyFifty')}
					title={canUseHint ? $t('hintFiftyFifty') : $t('hintUnlockSoon')}
					onclick={onHint}
				>
					<span aria-hidden="true">50-50</span>
					<span class="visually-hidden">
						{hintUsed ? $t('hintUsed') : $t('hintFiftyFifty')}
					</span>
				</button>
				{#if showHintSoon && !hintUsed}
					<span class="hint-charge" aria-hidden="true">
						<span style={`width: ${Math.round(hintCharge * 100)}%`}></span>
					</span>
				{/if}
			</span>
			<button
				class="test-flag"
				class:active={flagActive}
				type="button"
				aria-pressed={flagActive}
				aria-label={flagActive ? $t('flaggedQuestions') : $t('flagForReview')}
				onclick={onFlag}
			>
				<Icon name="flag" size={18} />
				<span>{flagActive ? $t('flaggedQuestions') : $t('flagForReview')}</span>
			</button>
			{#if showHintSoon}
				<span class="hint-soon" role="status">{$t('hintUnlockSoon')}</span>
			{/if}
		</div>
	</div>
	<AnimatedHeight
		class="test-card bg-body border rounded-3 p-3 p-md-4 shadow-sm"
		estimatedHeight={estimatedHeight}
	>
		{#key questionIndex}
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
								total: sectionCount,
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
					bind:this={heading}
					tabindex="-1"
				>
					{#if question.question}
						<MarkdownContent content={question.question} />
					{:else}
						{$t('question')}
						{questionIndex + 1}
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
							class:selected={selectedAnswer === option}
							class:eliminated={isEliminated(optionIndex)}
							type="button"
							aria-pressed={selectedAnswer === option}
							aria-disabled={isEliminated(optionIndex)}
							disabled={isEliminated(optionIndex)}
							onclick={() => onAnswer(option)}
						>
							<span class="test-option-letter" aria-hidden="true">
								{String.fromCharCode(65 + optionIndex)}
							</span>
							<span class="test-option-text">
								<MarkdownContent content={option} links="text" />
							</span>
							{#if selectedAnswer === option}
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

<style>
	.test-card-head {
		display: flex;
		flex-wrap: wrap;
		row-gap: 8px;
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

	/* Phones: the teaser text is the first thing to go when the question
	   header runs out of room; the state is still exposed on the hint
	   button itself. */
	@media (max-width: 639.98px) {
		.hint-soon {
			display: none;
		}
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
		min-width: 0;
		overflow-wrap: anywhere;
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
</style>
