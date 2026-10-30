<script>
	import { formatNumber } from '#lib/client/formatting.js';

	let {
		items = [],
		valueFormatter = formatNumber,
		maxValue = null,
		limit = 12,
		ariaLabel = 'Ranked values',
		dataWindow = '',
	} = $props();

	const rows = $derived((items || []).slice(0, limit));
	const max = $derived(
		Math.max(Number(maxValue) || 0, ...rows.map((row) => Number(row.value) || 0), 1)
	);
</script>

<ol class="rank" aria-label={ariaLabel} data-window={dataWindow}>
	{#each rows as row (row.key ?? row.label)}
		{@const percent = Math.max(((Number(row.value) || 0) / max) * 100, 1.5)}
		<li class="rank-row">
			<div class="rank-line">
				<span class="rank-label" title={row.label}>{row.label}</span>
				<span class="rank-value">
					{valueFormatter(row.value)}
					{#if row.note}<span class="rank-note">{row.note}</span>{/if}
				</span>
			</div>
			<div class="rank-track" aria-hidden="true">
				<span
					class="rank-fill {row.tone || 'brand'}"
					style={`width: ${Math.min(percent, 100)}%`}
				></span>
			</div>
		</li>
	{/each}
</ol>

<style>
	.rank {
		display: grid;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.rank-row {
		display: grid;
		gap: 5px;
		min-width: 0;
	}

	.rank-line {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
		min-width: 0;
	}

	.rank-label {
		min-width: 0;
		overflow: hidden;
		color: var(--text);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.72rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.rank-value {
		flex: none;
		color: var(--text);
		font-size: 0.72rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.rank-note {
		margin-left: 5px;
		color: var(--text-muted);
		font-weight: 500;
	}

	.rank-track {
		height: 7px;
		overflow: hidden;
		border-radius: 999px;
		background: var(--surface-muted);
	}

	.rank-fill {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--bar-color, var(--brand-text));
		opacity: 0.9;
		transition: width var(--motion-base) var(--ease-out);
	}

	.rank-fill.brand {
		--bar-color: var(--brand-text);
	}

	.rank-fill.danger {
		--bar-color: var(--danger);
	}

	.rank-fill.warn {
		--bar-color: var(--warn);
	}

	.rank-fill.neutral {
		--bar-color: var(--text-muted);
	}

	@media (prefers-reduced-motion: reduce) {
		.rank-fill {
			transition: none;
		}
	}
</style>
