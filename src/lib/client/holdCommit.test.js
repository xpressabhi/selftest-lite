import { describe, expect, it } from 'vitest';
import {
	HOLD_DURATION_MS,
	HOLD_NUDGE_MS,
	holdProgress,
	isHoldComplete,
	isTapRelease,
} from './holdCommit.js';

describe('holdCommit', () => {
	it('reports progress from 0 to 1 across the hold', () => {
		expect(holdProgress(0)).toBe(0);
		expect(holdProgress(HOLD_DURATION_MS / 2)).toBeCloseTo(0.5);
		expect(holdProgress(HOLD_DURATION_MS)).toBe(1);
	});

	it('clamps progress outside the hold window', () => {
		expect(holdProgress(-100)).toBe(0);
		expect(holdProgress(HOLD_DURATION_MS * 3)).toBe(1);
	});

	it('completes only once the full hold has elapsed', () => {
		expect(isHoldComplete(HOLD_DURATION_MS - 1)).toBe(false);
		expect(isHoldComplete(HOLD_DURATION_MS)).toBe(true);
	});

	it('treats very short releases as taps worth nudging', () => {
		expect(isTapRelease(HOLD_NUDGE_MS - 1)).toBe(true);
		expect(isTapRelease(HOLD_NUDGE_MS)).toBe(false);
		expect(isTapRelease(1200)).toBe(false);
	});
});
