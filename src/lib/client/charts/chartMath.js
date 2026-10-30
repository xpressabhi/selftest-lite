// Pure geometry and formatting helpers for the admin chart components.
// Nothing here touches the DOM, so the failure modes (empty series, a single
// point, zero totals, flat lines) can be tested without a browser.

/** Clamps a value into an inclusive range. */
export function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

/**
 * Rounds a maximum up to a readable axis bound (1, 2, 5 x a power of ten).
 * Returns 1 for zero, negative and non-finite input so scales never divide
 * by zero.
 */
export function niceMax(value) {
	const number = Number(value);
	if (!Number.isFinite(number) || number <= 0) {
		return 1;
	}
	const magnitude = 10 ** Math.floor(Math.log10(number));
	const normalized = number / magnitude;
	let step = 10;
	if (normalized <= 1) step = 1;
	else if (normalized <= 2) step = 2;
	else if (normalized <= 5) step = 5;
	return step * magnitude;
}

/**
 * Evenly spaced axis ticks from 0 to a nice bound. The result always includes
 * 0 and the returned max, and never contains duplicates.
 *
 * `integer` is for count axes: it keeps fractional steps (0.25, 0.5) out of
 * labels like "0, 0, 0, 1". Percent axes leave it off.
 */
export function buildTicks(max, count = 4, { integer = false } = {}) {
	let intervals = Math.max(Math.round(Number(count) || 0), 1);
	let bound = niceMax(max);
	if (integer) {
		const desired = intervals;
		const rawStep = bound / desired;
		const fit = (step) => {
			const nextIntervals = Math.max(Math.ceil(bound / step), 1);
			const nextBound = step * nextIntervals;
			return {
				step,
				intervals: nextIntervals,
				bound: nextBound,
				overshoot: nextBound - bound,
			};
		};
		const steps = new Set();
		for (let magnitude = 1; magnitude <= 1e12; magnitude *= 10) {
			for (const multiplier of [1, 2, 2.5, 5, 10]) {
				const step = multiplier * magnitude;
				if (Number.isInteger(step)) steps.add(step);
			}
		}
		steps.add(Math.max(Math.ceil(rawStep), 1));
		const candidates = [...steps]
			.map(fit)
			.sort(
				(a, b) =>
					a.overshoot - b.overshoot ||
					Math.abs(a.step - rawStep) - Math.abs(b.step - rawStep) ||
					b.intervals - a.intervals
			);
		const chosen = candidates[0];
		intervals = chosen.intervals;
		bound = chosen.bound;
	}
	const step = bound / intervals;
	const ticks = [];
	for (let index = 0; index <= intervals; index += 1) {
		ticks.push(Number((index * step).toFixed(10)));
	}
	return ticks;
}

/**
 * Maps values onto SVG pixel coordinates. Empty and single-point series get
 * sane coordinates instead of NaN; a flat series sits on the baseline rather
 * than dividing by a zero range.
 */
export function chartGeometry(
	values,
	{ width = 640, height = 220, padding = {}, max = null } = {}
) {
	const pad = {
		top: padding.top ?? 16,
		right: padding.right ?? 16,
		bottom: padding.bottom ?? 28,
		left: padding.left ?? 48,
	};
	const safeWidth = Math.max(Number(width) || 0, 1);
	const safeHeight = Math.max(Number(height) || 0, 1);
	const plotWidth = Math.max(safeWidth - pad.left - pad.right, 1);
	const plotHeight = Math.max(safeHeight - pad.top - pad.bottom, 1);
	const numbers = (values || []).map((value) =>
		Number.isFinite(Number(value)) ? Number(value) : 0
	);
	const requestedMax = max ?? (numbers.length ? Math.max(...numbers) : 0);
	const providedMax = Number(requestedMax);
	const axisMax =
		Number.isFinite(providedMax) && providedMax > 0 ? providedMax : niceMax(requestedMax);
	const baselineY = pad.top + plotHeight;
	const xFor = (index) =>
		numbers.length <= 1
			? pad.left + plotWidth / 2
			: pad.left + (index / (numbers.length - 1)) * plotWidth;
	const yFor = (value) => {
		const number = Number(value);
		const safe = Number.isFinite(number) ? clamp(number, 0, axisMax) : 0;
		return pad.top + plotHeight - (safe / axisMax) * plotHeight;
	};
	const points = numbers.map((value, index) => ({
		x: xFor(index),
		y: yFor(value),
		value,
		index,
	}));
	return {
		points,
		pad,
		plotWidth,
		plotHeight,
		baselineY,
		max: axisMax,
		xFor,
		yFor,
	};
}

/** SVG path for a line through the given points. */
export function linePath(points) {
	if (!points?.length) return '';
	return points
		.map((point, index) => `${index === 0 ? 'M' : 'L'} ${round(point.x)} ${round(point.y)}`)
		.join(' ');
}

/** SVG path for the filled area under a line. */
export function areaPath(points, baselineY) {
	if (!points?.length) return '';
	const first = points[0];
	const last = points[points.length - 1];
	return `M ${round(first.x)} ${round(baselineY)} ${linePath(points).replace(/^M/, 'L')} L ${round(last.x)} ${round(baselineY)} Z`;
}

/**
 * Donut slices with a small visual gap. Zero/invalid totals return an empty
 * list; a single slice is flagged `full` so the caller can draw a circle
 * instead of a 360-degree arc (which SVG cannot express).
 */
export function donutSegments(segments, { gapDegrees = 2 } = {}) {
	const items = (segments || []).filter(
		(segment) => Number.isFinite(Number(segment?.value)) && Number(segment.value) > 0
	);
	const total = items.reduce((sum, segment) => sum + Number(segment.value), 0);
	if (!total) return [];
	let cursor = 0;
	return items.map((segment) => {
		const value = Number(segment.value);
		const sweep = (value / total) * 360;
		const single = items.length === 1;
		const gap = single ? 0 : Math.min(gapDegrees, sweep * 0.25);
		const startAngle = cursor + gap / 2;
		const endAngle = cursor + sweep - gap / 2;
		cursor += sweep;
		return {
			...segment,
			value,
			percent: Number(((value / total) * 100).toFixed(1)),
			startAngle,
			endAngle,
			full: single && sweep >= 359.99,
		};
	});
}

/** SVG arc path for a stroked donut slice. */
export function arcPath(cx, cy, radius, startAngle, endAngle) {
	const start = polar(cx, cy, radius, startAngle);
	const end = polar(cx, cy, radius, endAngle);
	const largeArc = endAngle - startAngle > 180 ? 1 : 0;
	return `M ${round(start.x)} ${round(start.y)} A ${radius} ${radius} 0 ${largeArc} 1 ${round(end.x)} ${round(end.y)}`;
}

function polar(cx, cy, radius, angle) {
	const radians = ((angle - 90) * Math.PI) / 180;
	return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

/**
 * Percent change against a previous value. A missing baseline cannot be
 * expressed as a percentage, so it returns null rather than +Infinity.
 */
export function percentChange(current, previous) {
	const next = Number(current);
	const prior = Number(previous);
	if (!Number.isFinite(next) || !Number.isFinite(prior)) return null;
	if (prior === 0) return next === 0 ? 0 : null;
	return Number((((next - prior) / Math.abs(prior)) * 100).toFixed(1));
}

/** Compact axis labels: 999, 1.2K, 3.4M. */
export function compactNumber(value) {
	const number = Number(value);
	if (!Number.isFinite(number)) return '0';
	const absolute = Math.abs(number);
	if (absolute < 1000) {
		return `${Math.round(number)}`;
	}
	const units = [
		{ limit: 1e9, suffix: 'B' },
		{ limit: 1e6, suffix: 'M' },
		{ limit: 1e3, suffix: 'K' },
	];
	for (const unit of units) {
		if (absolute >= unit.limit) {
			const scaled = number / unit.limit;
			const rounded = Math.abs(scaled) >= 10 ? Math.round(scaled) : Number(scaled.toFixed(1));
			return `${rounded}${unit.suffix}`;
		}
	}
	return `${Math.round(number)}`;
}

/**
 * Evenly spaced label indices (first and last included). Uses a Set so
 * rounding can never produce duplicate keys.
 */
export function pickEvenIndices(length, count = 5) {
	const total = Number(length);
	const wanted = Math.max(Number(count) || 0, 2);
	if (!Number.isFinite(total) || total <= 0) return [];
	if (total <= wanted) return Array.from({ length: total }, (_, index) => index);
	const step = (total - 1) / (wanted - 1);
	const indices = new Set();
	for (let index = 0; index < wanted; index += 1) {
		indices.add(Math.round(index * step));
	}
	return [...indices].sort((a, b) => a - b);
}

function round(value) {
	return Math.round(value * 100) / 100;
}
