<script>
	import { onMount } from 'svelte';
	import { buildTicks, chartGeometry, compactNumber, pickEvenIndices } from './chartMath.js';
	import { formatNumber } from '#lib/client/formatting.js';

	let {
		items = [],
		height = 220,
		valueFormatter = formatNumber,
		integerAxis = true,
		ariaLabel = 'Bar chart',
		dataWindow = '',
		showTotals = true,
	} = $props();

	let container = $state(null);
	let width = $state(720);
	let activeIndex = $state(-1);

	onMount(() => {
		const element = container;
		if (!element || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver((entries) => {
			const next = entries[0]?.contentRect?.width;
			if (next) width = Math.max(next, 260);
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	const normalized = $derived(
		(items || []).map((item) => {
			const segments =
				item.segments?.length > 0
					? item.segments.map((segment) => ({
							...segment,
							value: Math.max(Number(segment.value) || 0, 0),
						}))
					: [
							{
								label: item.label,
								value: Math.max(Number(item.value) || 0, 0),
								tone: 'brand',
							},
						];
			return {
				...item,
				segments,
				total: segments.reduce((sum, segment) => sum + segment.value, 0),
			};
		})
	);
	const ticks = $derived(
		buildTicks(Math.max(...normalized.map((item) => item.total), 0), 4, {
			integer: integerAxis,
		})
	);
	const axisMax = $derived(ticks.at(-1) || 1);
	const plot = $derived(
		chartGeometry([], {
			width,
			height,
			padding: { top: 16, right: 10, bottom: 28, left: 44 },
			max: axisMax,
		})
	);
	const labelIndices = $derived(pickEvenIndices(normalized.length, width < 520 ? 4 : 6));
	const bandWidth = $derived(plot.plotWidth / Math.max(normalized.length, 1));
	const barWidth = $derived(Math.min(28, Math.max(bandWidth * 0.58, 4)));
	const tooltipLeft = $derived.by(() => {
		if (activeIndex < 0) return 8;
		const center = plot.pad.left + bandWidth * activeIndex + bandWidth / 2;
		return Math.min(Math.max(center - 86, 8), Math.max(width - 184, 8));
	});
	const drawn = $derived(
		normalized.map((item) => {
			let cursor = plot.baselineY;
			const segments = item.segments.map((segment) => {
				const segmentHeight = (segment.value / axisMax) * plot.plotHeight;
				const y = cursor - segmentHeight;
				cursor -= segmentHeight;
				return { ...segment, y, segmentHeight };
			});
			return { ...item, segments, topY: cursor };
		})
	);
</script>

<div
	class="bars"
	bind:this={container}
	role="img"
	aria-label={ariaLabel}
	data-window={dataWindow}
	data-points={normalized.length}
>
	<svg {width} {height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
		{#each ticks as tick (tick)}
			{@const y = plot.yFor(tick)}
			<line class="grid-line" x1={plot.pad.left} x2={width - plot.pad.right} {y}></line>
			<text
				class="y-label"
				x={plot.pad.left - 8}
				y={plot.yFor(tick)}
				text-anchor="end"
				dominant-baseline="middle"
			>
				{compactNumber(tick)}
			</text>
		{/each}

		{#each drawn as item, index (item.label)}
			{@const center = plot.pad.left + bandWidth * index + bandWidth / 2}
			{@const x = center - barWidth / 2}
			<g
				class="bar-group"
				class:is-active={activeIndex === index}
				role="img"
				aria-label={`${item.label}: ${item.total}`}
				onpointerenter={() => (activeIndex = index)}
				onpointerleave={() => (activeIndex = -1)}
				onpointerdown={() => (activeIndex = index)}
			>
				<rect
					class="bar-hit"
					x={center - bandWidth / 2}
					y={plot.pad.top}
					width={bandWidth}
					height={plot.plotHeight}
				></rect>
				{#each item.segments as segment, segmentIndex (segment.label || segmentIndex)}
					{#if segment.segmentHeight > 0}
						<rect
							class="bar {segment.tone || 'brand'}"
							{x}
							y={segment.y}
							width={barWidth}
							height={segment.segmentHeight}
							rx="3"
						></rect>
					{/if}
				{/each}
				{#if showTotals && item.total > 0 && normalized.length <= 12}
					<text class="bar-note" x={center} y={item.topY - 5} text-anchor="middle">
						{item.note ?? ''}
					</text>
				{/if}
			</g>
		{/each}

		{#each labelIndices as index (index)}
			<text
				class="x-label"
				x={plot.pad.left + bandWidth * index + bandWidth / 2}
				y={height - 6}
				text-anchor={index === 0
					? 'start'
					: index === normalized.length - 1
						? 'end'
						: 'middle'}
			>
				{normalized[index]?.shortLabel ?? normalized[index]?.label ?? ''}
			</text>
		{/each}
	</svg>

	{#if activeIndex >= 0 && normalized[activeIndex]}
		<div class="bars-tooltip" style={`left: ${tooltipLeft}px; top: 4px`}>
			<p class="tooltip-title">{normalized[activeIndex].label}</p>
			{#each normalized[activeIndex].segments as segment (segment.label || segment.value)}
				<p class="tooltip-row">
					<span class="swatch {segment.tone || 'brand'}"></span>
					<span>{segment.label}</span>
					<strong>{valueFormatter(segment.value)}</strong>
				</p>
			{/each}
		</div>
	{/if}
</div>

<style>
	.bars {
		position: relative;
		width: 100%;
		min-width: 0;
		touch-action: pan-y;
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

	.bar-group {
		cursor: default;
	}

	.bar-hit {
		fill: transparent;
	}

	.bar {
		fill: var(--bar-color, var(--brand-text));
		opacity: 0.9;
		pointer-events: none;
	}

	.bar-group.is-active .bar,
	.bar-group:hover .bar {
		opacity: 1;
	}

	.bar.brand,
	.swatch.brand {
		--bar-color: var(--brand-text);
	}

	.bar.danger,
	.swatch.danger {
		--bar-color: var(--danger);
	}

	.bar.warn,
	.swatch.warn {
		--bar-color: var(--warn);
	}

	.bar.neutral,
	.swatch.neutral {
		--bar-color: var(--text-muted);
	}

	.bar-note {
		fill: var(--text-muted);
		font-size: 9px;
		pointer-events: none;
	}

	.bars-tooltip {
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

	.tooltip-title {
		margin: 0 0 4px;
		color: var(--text);
		font-size: 0.72rem;
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
	}

	.swatch {
		width: 8px;
		height: 8px;
		flex: none;
		border-radius: 999px;
		background: var(--bar-color);
	}
</style>
