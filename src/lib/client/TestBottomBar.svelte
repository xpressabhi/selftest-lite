<script>
	import Icon from './Icon.svelte';
	import { t } from './i18n';

	let {
		positionPercent = 0,
		answeredCount = 0,
		totalQuestions = 0,
		flaggedCount = 0,
		currentQuestionIndex = 0,
		submitting = false,
		onOpenReview = () => {},
		onPrevious = () => {},
		onNext = () => {},
	} = $props();
</script>

<!-- Sticky test footer: progress pill (opens the review sheet), flagged
     count badge, and the previous/next/submit navigation actions. -->
<footer class="test-bottom-bar">
	<div class="test-bottom-inner">
		<button
			class="test-progress-pill"
			type="button"
			aria-label={$t('questionsHeading')}
			onclick={onOpenReview}
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
				onclick={onPrevious}
			>
				{$t('tourPrevious')}
			</button>
			{#if currentQuestionIndex === totalQuestions - 1}
				<button
					class="btn btn-success"
					type="button"
					disabled={submitting}
					onclick={onOpenReview}
				>
					{submitting ? $t('submittingAnswers') : $t('submitTest')}
				</button>
			{:else}
				<button class="btn btn-primary" type="button" onclick={onNext}>
					{$t('tourNext')}
				</button>
			{/if}
		</div>
	</div>
</footer>

<style>
	.test-bottom-bar {
		position: sticky;
		bottom: 0;
		z-index: var(--z-bottom-nav);
		padding: 8px 0 calc(8px + var(--sab, env(safe-area-inset-bottom, 0px)));
		border-top: 1px solid var(--line);
		background: var(--surface);
	}

	.test-bottom-inner {
		display: flex;
		flex-wrap: wrap;
		row-gap: 8px;
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

	@media (prefers-reduced-motion: reduce) {
		.pill-fill {
			transition: none;
		}
	}
</style>
