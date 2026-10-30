<script>
	// Period-over-period chip used by KPI cards and chart headers.
	// `goodDirection: 'down'` flips the colour semantics for errors/latency.
	let { delta = null, label = '', goodDirection = 'up', compact = false } = $props();

	const tone = $derived.by(() => {
		if (delta == null || delta === 0 || goodDirection === 'neutral') return 'neutral';
		const rising = delta > 0;
		return rising === (goodDirection === 'up') ? 'good' : 'bad';
	});

	const display = $derived.by(() => {
		if (delta == null) return '—';
		const absolute = Math.abs(delta);
		const rounded = absolute >= 100 ? Math.round(absolute) : Number(absolute.toFixed(1));
		const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '•';
		return `${arrow} ${rounded}%`;
	});

	const ariaLabel = $derived.by(() => {
		if (delta == null) return 'No comparison available';
		const direction = delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'no change';
		return `${Math.abs(delta).toFixed(1)} percent ${direction}${label ? ` ${label}` : ''}`;
	});
</script>

<span class="delta {tone}" class:compact aria-label={ariaLabel}>
	<span class="delta-value">{display}</span>
	{#if label && !compact}<span class="delta-label">{label}</span>{/if}
</span>

<style>
	.delta {
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
		font-size: 0.75rem;
		font-weight: 600;
		white-space: nowrap;
	}

	.delta-value {
		padding: 2px 7px;
		border-radius: 999px;
		background: rgba(var(--text-rgb), 0.06);
	}

	.delta.good .delta-value {
		color: var(--ok);
		background: rgba(var(--ok-rgb), 0.1);
	}

	.delta.bad .delta-value {
		color: var(--danger);
		background: rgba(var(--danger-rgb), 0.1);
	}

	.delta.neutral .delta-value {
		color: var(--text-muted);
	}

	.delta-label {
		color: var(--text-muted);
		font-weight: 500;
	}

	.delta.compact {
		font-size: 0.7rem;
	}
</style>
