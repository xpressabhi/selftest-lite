<script>
	import { formatNumber } from '#lib/client/formatting.js';
	import ActivityChart from '#lib/client/charts/ActivityChart.svelte';
	import ChartCard from '#lib/client/charts/ChartCard.svelte';
	import DonutChart from '#lib/client/charts/DonutChart.svelte';
	import RankBars from '#lib/client/charts/RankBars.svelte';
	import StatCard from '#lib/client/charts/StatCard.svelte';
	import { windowLabel } from './adminState.js';
	import { segmentsFromRows, seriesLabels } from './adminData.js';

	let { stats = null, days = 1, loading = {}, errors = {}, onRetry = () => {} } = $props();

	const series = $derived(stats?.series || null);
	const overview = $derived(stats?.overview || null);
	const activity = $derived(stats?.activity?.points || []);
	const labels = $derived(seriesLabels({ points: activity, granularity: series?.granularity }));
	const createdTotal = $derived(
		activity.reduce((sum, point) => sum + (Number(point.created) || 0), 0)
	);
	const attemptedTotal = $derived(
		activity.reduce((sum, point) => sum + (Number(point.attempted) || 0), 0)
	);
	const visitsTotal = $derived(
		activity.reduce((sum, point) => sum + (Number(point.visits) || 0), 0)
	);
	const activityHasData = $derived(
		activity.some(
			(point) =>
				(Number(point.created) || 0) > 0 ||
				(Number(point.attempted) || 0) > 0 ||
				(Number(point.visits) || 0) > 0
		)
	);
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
	const avgTimeMinutes = $derived(
		Math.round((Number(overview?.tables?.ai_test_attempts?.avg_time_seconds) || 0) / 60)
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
	<ChartCard
		title="Tests & visits"
		subtitle={`${windowLabel(days)} · ${granularityLabel}`}
		value={formatNumber(createdTotal)}
		valueSuffix="tests created"
		caption={`${formatNumber(attemptedTotal)} attempts · ${formatNumber(visitsTotal)} visiting sessions · visits are unique sessions with a page view`}
		loading={statsLoading}
		error={statsError}
		empty={!activityHasData}
		onRetry={() => onRetry('stats')}
	>
		<ActivityChart
			{labels}
			points={activity}
			dataWindow={String(days)}
			ariaLabel={`Tests created, tests attempted and visits over ${windowLabel(days)}`}
		/>
	</ChartCard>

	<div class="kpi-grid">
		<StatCard label="Tests created" value={formatNumber(createdTotal)} />
		<StatCard label="Attempts" value={formatNumber(attemptedTotal)} />
		<StatCard label="Visiting sessions" value={formatNumber(visitsTotal)} />
		<StatCard
			label="Avg score"
			value={attemptedTotal > 0 ? (attemptStats?.avg_score ?? 0) : '—'}
			suffix={attemptedTotal > 0 ? '%' : ''}
		/>
	</div>

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
					<RankBars items={modeSegments} ariaLabel="Tests by mode" />
				</ChartCard>
			{/if}
			{#if difficultySegments.length}
				<ChartCard title="Tests by difficulty" subtitle={windowLabel(days)}>
					<RankBars items={difficultySegments} ariaLabel="Tests by difficulty" />
				</ChartCard>
			{/if}
		</div>
	{/if}

	{#if attemptStats && attemptedTotal > 0}
		<ChartCard
			title="Attempt quality"
			subtitle={windowLabel(days)}
			value={attemptStats.avg_score ?? 0}
			valueSuffix="% avg"
			caption="Percentage of correct answers across attempts in this window"
		>
			<div
				class="score-bar"
				role="img"
				aria-label={`Average score ${attemptStats.avg_score ?? 0} percent`}
			>
				<span
					style={`width: ${Math.min(Math.max(Number(attemptStats.avg_score) || 0, 0), 100)}%`}
				></span>
			</div>
			<div class="score-meta">
				<span>Median <strong>{attemptStats.median_score ?? 0}%</strong></span>
				<span>Perfect <strong>{formatNumber(attemptStats.perfect_scores)}</strong></span>
				<span>Avg time <strong>{avgTimeMinutes} min</strong></span>
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

	.breakdown-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
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
		.breakdown-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 639px) {
		.kpi-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
