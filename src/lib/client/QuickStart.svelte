<script>
	import { t } from '$lib/client/i18n';

	let {
		bookmarkedExams = [],
		bookmarkedQuizPresets = [],
		onQuickStartExam = () => {},
		onQuickStartPreset = () => {},
		disabled = false,
	} = $props();

	const HAS_ITEMS = $derived(bookmarkedExams.length > 0 || bookmarkedQuizPresets.length > 0);
</script>

{#if HAS_ITEMS}
	<section class="quickstart-section">
		<h2 class="quickstart-title">{$t('quickStart')}</h2>
		<div class="quickstart-chips">
			{#each bookmarkedExams as exam (exam.id)}
				<button
					class="quickstart-chip exam-chip"
					type="button"
					onclick={() => onQuickStartExam(exam.id)}
					disabled={disabled}
				>
					<span class="chip-star" aria-hidden="true">&#9733;</span>
					<span class="chip-text">{exam.name}</span>
				</button>
			{/each}
			{#each bookmarkedQuizPresets as preset (preset.id)}
				<button
					class="quickstart-chip preset-chip"
					type="button"
					onclick={() => onQuickStartPreset(preset)}
					disabled={disabled}
				>
					<span class="chip-star" aria-hidden="true">&#9733;</span>
					<span class="chip-text">{preset.label}</span>
				</button>
			{/each}
		</div>
	</section>
{/if}

<style>
	.quickstart-section {
		margin-bottom: 16px;
	}

	.quickstart-title {
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin: 0 0 10px;
	}

	.quickstart-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.quickstart-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--text);
		font-size: 0.82rem;
		font-weight: 500;
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease, transform 0.12s ease;
		min-height: 44px;
	}

	.quickstart-chip:hover:not(:disabled) {
		border-color: rgb(var(--brand-rgb));
		background: rgba(var(--brand-rgb), 0.04);
		transform: translateY(-1px);
	}

	.quickstart-chip:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.exam-chip .chip-star {
		color: #f59e0b;
	}

	.preset-chip .chip-star {
		color: rgb(var(--brand-rgb));
	}

	.chip-text {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 240px;
	}
</style>
