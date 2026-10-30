import { describe, expect, it } from 'vitest';
import {
	areaPath,
	arcPath,
	buildTicks,
	chartGeometry,
	clamp,
	compactNumber,
	donutSegments,
	linePath,
	niceMax,
	percentChange,
	pickEvenIndices,
} from './chartMath.js';

// These tests exist because charts break silently: NaN path coordinates
// disappear, zero totals divide by zero, and a single point renders off the
// canvas. Each block starts from the failure mode, then pins the fix.
describe('chartMath failure modes', () => {
	it('never divides by zero on empty or zero data', () => {
		const empty = chartGeometry([], { width: 400, height: 160 });
		expect(empty.points).toEqual([]);
		expect(empty.max).toBe(1);
		expect(empty.plotWidth).toBeGreaterThan(0);

		const zeros = chartGeometry([0, 0, 0], { width: 400, height: 160 });
		expect(zeros.max).toBe(1);
		expect(
			zeros.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
		).toBe(true);
	});

	it('centres a single point instead of producing NaN or an off-canvas x', () => {
		const geometry = chartGeometry([12], { width: 400, height: 160 });
		expect(geometry.points).toHaveLength(1);
		expect(geometry.points[0].x).toBeGreaterThan(0);
		expect(geometry.points[0].x).toBeLessThan(400);
		expect(linePath(geometry.points)).toContain('M');
	});

	it('keeps flat series finite and inside the plot', () => {
		const geometry = chartGeometry([5, 5, 5, 5], { width: 400, height: 160 });
		expect(new Set(geometry.points.map((point) => point.y)).size).toBe(1);
		expect(geometry.points.every((point) => Number.isFinite(point.y))).toBe(true);
	});

	it('returns empty paths for empty input and valid paths otherwise', () => {
		expect(linePath([])).toBe('');
		expect(areaPath([], 100)).toBe('');
		const geometry = chartGeometry([1, 3, 2], { width: 300, height: 120 });
		expect(linePath(geometry.points)).toMatch(/^M /);
		expect(areaPath(geometry.points, geometry.baselineY)).toMatch(/Z$/);
		expect(areaPath(geometry.points, geometry.baselineY)).not.toContain('NaN');
	});

	it('handles negative, NaN and Infinity maxima without breaking the axis', () => {
		expect(niceMax(-10)).toBe(1);
		expect(niceMax(0)).toBe(1);
		expect(niceMax(Number.NaN)).toBe(1);
		expect(niceMax(Number.POSITIVE_INFINITY)).toBe(1);
		const geometry = chartGeometry([Number.NaN, 10, Number.POSITIVE_INFINITY], {
			width: 300,
			height: 120,
		});
		expect(geometry.points.every((point) => Number.isFinite(point.y))).toBe(true);
	});

	it('uses an explicit axis max exactly, so integer ticks and bars share a scale', () => {
		const geometry = chartGeometry([8], { width: 300, height: 120, max: 8 });
		expect(geometry.max).toBe(8);
		expect(geometry.points[0].y).toBe(geometry.pad.top);
	});

	it('builds unique ascending ticks that include zero', () => {
		const ticks = buildTicks(97, 4);
		expect(ticks[0]).toBe(0);
		expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
		expect(new Set(ticks).size).toBe(ticks.length);
		expect(ticks.at(-1)).toBeGreaterThanOrEqual(97);
		expect(buildTicks(0, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
		expect(buildTicks(0, 4, { integer: true })).toEqual([0, 1]);
		expect(buildTicks(97, 4, { integer: true })).toEqual([0, 25, 50, 75, 100]);
		expect(buildTicks(50, 4, { integer: true })).toEqual([0, 10, 20, 30, 40, 50]);
		expect(buildTicks(8, 4, { integer: true })).toEqual([0, 2, 4, 6, 8, 10]);
		expect(buildTicks(3, 4, { integer: true })).toEqual([0, 1, 2, 3, 4, 5]);
	});

	it('returns no donut slices for a zero total', () => {
		expect(donutSegments([])).toEqual([]);
		expect(donutSegments([{ value: 0 }, { value: -2 }])).toEqual([]);
	});

	it('keeps donut percentages at 100 and flags a single full slice', () => {
		const slices = donutSegments([{ value: 1 }, { value: 1 }, { value: 2 }]);
		expect(slices.reduce((sum, slice) => sum + slice.percent, 0)).toBeCloseTo(100, 1);
		const single = donutSegments([{ value: 9 }]);
		expect(single).toHaveLength(1);
		expect(single[0].full).toBe(true);
		expect(single[0].startAngle).toBe(0);
		expect(single[0].endAngle).toBe(360);
	});

	it('does not emit NaN arcs for tiny slices', () => {
		const slices = donutSegments([{ value: 1000 }, { value: 0.01 }]);
		for (const slice of slices) {
			expect(Number.isFinite(slice.startAngle)).toBe(true);
			expect(Number.isFinite(slice.endAngle)).toBe(true);
			expect(arcPath(80, 80, 60, slice.startAngle, slice.endAngle)).not.toContain('NaN');
		}
	});

	it('cannot compute a percentage from a zero baseline', () => {
		expect(percentChange(5, 0)).toBeNull();
		expect(percentChange(0, 0)).toBe(0);
		expect(percentChange(10, 5)).toBe(100);
		expect(percentChange(5, 10)).toBe(-50);
		expect(percentChange(Number.NaN, 10)).toBeNull();
	});

	it('formats compact numbers without NaN or trailing noise', () => {
		expect(compactNumber(0)).toBe('0');
		expect(compactNumber(999)).toBe('999');
		expect(compactNumber(1000)).toBe('1K');
		expect(compactNumber(1200)).toBe('1.2K');
		expect(compactNumber(1_250_000)).toBe('1.3M');
		expect(compactNumber(Number.NaN)).toBe('0');
	});

	it('never duplicates x-axis label indices', () => {
		expect(pickEvenIndices(0)).toEqual([]);
		expect(pickEvenIndices(1)).toEqual([0]);
		expect(pickEvenIndices(3, 5)).toEqual([0, 1, 2]);
		const indices = pickEvenIndices(90, 5);
		expect(new Set(indices).size).toBe(indices.length);
		expect(indices[0]).toBe(0);
		expect(indices.at(-1)).toBe(89);
	});

	it('clamps out-of-range values', () => {
		expect(clamp(-1, 0, 10)).toBe(0);
		expect(clamp(11, 0, 10)).toBe(10);
		expect(clamp(4, 0, 10)).toBe(4);
	});
});
