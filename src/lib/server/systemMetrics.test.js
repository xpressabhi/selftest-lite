import { describe, expect, it } from 'vitest';
import { computeCpuPercent, getSystemMetrics } from './systemMetrics';

describe('computeCpuPercent', () => {
	it('computes percent of one core between samples', () => {
		const previous = { cpu: { user: 1_000_000, system: 1_000_000 }, timestamp: 0 };
		const current = { cpu: { user: 2_000_000, system: 2_000_000 }, timestamp: 1000 };
		expect(computeCpuPercent(previous, current)).toBe(200);
	});

	it('returns 0 for missing or non-advancing samples', () => {
		expect(computeCpuPercent(null, { cpu: { user: 10, system: 10 }, timestamp: 1000 })).toBe(0);
		expect(
			computeCpuPercent(
				{ cpu: { user: 10, system: 10 }, timestamp: 1000 },
				{ cpu: { user: 10, system: 10 }, timestamp: 1000 }
			)
		).toBe(0);
		expect(
			computeCpuPercent(
				{ cpu: { user: 20, system: 20 }, timestamp: 1000 },
				{ cpu: { user: 10, system: 10 }, timestamp: 2000 }
			)
		).toBe(0);
	});
});

describe('getSystemMetrics', () => {
	it('returns cpu and memory sections with numeric values', () => {
		const metrics = getSystemMetrics();
		expect(metrics.scope).toBe('serverless-instance');
		expect(metrics.cpu.cores).toBeGreaterThan(0);
		expect(metrics.cpu.usagePercent).toBeGreaterThanOrEqual(0);
		expect(metrics.cpu.sampleWindowMs).toBeGreaterThanOrEqual(0);
		expect(Array.isArray(metrics.cpu.loadAverage)).toBe(true);
		expect(metrics.memory.rssBytes).toBeGreaterThan(0);
		expect(metrics.memory).toHaveProperty('limitBytes');
		expect(metrics.memory).toHaveProperty('rssPercentOfLimit');
		expect(metrics.memory.systemTotalBytes).toBeGreaterThan(0);
		expect(metrics.memory.systemUsedPercent).toBeGreaterThanOrEqual(0);
	});
});
