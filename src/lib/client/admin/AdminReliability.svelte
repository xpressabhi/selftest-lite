<script>
	import { formatNumber } from '#lib/client/formatting.js';
	import BarChart from '#lib/client/charts/BarChart.svelte';
	import ChartCard from '#lib/client/charts/ChartCard.svelte';
	import DonutChart from '#lib/client/charts/DonutChart.svelte';
	import RankBars from '#lib/client/charts/RankBars.svelte';
	import StackedBar from '#lib/client/charts/StackedBar.svelte';
	import StatCard from '#lib/client/charts/StatCard.svelte';
	import { windowLabel } from './adminState.js';
	import { downlinkItems, downlinkLabel, networkSegments, tierSegments } from './adminData.js';

	let {
		deviceNetwork = null,
		days = 1,
		loading = {},
		errors = {},
		onRetry = () => {},
	} = $props();

	const tiers = $derived(tierSegments(deviceNetwork?.tiers));
	const network = $derived(deviceNetwork?.network || {});
	const typeSegments = $derived(networkSegments(network.type, 'type'));
	const downlinkSegments = $derived(networkSegments(network.downlink, 'downlink'));
	const rttSegments = $derived(networkSegments(network.rtt, 'rtt'));
	const outcomes = $derived(downlinkItems(deviceNetwork?.generateByDownlink));
	const models = $derived(
		(deviceNetwork?.topLowModels || []).map((row) => ({
			label: `${row.model} · Android ${row.android}`,
			value: Number(row.identities) || 0,
		}))
	);
	const floor = $derived(deviceNetwork?.floor || null);
	const identities = $derived(Number(deviceNetwork?.identities) || 0);
	const coverage = $derived(deviceNetwork?.coverage?.sharePct);
	const chartLoading = $derived(Boolean(loading.device));
	const chartError = $derived(errors.device || '');
</script>

<section class="tab-body">
	<div class="kpi-grid">
		<StatCard label="Profiled identities" value={formatNumber(identities)} />
		<StatCard label="Profile coverage" value={coverage ?? '—'} suffix="%" />
		<StatCard
			label="Supported floor"
			value={floor ? downlinkLabel(floor.bucket) : '—'}
			suffix={floor ? 'Mbps' : ''}
		/>
		<StatCard
			label="Fail at floor"
			value={floor?.failPct ?? '—'}
			suffix={floor?.failPct != null ? '%' : ''}
		/>
	</div>

	<div class="split-main">
		<ChartCard
			title="Network mix"
			subtitle={`${windowLabel(days)} · worst per session`}
			caption="Effective type, downlink and round-trip time"
			loading={chartLoading}
			error={chartError}
			empty={!typeSegments.length && !downlinkSegments.length && !rttSegments.length}
			onRetry={() => onRetry('device')}
		>
			<div class="network-rows">
				<div>
					<h3>Effective type</h3>
					<StackedBar
						segments={typeSegments}
						ariaLabel="Network type distribution"
						dataWindow={String(days)}
					/>
				</div>
				<div>
					<h3>Downlink (Mbps)</h3>
					<StackedBar
						segments={downlinkSegments}
						ariaLabel="Downlink distribution"
						dataWindow={String(days)}
					/>
				</div>
				<div>
					<h3>RTT (ms)</h3>
					<StackedBar
						segments={rttSegments}
						ariaLabel="Round-trip time distribution"
						dataWindow={String(days)}
					/>
				</div>
			</div>
		</ChartCard>

		<ChartCard
			title="Device tiers"
			subtitle={windowLabel(days)}
			value={formatNumber(identities)}
			caption="Latest profile per identity"
			loading={chartLoading}
			error={chartError}
			empty={!tiers.length}
			onRetry={() => onRetry('device')}
		>
			<DonutChart
				segments={tiers}
				centerLabel="identities"
				centerValue={formatNumber(identities)}
				ariaLabel={`Device tiers: ${tiers.map((item) => `${item.label} ${item.value}`).join(', ')}`}
				dataWindow={String(days)}
				size={156}
			/>
		</ChartCard>
	</div>

	<div class="split-even">
		<ChartCard
			title="Generate outcomes by downlink"
			subtitle={windowLabel(days)}
			caption="Succeeded and failed generations per bucket"
			loading={chartLoading}
			error={chartError}
			empty={!outcomes.length}
			onRetry={() => onRetry('device')}
		>
			<BarChart
				items={outcomes}
				ariaLabel="Generate outcomes by downlink"
				dataWindow={String(days)}
			/>
		</ChartCard>

		<ChartCard
			title="Top low-tier models"
			subtitle={windowLabel(days)}
			caption="Identities on low-tier devices"
			loading={chartLoading}
			error={chartError}
			empty={!models.length}
			onRetry={() => onRetry('device')}
		>
			<RankBars
				items={models}
				ariaLabel="Top low-tier device models"
				dataWindow={String(days)}
			/>
		</ChartCard>
	</div>

	{#if floor}
		<p class="floor-note">
			Supported floor: downlink {downlinkLabel(floor.bucket)} Mbps (p10, covers {floor.coveragePct}%
			of sessions with a known downlink) · RTT p90 {floor.rttBucket ?? 'unknown'} ms · generate
			failure at or below: {floor.failPct ?? '-'}% ({floor.failedBelow}/{floor.startedBelow})
		</p>
	{/if}

	{#if deviceNetwork}
		<details class="details">
			<summary>Device and network tables</summary>
			<div class="details-grid">
				<div class="table-wrap">
					<table class="admin-table">
						<thead><tr><th>Tier</th><th>Identities</th><th>Share</th></tr></thead>
						<tbody>
							{#each deviceNetwork.tiers || [] as row (row.tier)}
								<tr
									><td class="mono">{row.tier}</td><td
										>{formatNumber(row.identities)}</td
									><td>{row.pct}%</td></tr
								>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="table-wrap">
					<table class="admin-table">
						<thead><tr><th>Model</th><th>Android</th><th>Identities</th></tr></thead>
						<tbody>
							{#each deviceNetwork.topLowModels || [] as row (`${row.model}-${row.android}`)}
								<tr
									><td class="mono">{row.model}</td><td class="mono"
										>{row.android}</td
									><td>{formatNumber(row.identities)}</td></tr
								>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="table-wrap">
					<table class="admin-table">
						<thead
							><tr><th>Downlink</th><th>Started</th><th>Failed</th><th>Fail %</th></tr
							></thead
						>
						<tbody>
							{#each deviceNetwork.generateByDownlink || [] as row (row.bucket)}
								<tr
									><td class="mono">{downlinkLabel(row.bucket)}</td><td
										>{formatNumber(row.started)}</td
									><td>{formatNumber(row.failed)}</td><td
										>{row.failRate ?? '-'}</td
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

	.network-rows {
		display: grid;
		gap: 14px;
	}

	.network-rows h3 {
		margin: 0 0 6px;
		color: var(--text-muted);
		font-size: 0.7rem;
		font-weight: 600;
	}

	.floor-note {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.7rem;
		line-height: 1.5;
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
		.split-main,
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
