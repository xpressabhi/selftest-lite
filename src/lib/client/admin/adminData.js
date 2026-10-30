// Pure transformations between the admin API shapes and the chart component
// props. Keeping these out of Svelte makes the empty/partial-data behaviour
// testable and stops one tab from reinventing the same mapping.

import { dayLabel, hourLabel } from '#lib/client/formatting.js';
import { percentChange } from '#lib/client/charts/chartMath.js';

export function seriesLabels(series) {
	if (!series?.points?.length) return [];
	const formatter = series.granularity === 'hour' ? hourLabel : dayLabel;
	return series.points.map((point) => formatter(point.bucket));
}

export function seriesValues(series, key = 'requests') {
	return (series?.points || []).map((point) => Number(point[key]) || 0);
}

export function errorRateValues(series) {
	return (series?.points || []).map((point) => {
		const requests = Number(point.requests) || 0;
		const errors = Number(point.errors) || 0;
		return requests > 0 ? Number(((errors / requests) * 100).toFixed(2)) : 0;
	});
}

export function kpiDelta(current, previous) {
	return previous == null ? null : percentChange(current, previous);
}

const STATUS_GROUPS = [
	{ key: '2xx', label: '2xx success', tone: 'success' },
	{ key: '3xx', label: '3xx redirect', tone: 'info' },
	{ key: '4xx', label: '4xx client error', tone: 'warn' },
	{ key: '5xx', label: '5xx server error', tone: 'danger' },
	{ key: 'other', label: 'Other', tone: 'neutral' },
];

export function statusSegments(byStatus = []) {
	const counts = new Map(STATUS_GROUPS.map((group) => [group.key, 0]));
	for (const row of byStatus) {
		const code = Number(row.status_code);
		let key = 'other';
		if (code >= 200 && code < 300) key = '2xx';
		else if (code >= 300 && code < 400) key = '3xx';
		else if (code >= 400 && code < 500) key = '4xx';
		else if (code >= 500 && code < 600) key = '5xx';
		counts.set(key, counts.get(key) + (Number(row.requests) || 0));
	}
	return STATUS_GROUPS.map((group) => ({
		label: group.label,
		tone: group.tone,
		value: counts.get(group.key) || 0,
	})).filter((segment) => segment.value > 0);
}

const AGENT_TONES = { Bot: 'warn', Mobile: 'brand', Desktop: 'info', Unknown: 'neutral' };

export function agentSegments(byAgentFamily = []) {
	return byAgentFamily
		.map((row) => ({
			label: row.family || 'Unknown',
			value: Number(row.requests) || 0,
			tone: AGENT_TONES[row.family] || 'neutral',
		}))
		.filter((segment) => segment.value > 0);
}

const TIER_TONES = { low: 'danger', mid: 'warn', high: 'brand', unknown: 'neutral' };

export function tierSegments(tiers = []) {
	return tiers
		.map((row) => ({
			label: row.tier || 'unknown',
			value: Number(row.identities) || 0,
			tone: TIER_TONES[row.tier] || 'neutral',
		}))
		.filter((segment) => segment.value > 0);
}

const NETWORK_LABELS = {
	type: {
		'slow-2g': 'slow-2g',
		'2g': '2g',
		'3g': '3g',
		'4g': '4g',
		unknown: 'unknown',
	},
	downlink: {
		lt025: '<0.25',
		'025-05': '0.25–0.5',
		'05-1': '0.5–1',
		'1-2': '1–2',
		'2-5': '2–5',
		'5-10': '5–10',
		'10p': '10+',
		unknown: 'unknown',
	},
	rtt: {
		lt100: '<100',
		'100-200': '100–200',
		'200-400': '200–400',
		'400-800': '400–800',
		'800-1500': '800–1500',
		'1500p': '1500+',
		unknown: 'unknown',
	},
};

const NETWORK_TONES = {
	'slow-2g': 'danger',
	'2g': 'danger',
	'3g': 'warn',
	'4g': 'brand',
	unknown: 'neutral',
	lt025: 'danger',
	'025-05': 'danger',
	'05-1': 'warn',
	'1-2': 'warn',
	'2-5': 'info',
	'5-10': 'brand',
	'10p': 'success',
	lt100: 'success',
	'100-200': 'brand',
	'200-400': 'info',
	'400-800': 'warn',
	'800-1500': 'danger',
	'1500p': 'danger',
};

export function networkSegments(rows = [], dimension = 'type') {
	const labels = NETWORK_LABELS[dimension] || {};
	return (rows || [])
		.map((row) => ({
			label: labels[row.bucket] || row.bucket || 'unknown',
			value: Number(row.sessions) || 0,
			tone: NETWORK_TONES[row.bucket] || 'neutral',
		}))
		.filter((segment) => segment.value > 0);
}

export function downlinkLabel(bucket) {
	return NETWORK_LABELS.downlink[bucket] || bucket || 'unknown';
}

export function downlinkItems(rows = []) {
	return rows
		.filter((row) => (Number(row.started) || 0) > 0)
		.map((row) => ({
			label: downlinkLabel(row.bucket),
			shortLabel: downlinkLabel(row.bucket),
			segments: [
				{
					label: 'Succeeded',
					value: Math.max((Number(row.started) || 0) - (Number(row.failed) || 0), 0),
					tone: 'brand',
				},
				{ label: 'Failed', value: Number(row.failed) || 0, tone: 'danger' },
			],
			note: row.failRate != null ? `${row.failRate}% fail` : '',
		}));
}

export function rankRows(rows = [], { key = 'requests', labelKey, limit = 12 } = {}) {
	return (rows || []).slice(0, limit).map((row) => ({
		label: String(row[labelKey] || 'unknown'),
		value: Number(row[key]) || 0,
		note:
			Number(row.errors) > 0
				? `${Number(row.errors).toLocaleString()} errors`
				: row.pct != null
					? `${row.pct}%`
					: '',
	}));
}

export function segmentsFromRows(rows = [], labelKey, valueKey = 'count') {
	const tones = ['brand', 'warn', 'info', 'danger', 'neutral', 'success'];
	return (rows || []).map((row, index) => ({
		label: String(row[labelKey] || 'unknown'),
		value: Number(row[valueKey]) || 0,
		tone: tones[index % tones.length],
	}));
}

const FUNNEL_STEPS = [
	{ event: 'generate:start', label: 'Generation started' },
	{ event: 'generate:success', label: 'Generation succeeded' },
	{ event: 'test:start', label: 'Test started' },
	{ event: 'test:submit', label: 'Test submitted' },
];

export function funnelItems(byEvent = []) {
	const counts = new Map((byEvent || []).map((row) => [row.event, Number(row.count) || 0]));
	const first = counts.get(FUNNEL_STEPS[0].event) || 0;
	if (first <= 0) return [];
	let previous = null;
	return FUNNEL_STEPS.map((step, index) => {
		const value = counts.get(step.event) || 0;
		const note =
			index === 0
				? 'baseline'
				: previous > 0
					? `${((value / previous) * 100).toFixed(1)}% of previous`
					: '—';
		previous = value;
		return {
			label: step.label,
			value,
			note,
			tone: index === 0 ? 'brand' : 'info',
		};
	});
}

export function attentionItems({ stats, featureUsage, deviceNetwork } = {}) {
	const items = [];
	const routes = (stats?.byRoute || []).filter((row) => (Number(row.requests) || 0) >= 10);

	const worst = routes
		.map((row) => ({
			...row,
			rate: ((Number(row.errors) || 0) / Math.max(Number(row.requests) || 0, 1)) * 100,
		}))
		.sort((a, b) => b.rate - a.rate)[0];
	if (worst && worst.rate >= 5) {
		items.push({
			tone: 'danger',
			title: 'Route errors',
			detail: `${worst.route} · ${worst.rate.toFixed(1)}% errors`,
			tab: 'traffic',
			cta: 'Open traffic',
		});
	}

	const slowest = [...routes]
		.filter((row) => row.route !== worst?.route)
		.sort((a, b) => (Number(b.avg_duration_ms) || 0) - (Number(a.avg_duration_ms) || 0))[0];
	if (slowest && (Number(slowest.avg_duration_ms) || 0) >= 1000) {
		items.push({
			tone: 'warn',
			title: 'Slow route',
			detail: `${slowest.route} · ${slowest.avg_duration_ms} ms average`,
			tab: 'traffic',
			cta: 'Open traffic',
		});
	}

	const counts = new Map(
		(featureUsage?.byEvent || []).map((row) => [row.event, Number(row.count) || 0])
	);
	const starts = counts.get('generate:start') || 0;
	const fails = counts.get('generate:fail') || 0;
	const failRate = starts > 0 ? (fails / starts) * 100 : 0;
	if (starts >= 10 && failRate >= 10) {
		items.push({
			tone: 'danger',
			title: 'Generation failures',
			detail: `${failRate.toFixed(1)}% of ${starts.toLocaleString()} starts`,
			tab: 'engagement',
			cta: 'Open engagement',
		});
	}

	const floor = deviceNetwork?.floor;
	if (floor && (Number(floor.startedBelow) || 0) >= 10 && (Number(floor.failPct) || 0) >= 10) {
		items.push({
			tone: 'warn',
			title: 'Slow-network failures',
			detail: `${floor.failPct}% at or below ${downlinkLabel(floor.bucket)} Mbps`,
			tab: 'reliability',
			cta: 'Open reliability',
		});
	}

	return items.slice(0, 3);
}
