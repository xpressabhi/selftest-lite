<script>
	import { arcPath, donutSegments } from './chartMath.js';
	import { formatNumber } from '#lib/client/formatting.js';

	let {
		segments = [],
		size = 176,
		thickness = 17,
		centerLabel = '',
		centerValue = '',
		valueFormatter = formatNumber,
		ariaLabel = 'Composition',
		dataWindow = '',
	} = $props();

	const slices = $derived(donutSegments(segments));
	const center = $derived(size / 2);
	const radius = $derived(center - thickness / 2 - 2);
	const total = $derived(slices.reduce((sum, slice) => sum + slice.value, 0));
</script>

<div class="donut-layout" data-window={dataWindow}>
	<div
		class="donut-figure"
		style={`width: ${size}px; max-width: 100%`}
		role="img"
		aria-label={ariaLabel}
	>
		<svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
			<circle
				class="track"
				cx={center}
				cy={center}
				r={radius}
				fill="none"
				stroke-width={thickness}
			></circle>
			{#each slices as slice (slice.label)}
				{#if slice.full}
					<circle
						class="slice {slice.tone || 'brand'}"
						cx={center}
						cy={center}
						r={radius}
						fill="none"
						stroke-width={thickness}
					></circle>
				{:else}
					<path
						class="slice {slice.tone || 'brand'}"
						d={arcPath(center, center, radius, slice.startAngle, slice.endAngle)}
						fill="none"
						stroke-width={thickness}
					></path>
				{/if}
			{/each}
		</svg>
		{#if centerValue || centerLabel}
			<div class="donut-center">
				{#if centerLabel}<span>{centerLabel}</span>{/if}
				{#if centerValue}<strong>{centerValue}</strong>{/if}
			</div>
		{/if}
	</div>

	<ul class="donut-legend">
		{#each slices as slice (slice.label)}
			<li>
				<span class="dot {slice.tone || 'brand'}" aria-hidden="true"></span>
				<span class="legend-label">{slice.label}</span>
				<span class="legend-value">
					{valueFormatter(slice.value)}
					<span class="legend-pct">{slice.percent}%</span>
				</span>
			</li>
		{/each}
		{#if total === 0}
			<li class="legend-empty">No data in this window</li>
		{/if}
	</ul>
</div>

<style>
	.donut-layout {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 18px;
	}

	.donut-figure {
		position: relative;
		flex: none;
		margin-inline: auto;
	}

	svg {
		display: block;
		max-width: 100%;
		height: auto;
	}

	.track {
		stroke: var(--surface-muted);
	}

	.slice {
		stroke: var(--slice-color, var(--brand-text));
		stroke-linecap: butt;
	}

	.slice.brand {
		--slice-color: var(--brand-text);
	}

	.slice.danger {
		--slice-color: var(--danger);
	}

	.slice.warn {
		--slice-color: var(--warn);
	}

	.slice.neutral {
		--slice-color: var(--text-muted);
	}

	.slice.info {
		--slice-color: var(--color-slate-400);
	}

	.slice.success {
		--slice-color: var(--ok);
	}

	.donut-center {
		position: absolute;
		inset: 0;
		display: grid;
		place-content: center;
		gap: 1px;
		color: var(--text-muted);
		font-size: 0.68rem;
		text-align: center;
	}

	.donut-center strong {
		color: var(--text);
		font-size: 1.05rem;
		font-weight: 700;
	}

	.donut-legend {
		flex: 1 1 150px;
		display: grid;
		gap: 7px;
		min-width: 0;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.donut-legend li {
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
		background: var(--slice-color);
	}

	.dot.brand {
		--slice-color: var(--brand-text);
	}

	.dot.danger {
		--slice-color: var(--danger);
	}

	.dot.warn {
		--slice-color: var(--warn);
	}

	.dot.neutral {
		--slice-color: var(--text-muted);
	}

	.dot.info {
		--slice-color: var(--color-slate-400);
	}

	.dot.success {
		--slice-color: var(--ok);
	}

	.legend-label {
		min-width: 0;
		overflow: hidden;
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

	.legend-empty {
		color: var(--text-muted);
		font-style: italic;
	}
</style>
