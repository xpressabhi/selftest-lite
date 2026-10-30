import { describe, expect, it } from 'vitest';
import {
	agentSegments,
	attentionItems,
	downlinkItems,
	errorRateValues,
	funnelItems,
	networkSegments,
	seriesLabels,
	seriesValues,
	statusSegments,
	tierSegments,
} from './adminData.js';

// The dashboard must survive partial API payloads (the design-consistency
// suite stubs `{}`), missing buckets and low-volume noise. These cases pin the
// transforms that decide whether a chart is empty or misleading.
describe('admin chart transforms', () => {
	it('returns nothing for empty series instead of NaN labels', () => {
		expect(seriesLabels({ points: [] })).toEqual([]);
		expect(seriesValues({ points: [] })).toEqual([]);
		expect(errorRateValues({ points: [] })).toEqual([]);
		expect(seriesValues(null)).toEqual([]);
	});

	it('computes error rate as 0 when a bucket has no requests', () => {
		const values = errorRateValues({
			points: [
				{ requests: 0, errors: 0 },
				{ requests: 10, errors: 2 },
			],
		});
		expect(values).toEqual([0, 20]);
	});

	it('groups unknown and null status codes into Other', () => {
		const segments = statusSegments([
			{ status_code: 200, requests: 5 },
			{ status_code: 301, requests: 1 },
			{ status_code: 404, requests: 2 },
			{ status_code: 500, requests: 1 },
			{ status_code: null, requests: 1 },
			{ status_code: 99, requests: 1 },
		]);
		expect(segments.find((item) => item.label === 'Other')?.value).toBe(2);
		expect(segments.reduce((sum, item) => sum + item.value, 0)).toBe(11);
		expect(statusSegments([])).toEqual([]);
	});

	it('drops zero-value agent and tier rows', () => {
		expect(agentSegments([{ family: 'Bot', requests: 0 }])).toEqual([]);
		expect(agentSegments([{ family: 'Bot', requests: 3 }])[0]).toMatchObject({
			label: 'Bot',
			value: 3,
			tone: 'warn',
		});
		expect(tierSegments([{ tier: 'low', identities: 0 }])).toEqual([]);
		expect(tierSegments([])).toEqual([]);
	});

	it('maps network buckets and tolerates an unknown dimension', () => {
		const rows = networkSegments(
			[
				{ bucket: '05-1', sessions: 4 },
				{ bucket: 'unknown', sessions: 0 },
			],
			'downlink'
		);
		expect(rows).toEqual([{ label: '0.5–1', value: 4, tone: 'warn' }]);
		expect(networkSegments([], 'type')).toEqual([]);
		expect(networkSegments([{ bucket: 'x', sessions: 1 }], 'made-up')).toEqual([
			{ label: 'x', value: 1, tone: 'neutral' },
		]);
	});

	it('omits empty downlink buckets and keeps fail notes', () => {
		expect(downlinkItems([{ bucket: 'unknown', started: 0, failed: 0 }])).toEqual([]);
		expect(
			downlinkItems([{ bucket: '05-1', started: 4, failed: 1, failRate: 25 }])[0]
		).toMatchObject({
			label: '0.5–1',
			note: '25% fail',
			segments: [
				{ label: 'Succeeded', value: 3 },
				{ label: 'Failed', value: 1 },
			],
		});
	});

	it('returns an empty funnel when generation never started', () => {
		expect(funnelItems([])).toEqual([]);
		expect(funnelItems([{ event: 'generate:start', count: 0 }])).toEqual([]);
		const funnel = funnelItems([
			{ event: 'generate:start', count: 10 },
			{ event: 'generate:success', count: 5 },
		]);
		expect(funnel.map((step) => step.value)).toEqual([10, 5, 0, 0]);
		expect(funnel[1].note).toBe('50.0% of previous');
	});

	it('ignores low-volume routes when deciding what needs attention', () => {
		const items = attentionItems({
			stats: {
				byRoute: [
					{ route: '/tiny', requests: 3, errors: 3, avg_duration_ms: 9000 },
					{ route: '/ok', requests: 100, errors: 0, avg_duration_ms: 50 },
				],
			},
		});
		expect(items).toEqual([]);
	});

	it('surfaces a high-error route and does not repeat it as the slow route', () => {
		const items = attentionItems({
			stats: {
				byRoute: [
					{ route: '/broken', requests: 100, errors: 50, avg_duration_ms: 4000 },
					{ route: '/slow', requests: 100, errors: 0, avg_duration_ms: 2000 },
				],
			},
		});
		expect(items[0]).toMatchObject({ title: 'Route errors', tab: 'traffic' });
		expect(
			items.some((item) => item.title === 'Slow route' && item.detail.includes('/broken'))
		).toBe(false);
		expect(
			items.some((item) => item.title === 'Slow route' && item.detail.includes('/slow'))
		).toBe(true);
	});

	it('surfaces generation and slow-network failures only above the volume floor', () => {
		const below = attentionItems({
			stats: { byRoute: [] },
			featureUsage: { byEvent: [{ event: 'generate:start', count: 9 }] },
			deviceNetwork: { floor: { startedBelow: 9, failPct: 90, bucket: 'lt025' } },
		});
		expect(below).toEqual([]);

		const above = attentionItems({
			stats: { byRoute: [] },
			featureUsage: {
				byEvent: [
					{ event: 'generate:start', count: 20 },
					{ event: 'generate:fail', count: 4 },
				],
			},
			deviceNetwork: {
				floor: { startedBelow: 20, failPct: 25, bucket: '05-1' },
			},
		});
		expect(above.map((item) => item.title)).toEqual([
			'Generation failures',
			'Slow-network failures',
		]);
	});
});
