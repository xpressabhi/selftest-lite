<script>
	import { onDestroy, onMount } from 'svelte';
	import { compactNumber, linePath, niceMax, pickEvenIndices } from './chartMath.js';
	import { formatNumber } from '#lib/client/formatting.js';

	let {
		labels = [],
		points = [],
		height = 250,
		valueFormatter = formatNumber,
		ariaLabel = 'Tests and visits over time',
		dataWindow = '',
	} = $props();

	let container = $state(null);
	let width = $state(720);
	let activeIndex = $state(-1);
	let frame = 0;

	onMount(() => {
		const element = container;
		if (!element || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver((entries) => {
			const next = entries[0]?.contentRect?.width;
			if (next) width = Math.max(next, 280);
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	onDestroy(() => cancelAnimationFrame(frame));

	const pad = { top: 18, right: 44, bottom: 28, left: 44 };
	const plotWidth = $derived(Math.max(width - pad.left - pad.right, 1));
	const plotHeight = $derived(Math.max(height - pad.top - pad.bottom, 1));
	const baselineY = $derived(pad.top + plotHeight);
	const maxVisits = $derived(Math.max(...points.map((point) => Number(point.visits) || 0), 0));
	const maxTests = $derived(
		Math.max(
			...points.map((point) =>
				Math.max(Number(point.created) || 0, Number(point.attempted) || 0)
			),
			0
		)
	);
	const leftMax = $derived(axisBound(maxVisits));
	const rightMax = $derived(axisBound(maxTests));
	const count = $derived(points.length);
	const bandWidth = $derived(plotWidth / Math.max(count, 1));
	const barWidth = $derived(Math.min(20, Math.max(bandWidth * 0.52, 3)));
	const labelIndices = $derived(pickEvenIndices(labels.length, width < 520 ? 4 : 6));
	const xPoints = $derived(
		Array.from({ length: count }, (_, index) =>
			count <= 1 ? pad.left + plotWidth / 2 : pad.left + (index / (count - 1)) * plotWidth
		)
	);
	const createdPoints = $derived(
		points.map((point, index) => ({
			x: xPoints[index],
			y: yFor(point.created, rightMax),
			value: Number(point.created) || 0,
		}))
	);
	const attemptedPoints = $derived(
		points.map((point, index) => ({
			x: xPoints[index],
			y: yFor(point.attempted, rightMax),
			value: Number(point.attempted) || 0,
		}))
	);
	const activePoint = $derived(activeIndex >= 0 ? points[activeIndex] : null);
	const tooltipLeft = $derived.by(() => {
		if (activeIndex < 0) return 8;
		return Math.min(Math.max(xPoints[activeIndex] - 92, 8), Math.max(width - 200, 8));
	});

	function axisBound(value) {
		return Math.max(Math.ceil(niceMax(value) / 4) * 4, 4);
	}

	function yFor(value, max) {
		const number = Number(value);
		const safe = Number.isFinite(number) ? Math.max(number, 0) : 0;
		return pad.top + plotHeight - (safe / max) * plotHeight;
	}

	function indexForClientX(clientX) {
		const element = container;
		if (!element || count <= 1) return 0;
		const rect = element.getBoundingClientRect();
		const relative = clientX - rect.left - pad.left;
		return Math.min(Math.max(Math.round((relative / plotWidth) * (count - 1)), 0), count - 1);
	}

	function scheduleActive(clientX) {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			activeIndex = indexForClientX(clientX);
		});
	}

	function onKeydown(event) {
		if (!count) return;
		if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
			event.preventDefault();
			const direction = event.key === 'ArrowRight' ? 1 : -1;
			const next =
				activeIndex < 0 ? (direction > 0 ? 0 : count - 1) : activeIndex + direction;
			activeIndex = Math.min(Math.max(next, 0), count - 1);
		} else if (event.key === 'Escape') {
			activeIndex = -1;
		}
	}

	const activeLabel = $derived(
		activeIndex >= 0 ? labels[activeIndex] || `#${activeIndex + 1}` : ''
	);
</script>

<div
	class="activity"
	bind:this={container}
	role="slider"
	tabindex="0"
	aria-label={ariaLabel}
	aria-valuemin="0"
	aria-valuemax={Math.max(count - 1, 0)}
	aria-valuenow={activeIndex < 0 ? 0 : activeIndex}
	aria-valuetext={activeIndex >= 0 ? activeLabel : 'No point selected'}
	data-window={dataWindow}
	data-points={count}
	onkeydown={onKeydown}
	onpointermove={(event) => scheduleActive(event.clientX)}
	onpointerdown={(event) => scheduleActive(event.clientX)}
	onpointerleave={() => (activeIndex = -1)}
>
	<svg {width} {height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
		<text class="axis-title left" x={pad.left} y="10">Visits</text>
		<text class="axis-title right" x={width - pad.right} y="10" text-anchor="end">Tests</text>

		{#each Array.from({ length: 5 }, (_, index) => index) as step (step)}
			{@const y = pad.top + plotHeight - (step / 4) * plotHeight}
			<line class="grid-line" x1={pad.left} x2={width - pad.right} {y}></line>
			<text
				class="axis-label"
				x={pad.left - 8}
				{y}
				text-anchor="end"
				dominant-baseline="middle"
			>
				{compactNumber((leftMax * step) / 4)}
			</text>
			<text
				class="axis-label"
				x={width - pad.right + 8}
				{y}
				text-anchor="start"
				dominant-baseline="middle"
			>
				{compactNumber((rightMax * step) / 4)}
			</text>
		{/each}

		{#each points as point, index (point.bucket || index)}
			{@const visits = Number(point.visits) || 0}
			{@const barHeight = (visits / leftMax) * plotHeight}
			{#if barHeight > 0}
				<rect
					class="visit-bar"
					x={xPoints[index] - barWidth / 2}
					y={baselineY - barHeight}
					width={barWidth}
					height={barHeight}
					rx="3"
				></rect>
			{/if}
		{/each}

		<path class="series-line created" d={linePath(createdPoints)}></path>
		<path class="series-line attempted" d={linePath(attemptedPoints)}></path>

		{#if activeIndex >= 0}
			{@const x = xPoints[activeIndex]}
			<line class="cursor-line" x1={x} x2={x} y1={pad.top} y2={baselineY}></line>
			<circle class="cursor-dot created" cx={x} cy={createdPoints[activeIndex]?.y} r="4"
			></circle>
			<circle class="cursor-dot attempted" cx={x} cy={attemptedPoints[activeIndex]?.y} r="4"
			></circle>
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

	{#if activePoint}
		<div class="activity-tooltip" style={`left: ${tooltipLeft}px; top: 24px`}>
			<p class="tooltip-day">{activeLabel}</p>
			<p class="tooltip-row">
				<span class="swatch bar"></span><span>Visits</span>
				<strong>{valueFormatter(activePoint.visits)}</strong>
			</p>
			<p class="tooltip-row">
				<span class="swatch created"></span><span>Created</span>
				<strong>{valueFormatter(activePoint.created)}</strong>
			</p>
			<p class="tooltip-row">
				<span class="swatch attempted"></span><span>Attempted</span>
				<strong>{valueFormatter(activePoint.attempted)}</strong>
			</p>
		</div>
	{/if}

	<ul class="legend">
		<li><span class="swatch bar" aria-hidden="true"></span>Visits</li>
		<li><span class="swatch created" aria-hidden="true"></span>Tests created</li>
		<li><span class="swatch attempted" aria-hidden="true"></span>Attempts</li>
	</ul>
</div>

<style>
	.activity {
		position: relative;
		width: 100%;
		min-width: 0;
		touch-action: pan-y;
	}

	.activity:focus-visible {
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

	.axis-label {
		fill: var(--text-muted);
		font-size: 10px;
	}

	.axis-title {
		fill: var(--text-muted);
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.visit-bar {
		fill: var(--color-slate-400);
		fill-opacity: 0.5;
	}

	.series-line {
		fill: none;
		stroke: var(--line-color);
		stroke-width: 2.25;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.series-line.created {
		--line-color: var(--brand-text);
	}

	.series-line.attempted {
		--line-color: var(--warn);
	}

	.cursor-line {
		stroke: var(--text-muted);
		stroke-width: 1;
		stroke-dasharray: 3 4;
		opacity: 0.7;
	}

	.cursor-dot {
		fill: var(--surface);
		stroke: var(--line-color);
		stroke-width: 2;
	}

	.cursor-dot.created {
		--line-color: var(--brand-text);
	}

	.cursor-dot.attempted {
		--line-color: var(--warn);
	}

	.x-label {
		fill: var(--text-muted);
		font-size: 10px;
	}

	.activity-tooltip {
		position: absolute;
		z-index: 2;
		width: 184px;
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
		background: var(--swatch-color);
	}

	.swatch.bar {
		--swatch-color: var(--color-slate-400);
		border-radius: 2px;
	}

	.swatch.created {
		--swatch-color: var(--brand-text);
	}

	.swatch.attempted {
		--swatch-color: var(--warn);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		margin: 6px 0 0;
		padding: 0;
		list-style: none;
	}

	.legend li {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--text-muted);
		font-size: 0.7rem;
	}

	@media (pointer: coarse) {
		.activity {
			min-height: 44px;
		}
	}
</style>
