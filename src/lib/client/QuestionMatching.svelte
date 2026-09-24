<script>
	import MarkdownContent from './MarkdownContent.svelte';
	import { t } from './i18n';

	let { question } = $props();

	const columnA = $derived(Array.isArray(question?.columnA) ? question.columnA : []);
	const columnB = $derived(Array.isArray(question?.columnB) ? question.columnB : []);
</script>

<!-- Match-the-columns body: Column I numbered 1-4 on the left, Column II
     lettered A-D on the right, rows aligned. The combination options are
     rendered by the host as regular option buttons. -->
<div class="question-matching">
	<div class="matching-labels">
		<span>{$t('columnI')}</span>
		<span>{$t('columnII')}</span>
	</div>
	<div class="matching-grid">
		{#each columnA as item, index (index)}
			<div class="matching-cell">
				<span class="matching-key">{index + 1}</span>
				<span class="matching-text">
					<MarkdownContent content={item} links="text" tag="span" />
				</span>
			</div>
		{/each}
		{#each columnB as item, index (index)}
			<div class="matching-cell">
				<span class="matching-key">{String.fromCharCode(65 + index)}</span>
				<span class="matching-text">
					<MarkdownContent content={item} links="text" tag="span" />
				</span>
			</div>
		{/each}
	</div>
</div>

<style>
	.question-matching {
		display: grid;
		gap: 6px;
		margin-bottom: 12px;
	}

	.matching-labels {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}

	.matching-labels span {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted, #6c757d);
	}

	.matching-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: repeat(4, auto);
		grid-auto-flow: column;
		gap: 6px;
	}

	.matching-cell {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		min-width: 0;
		padding: 6px 8px;
		border-radius: 8px;
		background: var(--surface-muted, #f6f8fc);
	}

	.matching-key {
		display: inline-flex;
		flex: 0 0 22px;
		align-items: center;
		justify-content: center;
		height: 22px;
		border-radius: 6px;
		background: rgba(13, 27, 62, 0.08);
		color: var(--text-muted, #4a5268);
		font-size: 0.72rem;
		font-weight: 700;
	}

	.matching-text {
		min-width: 0;
		font-size: 0.9rem;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
</style>
