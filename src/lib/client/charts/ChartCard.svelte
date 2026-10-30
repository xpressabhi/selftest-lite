<script>
	import DeltaBadge from './DeltaBadge.svelte';

	let {
		title = '',
		subtitle = '',
		value = null,
		valueSuffix = '',
		delta = null,
		deltaLabel = '',
		goodDirection = 'up',
		caption = '',
		loading = false,
		error = '',
		empty = false,
		emptyText = 'No data in this window',
		onRetry = null,
		children,
	} = $props();
</script>

<section class="chart-card" aria-busy={loading}>
	<header class="chart-head">
		<div class="chart-heading">
			<h3 class="chart-title">{title}</h3>
			{#if subtitle}<p class="chart-subtitle">{subtitle}</p>{/if}
		</div>
		{#if delta != null}
			<DeltaBadge {delta} label={deltaLabel} {goodDirection} />
		{/if}
	</header>

	{#if value != null}
		<p class="chart-hero">
			{value}{#if valueSuffix}<span class="chart-suffix">{valueSuffix}</span>{/if}
		</p>
	{/if}

	{#if error}
		<div class="chart-error" role="status">
			<span>{error}</span>
			{#if onRetry}
				<button type="button" class="chart-retry" onclick={onRetry}>Retry</button>
			{/if}
		</div>
	{/if}

	<div class="chart-body" class:is-updating={loading}>
		{#if loading && empty}
			<div class="chart-skeleton" aria-label="Loading chart">
				<span></span><span></span><span></span><span></span>
			</div>
		{:else if empty}
			<div class="chart-empty">{emptyText}</div>
		{:else}
			{@render children?.()}
		{/if}
	</div>

	{#if caption}<p class="chart-caption">{caption}</p>{/if}
</section>

<style>
	.chart-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
		padding: 16px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.chart-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.chart-heading {
		min-width: 0;
	}

	.chart-title {
		margin: 0;
		color: var(--text);
		font-size: 0.82rem;
		font-weight: 600;
		line-height: 1.3;
	}

	.chart-subtitle {
		margin: 2px 0 0;
		color: var(--text-muted);
		font-size: 0.72rem;
		line-height: 1.35;
	}

	.chart-hero {
		margin: 0;
		color: var(--text);
		font-size: clamp(1.55rem, 1.2rem + 1.4vw, 2.1rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}

	.chart-suffix {
		margin-left: 4px;
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 500;
		letter-spacing: 0;
	}

	.chart-body {
		min-width: 0;
		transition: opacity var(--motion-fast) ease;
	}

	.chart-body.is-updating {
		opacity: 0.55;
	}

	.chart-caption {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.68rem;
		line-height: 1.4;
	}

	.chart-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 8px;
		border-radius: 8px;
		background: rgba(var(--danger-rgb), 0.08);
		color: var(--danger);
		font-size: 0.72rem;
	}

	.chart-retry {
		flex: none;
		padding: 3px 8px;
		border: 1px solid currentColor;
		border-radius: 6px;
		background: transparent;
		color: inherit;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	.chart-empty {
		display: grid;
		min-height: 120px;
		place-items: center;
		padding: 12px;
		border: 1px dashed var(--line);
		border-radius: 8px;
		color: var(--text-muted);
		font-size: 0.75rem;
		text-align: center;
	}

	.chart-skeleton {
		display: flex;
		height: 150px;
		align-items: flex-end;
		gap: 8px;
		padding: 8px 0;
	}

	.chart-skeleton span {
		flex: 1;
		height: 100%;
		border-radius: 6px;
		background: linear-gradient(
			90deg,
			var(--surface-muted) 25%,
			var(--line) 50%,
			var(--surface-muted) 75%
		);
		background-size: 200% 100%;
		animation: shimmer 2.5s ease-in-out infinite;
	}

	.chart-skeleton span:nth-child(1) {
		height: 42%;
	}
	.chart-skeleton span:nth-child(2) {
		height: 76%;
	}
	.chart-skeleton span:nth-child(3) {
		height: 58%;
	}
	.chart-skeleton span:nth-child(4) {
		height: 92%;
	}

	@media (prefers-reduced-motion: reduce) {
		.chart-skeleton span {
			animation: none;
		}
	}

	@media (pointer: coarse) {
		.chart-retry {
			min-height: 44px;
			padding-inline: 12px;
		}
	}
</style>
