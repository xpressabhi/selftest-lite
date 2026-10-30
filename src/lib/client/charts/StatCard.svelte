<script>
	import DeltaBadge from './DeltaBadge.svelte';
	import Sparkline from './Sparkline.svelte';

	let {
		label = '',
		value = '0',
		suffix = '',
		delta = null,
		deltaLabel = '',
		goodDirection = 'up',
		sparkValues = [],
		tone = 'brand',
		hint = '',
		onclick = null,
	} = $props();

	const tag = $derived(onclick ? 'button' : 'div');
	const aria = $derived(
		`${label}: ${value}${suffix}${delta == null ? '' : `, ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'unchanged'} ${Math.abs(delta).toFixed(1)} percent`}`
	);
</script>

<svelte:element
	this={tag}
	class="stat-card"
	class:is-action={Boolean(onclick)}
	role={onclick ? 'button' : 'group'}
	type={onclick ? 'button' : undefined}
	onclick={onclick || undefined}
	aria-label={aria}
	title={hint || undefined}
>
	<span class="stat-label">{label}</span>
	<span class="stat-value"
		>{value}{#if suffix}<span class="stat-suffix">{suffix}</span>{/if}</span
	>
	{#if delta != null}
		<span class="stat-delta">
			<DeltaBadge {delta} label={deltaLabel} {goodDirection} compact />
			{#if deltaLabel}<span class="stat-delta-label">{deltaLabel}</span>{/if}
		</span>
	{/if}
	{#if sparkValues?.length > 1}
		<span class="stat-spark"><Sparkline values={sparkValues} {tone} /></span>
	{/if}
</svelte:element>

<style>
	.stat-card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		min-width: 0;
		min-height: 118px;
		padding: 14px 16px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		text-align: left;
	}

	.stat-card.is-action {
		cursor: pointer;
		transition:
			border-color var(--motion-fast) ease,
			transform var(--motion-fast) var(--ease-out);
	}

	.stat-card.is-action:hover {
		border-color: var(--brand-text);
		transform: translateY(-1px);
	}

	.stat-label {
		color: var(--text-muted);
		font-size: 0.72rem;
		font-weight: 500;
		line-height: 1.3;
	}

	.stat-value {
		color: var(--text);
		font-size: clamp(1.5rem, 1.2rem + 1.2vw, 1.95rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}

	.stat-suffix {
		margin-left: 5px;
		color: var(--text-muted);
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0;
	}

	.stat-spark {
		display: block;
		width: 100%;
		margin-top: auto;
	}

	.stat-delta {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 5px;
	}

	.stat-delta-label {
		color: var(--text-muted);
		font-size: 0.62rem;
	}
</style>
