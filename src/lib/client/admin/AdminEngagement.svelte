<script>
	import { formatNumber } from '#lib/client/formatting.js';
	import ChartCard from '#lib/client/charts/ChartCard.svelte';
	import RankBars from '#lib/client/charts/RankBars.svelte';
	import StatCard from '#lib/client/charts/StatCard.svelte';
	import TrendChart from '#lib/client/charts/TrendChart.svelte';
	import { windowLabel } from './adminState.js';
	import { funnelItems, kpiDelta, seriesLabels } from './adminData.js';

	let {
		featureUsage = null,
		days = 1,
		compare = true,
		loading = {},
		errors = {},
		onRetry = () => {},
	} = $props();

	const totals = $derived(featureUsage?.totals || {});
	const previous = $derived(featureUsage?.comparison?.previous || null);
	const trend = $derived(featureUsage?.trend || []);
	const labels = $derived(
		seriesLabels({ points: trend, granularity: featureUsage?.trendGranularity })
	);
	const eventValues = $derived(trend.map((point) => Number(point.events) || 0));
	const sessionValues = $derived(trend.map((point) => Number(point.sessions) || 0));
	const byEvent = $derived(featureUsage?.byEvent || []);
	const eventRows = $derived(
		byEvent.slice(0, 12).map((row) => ({
			label: row.event,
			value: Number(row.count) || 0,
			note: row.pct != null ? `${row.pct}%` : '',
		}))
	);
	const pageRows = $derived(
		(featureUsage?.byPage || []).slice(0, 12).map((row) => ({
			label: row.page,
			value: Number(row.events) || 0,
		}))
	);
	const generateRows = $derived(
		(featureUsage?.generateBreakdown || []).slice(0, 10).map((row) => ({
			label: `${row.mode} · ${row.difficulty} · ${row.language}`,
			value: Number(row.count) || 0,
		}))
	);
	const funnel = $derived(funnelItems(byEvent));
	const previousLabel = $derived(
		days === 0 ? '' : days === 1 ? 'vs previous 24h' : `vs previous ${days}d`
	);
	const granularityLabel = $derived(
		featureUsage?.trendGranularity === 'hour'
			? 'Hourly buckets'
			: featureUsage?.trendGranularity === 'week'
				? 'Weekly buckets'
				: 'Daily buckets'
	);
	const chartLoading = $derived(Boolean(loading.feature));
	const chartError = $derived(errors.feature || '');
</script>

<section class="tab-body">
	<div class="kpi-grid">
		<StatCard
			label="Feature events"
			value={formatNumber(totals.total)}
			delta={compare ? kpiDelta(totals.total, previous?.total) : null}
			deltaLabel={previousLabel}
			sparkValues={eventValues}
		/>
		<StatCard
			label="Sessions"
			value={formatNumber(totals.sessions)}
			delta={compare ? kpiDelta(totals.sessions, previous?.sessions) : null}
			deltaLabel={previousLabel}
			sparkValues={sessionValues}
		/>
		<StatCard
			label="Events / session"
			value={totals.events_per_session || 0}
			delta={compare
				? kpiDelta(totals.events_per_session, previous?.events_per_session)
				: null}
			deltaLabel={previousLabel}
		/>
		<StatCard
			label="Distinct events"
			value={formatNumber(totals.distinct_events)}
			delta={compare ? kpiDelta(totals.distinct_events, previous?.distinct_events) : null}
			deltaLabel={previousLabel}
		/>
	</div>

	<ChartCard
		title="Engagement trend"
		subtitle={`${windowLabel(days)} · ${granularityLabel}`}
		value={formatNumber(totals.total)}
		caption={`${trend.length} buckets${featureUsage?.trendTruncated ? ' · last 260 weeks' : ''}`}
		loading={chartLoading}
		error={chartError}
		empty={!trend.length}
		onRetry={() => onRetry('feature')}
	>
		<TrendChart
			{labels}
			series={[
				{
					key: 'events',
					label: 'Events',
					values: eventValues,
					style: 'area',
					tone: 'brand',
				},
				{
					key: 'sessions',
					label: 'Sessions',
					values: sessionValues,
					style: 'line',
					tone: 'warn',
				},
			]}
			height={250}
			ariaLabel={`Feature events and sessions over ${windowLabel(days)}: ${formatNumber(totals.total)} events`}
			dataWindow={String(days)}
		/>
	</ChartCard>

	<div class="split-even">
		<ChartCard
			title="Generation funnel"
			subtitle={windowLabel(days)}
			caption="Event counts, not unique users"
			loading={chartLoading}
			error={chartError}
			empty={!funnel.length}
			onRetry={() => onRetry('feature')}
		>
			<RankBars
				items={funnel}
				ariaLabel="Generation funnel step counts"
				dataWindow={String(days)}
				limit={6}
			/>
		</ChartCard>

		<ChartCard
			title="Top events"
			subtitle={windowLabel(days)}
			caption="Share of all feature events"
			loading={chartLoading}
			error={chartError}
			empty={!eventRows.length}
			onRetry={() => onRetry('feature')}
		>
			<RankBars items={eventRows} ariaLabel="Top feature events" dataWindow={String(days)} />
		</ChartCard>
	</div>

	<div class="split-even">
		<ChartCard
			title="Pages"
			subtitle={windowLabel(days)}
			caption="Feature events by page"
			loading={chartLoading}
			error={chartError}
			empty={!pageRows.length}
			onRetry={() => onRetry('feature')}
		>
			<RankBars
				items={pageRows}
				ariaLabel="Feature events by page"
				dataWindow={String(days)}
			/>
		</ChartCard>

		<ChartCard
			title="Generate combinations"
			subtitle={windowLabel(days)}
			caption="Mode · difficulty · language, top 10"
			loading={chartLoading}
			error={chartError}
			empty={!generateRows.length}
			onRetry={() => onRetry('feature')}
		>
			<RankBars
				items={generateRows}
				ariaLabel="Generate combinations"
				dataWindow={String(days)}
			/>
		</ChartCard>
	</div>

	{#if byEvent.length || featureUsage?.byPage?.length}
		<details class="details">
			<summary>Raw engagement tables</summary>
			<div class="details-grid">
				<div class="table-wrap">
					<table class="admin-table">
						<thead><tr><th>Event</th><th>Count</th><th>Share</th></tr></thead>
						<tbody>
							{#each byEvent as row (row.event)}
								<tr
									><td class="mono">{row.event}</td><td
										>{formatNumber(row.count)}</td
									><td>{row.pct}%</td></tr
								>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="table-wrap">
					<table class="admin-table">
						<thead><tr><th>Page</th><th>Events</th></tr></thead>
						<tbody>
							{#each featureUsage?.byPage || [] as row (row.page)}
								<tr
									><td class="mono">{row.page}</td><td
										>{formatNumber(row.events)}</td
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
		grid-template-columns: repeat(2, minmax(0, 1fr));
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
