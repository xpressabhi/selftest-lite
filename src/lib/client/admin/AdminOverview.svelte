<script>
	import { formatNumber } from '#lib/client/formatting.js';
	import ChartCard from '#lib/client/charts/ChartCard.svelte';
	import DonutChart from '#lib/client/charts/DonutChart.svelte';
	import RankBars from '#lib/client/charts/RankBars.svelte';
	import StatCard from '#lib/client/charts/StatCard.svelte';
	import TrendChart from '#lib/client/charts/TrendChart.svelte';
	import AttentionStrip from './AttentionStrip.svelte';
	import { windowLabel } from './adminState.js';
	import {
		attentionItems,
		errorRateValues,
		kpiDelta,
		rankRows,
		segmentsFromRows,
		seriesLabels,
		seriesValues,
		statusSegments,
	} from './adminData.js';

	let {
		stats = null,
		featureUsage = null,
		deviceNetwork = null,
		days = 1,
		compare = true,
		loading = {},
		errors = {},
		onRetry = () => {},
		onNavigate = () => {},
		onOpenLogs = () => {},
	} = $props();

	const overview = $derived(stats?.overview || null);
	const series = $derived(stats?.series || null);
	const labels = $derived(seriesLabels(series));
	const requests = $derived(seriesValues(series, 'requests'));
	const errorCounts = $derived(seriesValues(series, 'errors'));
	const latency = $derived(seriesValues(series, 'avg_duration_ms'));
	const errorRates = $derived(errorRateValues(series));
	const previousRequests = $derived(series?.previousRequests || []);
	const totals = $derived(stats?.totals || {});
	const previous = $derived(stats?.comparison?.previous || null);
	const rateLimitedTotal = $derived(
		(stats?.rateLimited || []).reduce((sum, row) => sum + (Number(row.events) || 0), 0)
	);
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
		rankRows(stats?.byRoute, { key: 'requests', labelKey: 'route', limit: 8 })
	);
	const needsAttention = $derived(attentionItems({ stats, featureUsage, deviceNetwork }));
	const modeSegments = $derived(
		segmentsFromRows(overview?.testBreakdown?.byMode || [], 'test_mode', 'count')
	);
	const difficultySegments = $derived(
		segmentsFromRows(overview?.testBreakdown?.byDifficulty || [], 'difficulty', 'count')
	);
	const languageSegments = $derived(
		segmentsFromRows(overview?.testBreakdown?.byLanguage || [], 'language', 'count')
	);
	const attemptStats = $derived(overview?.attemptStats || null);
	const periodLabel = $derived(days === 0 ? 'all time' : 'in period');
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
	const statsError = $derived(errors.stats || '');
	const statsLoading = $derived(Boolean(loading.stats));
</script>

<section class="tab-body">
	<div class="kpi-grid">
		<StatCard
			label="Requests"
			value={formatNumber(totals.total)}
			delta={compare ? kpiDelta(totals.total, previous?.total) : null}
			deltaLabel={previousLabel}
			sparkValues={requests}
			onclick={() => onNavigate('traffic')}
			hint="Open traffic"
		/>
		<StatCard
			label="Errors"
			value={formatNumber(totals.errors)}
			delta={compare ? kpiDelta(totals.errors, previous?.errors) : null}
			deltaLabel={previousLabel}
			goodDirection="down"
			sparkValues={errorCounts}
			tone="error"
			onclick={() => onNavigate('traffic')}
			hint="Open traffic"
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
			onclick={() => onNavigate('traffic')}
			hint="Open traffic"
		/>
		<StatCard
			label="Rate-limited"
			value={formatNumber(rateLimitedTotal)}
			delta={compare ? kpiDelta(rateLimitedTotal, previous?.rate_limited) : null}
			deltaLabel={previousLabel}
			goodDirection="down"
			onclick={() => onOpenLogs('429')}
			hint="Open logs filtered to 429"
		/>
	</div>

	{#if stats}
		<AttentionStrip items={needsAttention} {onNavigate} />
	{/if}

	<div class="split-main">
		<ChartCard
			title="Requests"
			subtitle={windowLabel(days)}
			value={formatNumber(totals.total)}
			delta={compare ? kpiDelta(totals.total, previous?.total) : null}
			deltaLabel={previous ? 'vs previous window' : ''}
			caption={`${granularityLabel} · ${series?.points?.length || 0} points${series?.truncated ? ' (last 260 weeks)' : ''} · previous window aligned by position`}
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
				ariaLabel={`Requests over ${windowLabel(days)}: ${formatNumber(totals.total)} total`}
				dataWindow={String(days)}
			/>
		</ChartCard>

		<ChartCard
			title="Status mix"
			subtitle={windowLabel(days)}
			value={formatNumber(totals.total)}
			caption="Share of requests by response class"
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
			title="Error rate"
			subtitle={windowLabel(days)}
			value={errorRate}
			valueSuffix="%"
			delta={compare ? kpiDelta(errorRate, previousErrorRate) : null}
			deltaLabel={previous ? 'vs previous window' : ''}
			goodDirection="down"
			caption="Errors exclude expected 401/429 responses"
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
				height={190}
				valueFormatter={(value) => `${Number(value).toFixed(1)}%`}
				ariaLabel={`Error rate over ${windowLabel(days)}: ${errorRate}%`}
				dataWindow={String(days)}
			/>
		</ChartCard>

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
	</div>

	{#if overview}
		<section class="database">
			<header>
				<h2>Database overview</h2>
				<span>{days === 0 ? 'All time' : `${windowLabel(days)} · ${periodLabel}`}</span>
			</header>
			<div class="database-grid">
				<div class="database-card">
					<span class="database-label">ai_test</span>
					<strong>{formatNumber(overview.tables.ai_test.total)}</strong>
					<span>+{formatNumber(overview.tables.ai_test.recent)} {periodLabel}</span>
				</div>
				<div class="database-card">
					<span class="database-label">attempts</span>
					<strong>{formatNumber(overview.tables.ai_test_attempts.total)}</strong>
					<span
						>+{formatNumber(overview.tables.ai_test_attempts.recent)} · avg {overview
							.tables.ai_test_attempts.avg_score}%</span
					>
				</div>
				<div class="database-card">
					<span class="database-label">users</span>
					<strong>{formatNumber(overview.tables.app_user.total)}</strong>
					<span>+{formatNumber(overview.tables.app_user.recent)} active</span>
				</div>
				<div class="database-card">
					<span class="database-label">sessions</span>
					<strong>{formatNumber(overview.tables.app_user_session.active)}</strong>
					<span>active now</span>
				</div>
				<div class="database-card">
					<span class="database-label">state users</span>
					<strong>{formatNumber(overview.tables.app_user_state.distinct_users)}</strong>
					<span>+{formatNumber(overview.tables.app_user_state.recent)} {periodLabel}</span
					>
				</div>
				<div class="database-card">
					<span class="database-label">rate limits</span>
					<strong>{formatNumber(overview.tables.api_rate_limit_events.total)}</strong>
					<span
						>+{formatNumber(overview.tables.api_rate_limit_events.recent)}
						{periodLabel}</span
					>
				</div>
				<div class="database-card">
					<span class="database-label">api events</span>
					<strong>{formatNumber(overview.tables.api_request_events.total)}</strong>
					<span
						>+{formatNumber(overview.tables.api_request_events.recent)} · {formatNumber(
							overview.tables.api_request_events.errors
						)} errors</span
					>
				</div>
				<div class="database-card">
					<span class="database-label">feature events</span>
					<strong>{formatNumber(overview.tables.feature_events.total)}</strong>
					<span
						>+{formatNumber(overview.tables.feature_events.recent)} · {formatNumber(
							overview.tables.feature_events.sessions
						)} sessions</span
					>
				</div>
			</div>
		</section>
	{/if}

	{#if modeSegments.length || difficultySegments.length || languageSegments.length}
		<div class="breakdown-grid">
			{#if languageSegments.length}
				<ChartCard title="Tests by language" subtitle={windowLabel(days)}>
					<DonutChart
						segments={languageSegments}
						centerLabel="tests"
						centerValue={formatNumber(
							languageSegments.reduce((sum, item) => sum + item.value, 0)
						)}
						ariaLabel="Tests by language"
						size={150}
					/>
				</ChartCard>
			{/if}
			{#if modeSegments.length}
				<ChartCard title="Tests by mode" subtitle={windowLabel(days)}>
					<RankBars
						items={modeSegments.map((item) => ({ ...item, value: item.value }))}
					/>
				</ChartCard>
			{/if}
			{#if difficultySegments.length}
				<ChartCard title="Tests by difficulty" subtitle={windowLabel(days)}>
					<RankBars items={difficultySegments} />
				</ChartCard>
			{/if}
		</div>
	{/if}

	{#if attemptStats && Number(overview?.tables?.ai_test_attempts?.total) > 0}
		<ChartCard
			title="Attempt quality"
			subtitle={windowLabel(days)}
			value={attemptStats.avg_score ?? 0}
			valueSuffix="% avg"
			caption={`Median ${attemptStats.median_score ?? 0}% · ${formatNumber(
				attemptStats.perfect_scores
			)} perfect scores`}
		>
			<div class="score-bar" aria-hidden="true">
				<span
					style={`width: ${Math.min(Math.max(Number(attemptStats.avg_score) || 0, 0), 100)}%`}
				></span>
			</div>
			<div class="score-meta">
				<span>Median <strong>{attemptStats.median_score ?? 0}%</strong></span>
				<span>Perfect <strong>{formatNumber(attemptStats.perfect_scores)}</strong></span>
				{#if overview?.tables?.ai_test_attempts?.avg_time_seconds}
					<span
						>Avg time
						<strong
							>{Math.round(overview.tables.ai_test_attempts.avg_time_seconds / 60)} min</strong
						></span
					>
				{/if}
			</div>
		</ChartCard>
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

	.split-main {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
		gap: 12px;
	}

	.split-even {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.breakdown-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}

	.database {
		padding: 14px 16px;
		border: 1px solid var(--line);
		border-radius: var(--radius-surface);
		background: var(--surface);
	}

	.database header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 10px;
	}

	.database h2 {
		margin: 0;
		color: var(--text);
		font-size: 0.82rem;
		font-weight: 600;
	}

	.database header span {
		color: var(--text-muted);
		font-size: 0.7rem;
	}

	.database-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 8px;
	}

	.database-card {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 10px;
		border-radius: 8px;
		background: var(--surface-muted);
	}

	.database-label {
		color: var(--text-muted);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.65rem;
		text-transform: uppercase;
	}

	.database-card strong {
		color: var(--text);
		font-size: 1.05rem;
		font-weight: 700;
	}

	.database-card > span:last-child {
		color: var(--text-muted);
		font-size: 0.65rem;
	}

	.score-bar {
		height: 10px;
		overflow: hidden;
		border-radius: 999px;
		background: var(--surface-muted);
	}

	.score-bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--brand-text);
	}

	.score-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
		margin-top: 10px;
		color: var(--text-muted);
		font-size: 0.72rem;
	}

	.score-meta strong {
		color: var(--text);
	}

	@media (max-width: 1023px) {
		.split-main,
		.split-even,
		.breakdown-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.database-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 639px) {
		.kpi-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
