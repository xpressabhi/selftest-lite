<script>
	import { areaPath, chartGeometry, linePath } from './chartMath.js';

	let { values = [], height = 38, tone = 'brand' } = $props();

	const geometry = $derived(
		chartGeometry(values, {
			width: 160,
			height,
			padding: { top: 3, right: 2, bottom: 3, left: 2 },
		})
	);
	const line = $derived(linePath(geometry.points));
	const area = $derived(areaPath(geometry.points, geometry.baselineY));
</script>

<svg
	class="sparkline {tone}"
	viewBox="0 0 160 {height}"
	preserveAspectRatio="none"
	role="presentation"
	aria-hidden="true"
	style={`height: ${height}px`}
>
	{#if geometry.points.length > 1}
		<path class="spark-area" d={area}></path>
	{/if}
	{#if line}
		<path class="spark-line" d={line}></path>
	{/if}
</svg>

<style>
	.sparkline {
		display: block;
		width: 100%;
		overflow: visible;
	}

	.spark-line {
		fill: none;
		stroke: var(--spark-color, var(--brand-text));
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.spark-area {
		fill: var(--spark-color, var(--brand-text));
		fill-opacity: 0.12;
		stroke: none;
	}

	.brand {
		--spark-color: var(--brand-text);
	}

	.error {
		--spark-color: var(--danger);
	}

	.warn {
		--spark-color: var(--warn);
	}
</style>
