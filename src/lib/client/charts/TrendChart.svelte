<script>
	import { onDestroy, onMount } from 'svelte';
	import {
		buildTicks,
		chartGeometry,
		compactNumber,
		linePath,
		areaPath,
		pickEvenIndices,
	} from './chartMath.js';
	import { formatNumber } from '#lib/client/formatting.js';

	let {
		labels = [],
		series = [],
		height = 220,
		valueFormatter = formatNumber,
		integerAxis = true,
		ariaLabel = 'Chart',
		dataWindow = '',
	} = $props();

	let container = $state(null);
	let width = $state(720);
	let activeIndex = $state(-1);
	let frame = 0;

	onMount(() => {
		const element = container;
		if (!element) return;
		if (typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver((entries) => {
			const next = entries[0]?.contentRect?.width;
			if (next) width = Math.max(next, 260);
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	onDestroy(() => cancelAnimationFrame(frame));

	const allValues = $derived(series.flatMap((entry) => entry.values || []));
	const ticks = $derived(buildTicks(Math.max(...allValues, 0), 4, { integer: integerAxis }));
	const axisMax = $derived(ticks.at(-1) || 1);
	const plot = $derived(
		chartGeometry([], {
			width,
			height,
			padding: { top: 14, right: 14, bottom: 26, left: 44 },
			max: axisMax,
		})
	);
	const xCount = $derived(labels.length || series[0]?.values?.length || 0);
	const xPoints = $derived(
		Array.from({ length: xCount }, (_, index) =>
			xCount <= 1
				? plot.pad.left + plot.plotWidth / 2
				: plot.pad.left + (index / (xCount - 1)) * plot.plotWidth
		)
	);
	const labelIndices = $derived(pickEvenIndices(labels.length, width < 520 ? 4 : 6));
	const paths = $derived(
		series.map((entry) => {
			const values = (entry.values || []).map((value) => Number(value) || 0);
			const local = chartGeometry(values, {
				width,
				height,
				padding: { top: 14, right: 14, bottom: 26, left: 44 },
				max: axisMax,
			});
			return {
				...entry,
				values,
				points: local.points,
				line: linePath(local.points),
				area: areaPath(local.points, local.baselineY),
			};
		})
	);
	const maxLabels = $derived(Math.max(...series.map((entry) => entry.values?.length || 0), 0));

	function indexForClientX(clientX) {
		const element = container;
		if (!element || maxLabels <= 1) return 0;
		const rect = element.getBoundingClientRect();
		const relative = clientX - rect.left;
		const left = plot.pad.left;
		const usable = Math.max(plot.plotWidth, 1);
		const ratio = (relative - left) / usable;
		return Math.min(Math.max(Math.round(ratio * (maxLabels - 1)), 0), maxLabels - 1);
	}

	function scheduleActive(clientX) {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			activeIndex = indexForClientX(clientX);
		});
	}

	function onKeydown(event) {
		if (!maxLabels) return;
		if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
			event.preventDefault();
			const direction = event.key === 'ArrowRight' ? 1 : -1;
			const next =
				activeIndex < 0 ? (direction > 0 ? 0 : maxLabels - 1) : activeIndex + direction;
			activeIndex = Math.min(Math.max(next, 0), maxLabels - 1);
		} else if (event.key === 'Escape') {
			activeIndex = -1;
		}
	}

	const tooltipLeft = $derived.by(() => {
		if (activeIndex < 0) return 0;
		const point = xPoints[activeIndex] ?? 0;
		return Math.min(Math.max(point - 84, 8), Math.max(width - 184, 8));
	});
	const activeLabel = $derived(
		activeIndex >= 0 ? labels[activeIndex] || `#${activeIndex + 1}` : ''
	);
</script>

<div
	class="trend"
	bind:this={container}
	role="slider"
	tabindex="0"
	aria-label={ariaLabel}
	aria-valuemin="0"
	aria-valuemax={Math.max(maxLabels - 1, 0)}
	aria-valuenow={activeIndex < 0 ? 0 : activeIndex}
	aria-valuetext={activeIndex >= 0 ? activeLabel : 'No point selected'}
	data-window={dataWindow}
	data-points={maxLabels}
	onkeydown={onKeydown}
	onpointermove={(event) => scheduleActive(event.clientX)}
	onpointerdown={(event) => scheduleActive(event.clientX)}
	onpointerleave={() => (activeIndex = -1)}
>
	<svg {width} {height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
		{#each ticks as tick (tick)}
			{@const y = plot.yFor(tick)}
			<line class="grid-line" x1={plot.pad.left} x2={width - plot.pad.right} {y}></line>
			<text
				class="y-label"
				x={plot.pad.left - 8}
				{y}
				text-anchor="end"
				dominant-baseline="middle"
			>
				{compactNumber(tick)}
			</text>
		{/each}

		{#each paths as entry (entry.key || entry.label)}
			<g class="series {entry.tone || 'brand'}">
				{#if entry.style === 'area'}
					<path class="series-area" d={entry.area}></path>
				{/if}
				<path class="series-line" class:is-ghost={entry.style === 'ghost'} d={entry.line}
				></path>
			</g>
		{/each}

		{#if activeIndex >= 0}
			{@const x = xPoints[activeIndex]}
			<line class="cursor-line" x1={x} x2={x} y1={plot.pad.top} y2={height - plot.pad.bottom}
			></line>
			{#each paths as entry (entry.key || entry.label)}
				{#if entry.style !== 'ghost' && entry.points[activeIndex]}
					<circle
						class="cursor-dot {entry.tone || 'brand'}"
						cx={entry.points[activeIndex].x}
						cy={entry.points[activeIndex].y}
						r="4"
					></circle>
				{/if}
			{/each}
		{/if}

		{#each labelIndices as index (index)}
			<text
				class="x-label"
				x={xPoints[index]}
				y={height - 6}
				text-anchor={index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle'}
			>
				{labels[index] ?? ''}
			</text>
		{/each}
	</svg>

	{#if activeIndex >= 0}
		<div class="trend-tooltip" style={`left: ${tooltipLeft}px; top: 8px`}>
			<p class="tooltip-day">{activeLabel}</p>
			{#each paths as entry (entry.key || entry.label)}
				{#if entry.style !== 'ghost'}
					<p class="tooltip-row">
						<span class="swatch {entry.tone || 'brand'}"></span>
						<span>{entry.label}</span>
						<strong>{valueFormatter(entry.values[activeIndex] ?? 0)}</strong>
					</p>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.trend {
		position: relative;
		width: 100%;
		min-width: 0;
		touch-action: pan-y;
	}

	.trend:focus-visible {
		border-radius: 8px;
		outline: 2px solid var(--brand-text);
		outline-offset: 2px;
	}

	svg {
		display: block;
		max-width: 100%;
		overflow: visible;
	}

	.grid-line {
		stroke: var(--line);
		stroke-width: 1;
		stroke-dasharray: 3 5;
	}

	.y-label,
	.x-label {
		fill: var(--text-muted);
		font-size: 10px;
	}

	.series {
		--series-color: var(--brand-text);
	}

	.series.danger,
	.swatch.danger {
		--series-color: var(--danger);
	}

	.series.warn,
	.swatch.warn {
		--series-color: var(--warn);
	}

	.series.neutral,
	.swatch.neutral {
		--series-color: var(--text-muted);
	}

	.series-area {
		fill: var(--series-color);
		fill-opacity: 0.12;
		stroke: none;
	}

	.series-line {
		fill: none;
		stroke: var(--series-color);
		stroke-width: 2.25;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.series-line.is-ghost {
		stroke-width: 1.5;
		stroke-dasharray: 5 5;
		opacity: 0.55;
	}

	.cursor-line {
		stroke: var(--text-muted);
		stroke-width: 1;
		stroke-dasharray: 3 4;
		opacity: 0.7;
	}

	.cursor-dot {
		fill: var(--surface);
		stroke: var(--series-color, var(--brand-text));
		stroke-width: 2;
	}

	.trend-tooltip {
		position: absolute;
		z-index: 2;
		width: 176px;
		padding: 8px 10px;
		border: 1px solid var(--line);
		border-radius: 8px;
		background: var(--surface);
		box-shadow: var(--shadow-2);
		pointer-events: none;
	}

	.tooltip-day {
		margin: 0 0 4px;
		color: var(--text-muted);
		font-size: 0.68rem;
		font-weight: 600;
	}

	.tooltip-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 2px 0 0;
		color: var(--text-muted);
		font-size: 0.7rem;
	}

	.tooltip-row strong {
		margin-left: auto;
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}

	.swatch {
		width: 8px;
		height: 8px;
		flex: none;
		border-radius: 999px;
		background: var(--series-color);
	}

	.swatch.brand {
		--series-color: var(--brand-text);
	}
</style>
