<script>
	import { formatBytes, formatValue } from '#lib/client/formatting.js';
	import ChartCard from '#lib/client/charts/ChartCard.svelte';
	import StatCard from '#lib/client/charts/StatCard.svelte';

	let {
		health = null,
		healthWindow = 60,
		loading = false,
		error = '',
		onRetry = () => {},
	} = $props();

	const deployment = $derived(health?.deployment || null);
</script>

<section class="health">
	<div class="health-head">
		<div class="health-title">
			<h2>Live health</h2>
			{#if health}
				<span
					class="badge"
					class:ok={health.status === 'ok'}
					class:degraded={health.status !== 'ok'}
				>
					{health.status === 'ok' ? 'OK' : 'Degraded'}
				</span>
			{/if}
		</div>
		<span class="window-note">Window: {healthWindow}s · refreshes every 30s</span>
	</div>

	{#if error}
		<div class="health-error" role="status">
			<span>{error}</span>
			<button type="button" onclick={() => onRetry()}>Retry</button>
		</div>
	{/if}

	{#if health}
		<p class="deployment">
			Deployment:
			<span class="mono">
				{deployment?.provider || '-'} · {deployment?.environment || '-'}
				{#if deployment?.region}· {deployment.region}{/if}
				{#if deployment?.commit}· {deployment.commit}{/if}
				{#if deployment?.branch}· {deployment.branch}{/if}
				{#if deployment?.runtime}· {deployment.runtime}{/if}
			</span>
		</p>

		{#if health.status !== 'ok'}
			<div class="health-warning">
				Some metrics could not be loaded. Check the database connection and server logs.
			</div>
		{/if}

		<div class="kpi-grid">
			<StatCard
				label="Requests/sec"
				value={formatValue(health.requests?.requestsPerSecond)}
			/>
			<StatCard
				label="Avg latency"
				value={formatValue(health.requests?.avgLatencyMs)}
				suffix="ms"
			/>
			<StatCard
				label="p90 latency"
				value={formatValue(health.requests?.p90LatencyMs)}
				suffix="ms"
			/>
			<StatCard
				label="p99 latency"
				value={formatValue(health.requests?.p99LatencyMs)}
				suffix="ms"
			/>
			<StatCard
				label="Error rate"
				value={formatValue(health.requests?.errorRate)}
				suffix="%"
			/>
			<StatCard
				label="CPU usage"
				value={formatValue(health.system?.cpu?.usagePercent)}
				suffix="%"
			/>
			<StatCard label="Memory" value={formatBytes(health.system?.memory?.rssBytes)} />
			<StatCard
				label="DB latency"
				value={formatValue(health.database?.latencyMs)}
				suffix="ms"
			/>
		</div>

		<div class="split-even">
			<ChartCard title="DB connections">
				<div class="connection-grid">
					<span>Total <strong>{health.database?.connections?.total ?? '-'}</strong></span>
					<span
						>Active <strong>{health.database?.connections?.active ?? '-'}</strong></span
					>
					<span>Idle <strong>{health.database?.connections?.idle ?? '-'}</strong></span>
				</div>
				<p>
					Instance pool: {health.database?.connections?.instancePool?.total ?? '-'} total ·
					{health.database?.connections?.instancePool?.idle ?? '-'} idle ·
					{health.database?.connections?.instancePool?.waiting ?? '-'} waiting
				</p>
			</ChartCard>
			<ChartCard title="Health notes">
				<p>
					CPU and memory are for the serverless instance that served this request.
					Requests and database metrics span all instances.
				</p>
				{#if health.system?.memory?.rssPercentOfLimit != null}
					<p>
						Memory at {health.system.memory.rssPercentOfLimit}% of {formatBytes(
							health.system.memory.limitBytes
						)}.
					</p>
				{/if}
			</ChartCard>
		</div>
	{:else if loading}
		<div class="health-loading" role="status">
			<span></span><span></span><span></span>
		</div>
	{:else}
		<p class="health-empty">Health metrics are unavailable.</p>
	{/if}
</section>

<style>
	.health {
		display: grid;
		gap: 12px;
	}

	.health-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.health-title {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.health-title h2 {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.badge {
		padding: 2px 8px;
		border-radius: 999px;
		font-size: 0.68rem;
		font-weight: 700;
	}

	.badge.ok {
		color: var(--ok);
		background: rgba(var(--ok-rgb), 0.1);
	}

	.badge.degraded {
		color: var(--warn);
		background: rgba(var(--warn-rgb), 0.1);
	}

	.window-note,
	.deployment {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.7rem;
	}

	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	}

	.health-warning,
	.health-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 10px;
		border-radius: 8px;
		background: rgba(var(--warn-rgb), 0.08);
		color: var(--warn);
		font-size: 0.72rem;
	}

	.health-error {
		background: rgba(var(--danger-rgb), 0.08);
		color: var(--danger);
	}

	.health-error button {
		border: 1px solid currentColor;
		border-radius: 6px;
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: 0.7rem;
		font-weight: 600;
		cursor: pointer;
	}

	.kpi-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
	}

	.split-even {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.connection-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 18px;
		color: var(--text-muted);
		font-size: 0.72rem;
	}

	.connection-grid strong {
		color: var(--text);
	}

	.split-even p {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.72rem;
		line-height: 1.45;
	}

	.health-loading {
		display: flex;
		justify-content: center;
		gap: 5px;
		padding: 36px;
	}

	.health-loading span {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: var(--brand-text);
		animation: thinking-dot 1.4s ease-in-out infinite;
	}

	.health-loading span:nth-child(2) {
		animation-delay: 0.16s;
	}

	.health-loading span:nth-child(3) {
		animation-delay: 0.32s;
	}

	.health-empty {
		color: var(--text-muted);
		font-size: 0.75rem;
	}

	@media (max-width: 1023px) {
		.split-even {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 639px) {
		.kpi-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
