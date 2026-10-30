<script>
	import { formatNumber } from '#lib/client/formatting.js';

	let {
		segments = [],
		valueFormatter = formatNumber,
		ariaLabel = 'Distribution',
		dataWindow = '',
		showLegend = true,
	} = $props();

	const total = $derived(
		(segments || []).reduce((sum, segment) => sum + Math.max(Number(segment.value) || 0, 0), 0)
	);
	const rows = $derived(
		(segments || []).map((segment) => ({
			...segment,
			value: Math.max(Number(segment.value) || 0, 0),
			percent: total > 0 ? (Math.max(Number(segment.value) || 0, 0) / total) * 100 : 0,
		}))
	);
</script>

<div class="stacked" data-window={dataWindow}>
	<div class="stacked-bar" role="img" aria-label={ariaLabel}>
		{#each rows as row (row.label)}
			{#if row.percent > 0}
				<span
					class="stacked-segment {row.tone || 'brand'}"
					style={`width: ${row.percent}%`}
					title={`${row.label}: ${valueFormatter(row.value)} (${row.percent.toFixed(1)}%)`}
				></span>
			{/if}
		{/each}
	</div>
	{#if showLegend}
		<ul class="stacked-legend">
			{#each rows as row (row.label)}
				<li>
					<span class="dot {row.tone || 'brand'}" aria-hidden="true"></span>
					<span class="legend-label">{row.label}</span>
					<span class="legend-value">
						{valueFormatter(row.value)}
						<span class="legend-pct">{row.percent.toFixed(1)}%</span>
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.stacked {
		display: grid;
		gap: 9px;
	}

	.stacked-bar {
		display: flex;
		width: 100%;
		height: 12px;
		overflow: hidden;
		border-radius: 999px;
		background: var(--surface-muted);
	}

	.stacked-segment {
		height: 100%;
		min-width: 2px;
		background: var(--segment-color, var(--brand-text));
	}

	.stacked-segment + .stacked-segment {
		border-left: 2px solid var(--surface);
	}

	.stacked-segment.brand,
	.dot.brand {
		--segment-color: var(--brand-text);
	}

	.stacked-segment.danger,
	.dot.danger {
		--segment-color: var(--danger);
	}

	.stacked-segment.warn,
	.dot.warn {
		--segment-color: var(--warn);
	}

	.stacked-segment.neutral,
	.dot.neutral {
		--segment-color: var(--text-muted);
	}

	.stacked-segment.info,
	.dot.info {
		--segment-color: var(--color-slate-400);
	}

	.stacked-segment.success,
	.dot.success {
		--segment-color: var(--ok);
	}

	.stacked-legend {
		display: grid;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.stacked-legend li {
		display: flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
		color: var(--text-muted);
		font-size: 0.72rem;
	}

	.dot {
		width: 8px;
		height: 8px;
		flex: none;
		border-radius: 999px;
		background: var(--segment-color);
	}

	.legend-label {
		min-width: 0;
		overflow: hidden;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.legend-value {
		margin-left: auto;
		color: var(--text);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		white-space: nowrap;
	}

	.legend-pct {
		margin-left: 4px;
		color: var(--text-muted);
		font-weight: 500;
	}
</style>
