<script>
	import { t } from '$lib/client/i18n';

	let {
		total = 0,
		answers = {},
		flagged = [],
		currentIndex = 0,
		submitting = false,
		error = '',
		onClose,
		onJump,
		onSubmit,
	} = $props();

	let answeredCount = $derived(Object.keys(answers).length);
	let unansweredCount = $derived(Math.max(0, total - answeredCount));
	let firstUnanswered = $derived(
		Array.from({ length: total }, (_, index) => index).find(
			(index) => answers[index] === undefined
		)
	);

	function handleKeydown(event) {
		if (event.key === 'Escape') {
			onClose?.();
		}
	}

	$effect(() => {
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previousOverflow;
		};
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="sheet-backdrop"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget) {
			onClose?.();
		}
	}}
>
	<div
		class="review-sheet"
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		aria-label={$t('reviewAnswers')}
	>
		<div class="sheet-handle" aria-hidden="true"></div>

		<header class="sheet-header">
			<h2 class="sheet-title">{$t('reviewAnswers')}</h2>
			<span class="sheet-count">
				<strong>{answeredCount}</strong> / {total}
				{$t('answeredLabel')}
			</span>
			<button
				class="sheet-close"
				type="button"
				aria-label={$t('closeMenu')}
				onclick={onClose}
			>
				×
			</button>
		</header>

		<div class="sheet-body">
			<div class="sheet-grid">
				{#each Array.from({ length: total }, (_, index) => index) as index (index)}
					<button
						class="sheet-tile"
						class:answered={answers[index] !== undefined}
						class:flagged={flagged.includes(index)}
						class:current={index === currentIndex}
						aria-label={$t('goToQuestion', { count: index + 1 })}
						type="button"
						onclick={() => onJump?.(index)}
					>
						{index + 1}
					</button>
				{/each}
			</div>
			<div class="sheet-legend">
				<span><i class="legend-dot answered"></i>{$t('answeredLabel')}</span>
				<span><i class="legend-dot"></i>{$t('unansweredLabel')}</span>
				<span><i class="legend-dot flagged"></i>{$t('flaggedQuestions')}</span>
			</div>
		</div>

		<footer class="sheet-footer">
			{#if unansweredCount > 0}
				<p class="sheet-warning" role="alert">
					{$t('unansweredWarning')}
					{unansweredCount}
					{$t('unansweredQuestions')}.
				</p>
			{/if}
			{#if error}
				<p class="sheet-error" role="alert">{error}</p>
			{/if}
			<div class="sheet-actions">
				{#if firstUnanswered !== undefined}
					<button
						class="btn btn-outline-secondary"
						type="button"
						onclick={() => onJump?.(firstUnanswered)}
					>
						{$t('reviewUnanswered')}
					</button>
				{/if}
				<button
					class="btn btn-success"
					type="button"
					disabled={submitting}
					onclick={onSubmit}
				>
					{#if submitting}
						<span class="thinking-dots" style="margin-right:6px">
							<span></span><span></span><span></span>
						</span>
					{/if}
					{submitting ? $t('submittingAnswers') : $t('submitTest')}
				</button>
			</div>
		</footer>
	</div>
</div>

<style>
	.sheet-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1200;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding: 16px;
		background: rgba(15, 23, 42, 0.55);
		animation: backdrop-in 180ms ease-out both;
	}

	.review-sheet {
		width: 100%;
		max-width: 560px;
		max-height: min(82vh, 640px);
		display: flex;
		flex-direction: column;
		border: 1px solid var(--line);
		border-radius: 16px 16px 10px 10px;
		background: var(--surface);
		box-shadow: 0 20px 50px rgba(15, 23, 42, 0.3);
		animation: sheet-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	.sheet-handle {
		width: 40px;
		height: 4px;
		margin: 8px auto 0;
		border-radius: 999px;
		background: var(--line);
	}

	.sheet-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px 10px;
	}

	.sheet-title {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
	}

	.sheet-count {
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.sheet-count strong {
		color: var(--color-brand-600);
	}

	.sheet-close {
		display: grid;
		width: 44px;
		height: 44px;
		margin-left: auto;
		place-items: center;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-muted);
		font-size: 1.4rem;
		line-height: 1;
	}

	.sheet-close:hover,
	.sheet-close:focus-visible {
		background: var(--surface-muted);
		color: var(--text);
	}

	.sheet-body {
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 6px 16px 12px;
	}

	.sheet-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
		gap: 8px;
	}

	.sheet-tile {
		position: relative;
		display: grid;
		min-height: 44px;
		place-items: center;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface);
		color: var(--text);
		font-size: 0.85rem;
		font-weight: 600;
	}

	.sheet-tile.answered {
		border-color: var(--color-brand-600);
		background: var(--color-brand-600);
		color: #fff;
	}

	.sheet-tile.current {
		box-shadow:
			0 0 0 2px var(--surface),
			0 0 0 4px var(--color-brand-600);
	}

	.sheet-tile.flagged::after {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: #d97706;
		content: '';
	}

	.sheet-tile.answered.flagged::after {
		background: #fde68a;
	}

	.sheet-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		margin-top: 12px;
		color: var(--text-muted);
		font-size: 0.75rem;
	}

	.sheet-legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.legend-dot {
		width: 10px;
		height: 10px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--surface);
	}

	.legend-dot.answered {
		border-color: var(--color-brand-600);
		background: var(--color-brand-600);
	}

	.legend-dot.flagged {
		border-color: #d97706;
		background: #d97706;
	}

	.sheet-footer {
		padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--line);
	}

	.sheet-warning {
		margin: 0 0 10px;
		padding: 8px 12px;
		border-radius: 8px;
		background: rgba(217, 119, 6, 0.1);
		color: #b45309;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.sheet-error {
		margin: 0 0 10px;
		padding: 8px 12px;
		border-radius: 8px;
		background: rgba(220, 53, 69, 0.1);
		color: #dc2626;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.sheet-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.sheet-actions .btn {
		flex: 1 1 auto;
		min-height: 48px;
	}

	@keyframes backdrop-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes sheet-in {
		from {
			opacity: 0;
			transform: translate3d(0, 24px, 0);
		}
		to {
			opacity: 1;
			transform: translate3d(0, 0, 0);
		}
	}

	@media (min-width: 640px) {
		.sheet-backdrop {
			align-items: center;
		}

		.review-sheet {
			border-radius: 16px;
		}

		.sheet-handle {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet-backdrop,
		.review-sheet {
			animation: none;
		}
	}
</style>
