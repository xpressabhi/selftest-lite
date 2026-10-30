<script>
	import { agentFamily, formatNumber } from '#lib/client/formatting.js';
	import ChartCard from '#lib/client/charts/ChartCard.svelte';
	import DonutChart from '#lib/client/charts/DonutChart.svelte';
	import RankBars from '#lib/client/charts/RankBars.svelte';
	import StatCard from '#lib/client/charts/StatCard.svelte';
	import TrendChart from '#lib/client/charts/TrendChart.svelte';
	import { windowLabel } from './adminState.js';
	import {
		agentSegments,
		errorRateValues,
		kpiDelta,
		rankRows,
		seriesLabels,
		seriesValues,
		statusSegments,
	} from './adminData.js';

	let {
		stats = null,
		days = 1,
		compare = true,
		loading = {},
		errors = {},
		onRetry = () => {},
	} = $props();

	const series = $derived(stats?.series || null);
	const labels = $derived(seriesLabels(series));
	const requests = $derived(seriesValues(series, 'requests'));
	const errorCounts = $derived(seriesValues(series, 'errors'));
	const latency = $derived(seriesValues(series, 'avg_duration_ms'));
	const errorRates = $derived(errorRateValues(series));
	const previousRequests = $derived(series?.previousRequests || []);
	const totals = $derived(stats?.totals || {});
	const previous = $derived(stats?.comparison?.previous || null);
	const errorRate = $derived(
		(Number(totals.total) || 0) > 0
			? Number((((Number(totals.errors) || 0) / Number(totals.total)) * 100).toFixed(1))
			: 0
	);
	const previousErrorRate = $derived(
		(Number(previous?.total) || 0) > 0
			? Number((((Number(previous.errors) || 0) / Number(previous.total)) * 100).toFixed(1))
			: null
	);
	const status = $derived(statusSegments(stats?.byStatus));
	const routes = $derived(
		rankRows(stats?.byRoute, { key: 'requests', labelKey: 'route', limit: 10 })
	);
	const countries = $derived.by(() => {
		const rows = stats?.byCountry || [];
		const total = rows.reduce((sum, row) => sum + (Number(row.requests) || 0), 0);
		return rows.map((row) => ({
			label: row.country || 'unknown',
			value: Number(row.requests) || 0,
			note: total > 0 ? `${((row.requests / total) * 100).toFixed(1)}%` : '',
		}));
	});
	const agents = $derived(agentSegments(stats?.byAgentFamily));
	const topAgents = $derived(stats?.topAgents || []);
	const previousLabel = $derived(
		days === 0 ? '' : days === 1 ? 'vs previous 24h' : `vs previous ${days}d`
	);
	const granularityLabel = $derived(
		series?.granularity === 'hour'
			? 'Hourly buckets'
			: series?.granularity === 'week'
				? 'Weekly buckets'
				: 'Daily buckets'
	);
	const statsLoading = $derived(Boolean(loading.stats));
	const statsError = $derived(errors.stats || '');
</script>

<section class="tab-body">
	<div class="kpi-grid">
		<StatCard
			label="Requests"
			value={formatNumber(totals.total)}
			delta={compare ? kpiDelta(totals.total, previous?.total) : null}
			deltaLabel={previousLabel}
			sparkValues={requests}
		/>
		<StatCard
			label="Errors"
			value={formatNumber(totals.errors)}
			delta={compare ? kpiDelta(totals.errors, previous?.errors) : null}
			deltaLabel={previousLabel}
			goodDirection="down"
			sparkValues={errorCounts}
			tone="error"
		/>
		<StatCard
			label="Error rate"
			value={errorRate}
			suffix="%"
			delta={compare ? kpiDelta(errorRate, previousErrorRate) : null}
			deltaLabel={previousLabel}
			goodDirection="down"
		/>
		<StatCard
			label="Avg duration"
			value={formatNumber(totals.avg_duration_ms)}
			suffix="ms"
			delta={compare ? kpiDelta(totals.avg_duration_ms, previous?.avg_duration_ms) : null}
			deltaLabel={previousLabel}
			goodDirection="down"
			sparkValues={latency}
			tone="warn"
		/>
	</div>

	<ChartCard
		title="Requests"
		subtitle={`${windowLabel(days)} · ${granularityLabel}`}
		value={formatNumber(totals.total)}
		delta={compare ? kpiDelta(totals.total, previous?.total) : null}
		deltaLabel={previousLabel}
		caption={`${series?.points?.length || 0} buckets${series?.truncated ? ' · last 260 weeks' : ''} · previous window aligned by position`}
		loading={statsLoading}
		error={statsError}
		empty={!series?.points?.length}
		onRetry={() => onRetry('stats')}
	>
		<TrendChart
			{labels}
			series={[
				{
					key: 'requests',
					label: 'Requests',
					values: requests,
					style: 'area',
					tone: 'brand',
				},
				...(compare && previousRequests.length
					? [
							{
								key: 'previous',
								label: 'Previous window',
								values: previousRequests,
								style: 'ghost',
								tone: 'neutral',
							},
						]
					: []),
			]}
			height={260}
			ariaLabel={`Requests over ${windowLabel(days)}: ${formatNumber(totals.total)} total`}
			dataWindow={String(days)}
		/>
	</ChartCard>

	<div class="split-even">
		<ChartCard
			title="Error rate"
			subtitle={windowLabel(days)}
			value={errorRate}
			valueSuffix="%"
			delta={compare ? kpiDelta(errorRate, previousErrorRate) : null}
			deltaLabel={previousLabel}
			goodDirection="down"
			caption="Expected 401/429 responses are excluded"
			loading={statsLoading}
			error={statsError}
			empty={!series?.points?.length}
			onRetry={() => onRetry('stats')}
		>
			<TrendChart
				{labels}
				series={[
					{
						key: 'error-rate',
						label: 'Error rate',
						values: errorRates,
						style: 'area',
						tone: 'danger',
					},
				]}
				integerAxis={false}
				height={200}
				valueFormatter={(value) => `${Number(value).toFixed(1)}%`}
				ariaLabel={`Error rate over ${windowLabel(days)}: ${errorRate}%`}
				dataWindow={String(days)}
			/>
		</ChartCard>

		<ChartCard
			title="Status mix"
			subtitle={windowLabel(days)}
			value={formatNumber(totals.total)}
			caption="Requests by response class"
			loading={statsLoading}
			error={statsError}
			empty={!status.length}
			onRetry={() => onRetry('stats')}
		>
			<DonutChart
				segments={status}
				centerLabel="requests"
				centerValue={formatNumber(totals.total)}
				ariaLabel={`Status mix: ${status.map((item) => `${item.label} ${item.value}`).join(', ')}`}
				dataWindow={String(days)}
			/>
		</ChartCard>
	</div>

	<div class="split-even">
		<ChartCard
			title="Top routes"
			subtitle={windowLabel(days)}
			caption="Requests with error counts"
			loading={statsLoading}
			error={statsError}
			empty={!routes.length}
			onRetry={() => onRetry('stats')}
		>
			<RankBars items={routes} ariaLabel="Top routes by requests" dataWindow={String(days)} />
		</ChartCard>

		<ChartCard
			title="Countries"
			subtitle={windowLabel(days)}
			caption="Top 20 countries, share of requests"
			loading={statsLoading}
			error={statsError}
			empty={!countries.length}
			onRetry={() => onRetry('stats')}
		>
			<RankBars items={countries} ariaLabel="Requests by country" dataWindow={String(days)} />
		</ChartCard>
	</div>

	<div class="split-even">
		<ChartCard
			title="Agent families"
			subtitle={windowLabel(days)}
			caption="Bot traffic is counted separately"
			loading={statsLoading}
			error={statsError}
			empty={!agents.length}
			onRetry={() => onRetry('stats')}
		>
			<DonutChart
				segments={agents}
				centerLabel="requests"
				centerValue={formatNumber(totals.total)}
				ariaLabel={`Agent families: ${agents.map((item) => `${item.label} ${item.value}`).join(', ')}`}
				dataWindow={String(days)}
			/>
		</ChartCard>

		<ChartCard
			title="Top agents"
			subtitle={windowLabel(days)}
			caption="Top 15 user agents"
			loading={statsLoading}
			error={statsError}
			empty={!topAgents.length}
			onRetry={() => onRetry('stats')}
		>
			<ul class="agent-list">
				{#each topAgents as agent (agent.user_agent)}
					<li>
						<span class="agent-name" title={agent.user_agent}>{agent.user_agent}</span>
						<span class="agent-meta">
							<span class="agent-badge">{agentFamily(agent.user_agent)}</span>
							<strong>{formatNumber(agent.requests)}</strong>
						</span>
					</li>
				{/each}
			</ul>
		</ChartCard>
	</div>

	{#if stats?.byRoute?.length || stats?.byStatus?.length}
		<details class="details">
			<summary>Route and status details</summary>
			<div class="details-grid">
				<div class="table-wrap">
					<table class="admin-table">
						<thead
							><tr><th>Route</th><th>Requests</th><th>Errors</th><th>Avg</th></tr
							></thead
						>
						<tbody>
							{#each stats.byRoute as item (item.route)}
								<tr
									><td class="mono">{item.route}</td><td
										>{formatNumber(item.requests)}</td
									><td>{formatNumber(item.errors)}</td><td
										>{item.avg_duration_ms} ms</td
									></tr
								>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="table-wrap">
					<table class="admin-table">
						<thead><tr><th>Status</th><th>Requests</th></tr></thead>
						<tbody>
							{#each stats.byStatus as item (item.status_code)}
								<tr
									><td>{item.status_code ?? '-'}</td><td
										>{formatNumber(item.requests)}</td
									></tr
								>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</details>
	{/if}
</section>

<style>
	.tab-body {
		display: grid;
		gap: 12px;
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

	.agent-list {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.agent-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 6px 0;
		border-bottom: 1px solid var(--line);
	}

	.agent-list li:last-child {
		border-bottom: 0;
	}

	.agent-name {
		min-width: 0;
		overflow: hidden;
		color: var(--text-muted);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.68rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.agent-meta {
		display: flex;
		flex: none;
		align-items: center;
		gap: 7px;
		color: var(--text);
		font-size: 0.72rem;
	}

	.agent-badge {
		padding: 1px 6px;
		border-radius: 999px;
		background: var(--surface-muted);
		color: var(--text-muted);
		font-size: 0.62rem;
		font-weight: 600;
	}

	.details {
		padding: 12px 16px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.details summary {
		color: var(--text);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}

	.details-grid {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
		gap: 16px;
		margin-top: 10px;
	}

	.table-wrap {
		overflow-x: auto;
	}

	.admin-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
	}

	.admin-table th {
		padding: 7px 9px;
		border-bottom: 1px solid var(--line);
		color: var(--text-muted);
		font-size: 0.68rem;
		text-align: left;
		white-space: nowrap;
	}

	.admin-table td {
		padding: 6px 9px;
		border-bottom: 1px solid var(--line);
		white-space: nowrap;
	}

	.admin-table tr:last-child td {
		border-bottom: 0;
	}

	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.72rem;
	}

	@media (max-width: 1023px) {
		.split-even,
		.details-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 639px) {
		.kpi-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
