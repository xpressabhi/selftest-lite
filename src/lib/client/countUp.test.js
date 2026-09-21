import { describe, expect, it } from 'vitest';
import { COUNT_UP_MS, countUpValue, shouldCountUp } from './countUp.js';

describe('countUpValue', () => {
	it('starts at zero and lands exactly on the target', () => {
		expect(countUpValue(80, 0)).toBe(0);
		expect(countUpValue(80, COUNT_UP_MS)).toBe(80);
		expect(countUpValue(80, COUNT_UP_MS * 2)).toBe(80);
	});

	it('eases through the middle without overshooting', () => {
		const mid = countUpValue(80, COUNT_UP_MS / 2);
		expect(mid).toBeGreaterThan(0);
		expect(mid).toBeLessThan(80);
	});

	it('clamps negative elapsed time', () => {
		expect(countUpValue(80, -50)).toBe(0);
	});

	it('returns the target immediately for non-positive durations', () => {
		expect(countUpValue(80, 10, 0)).toBe(80);
	});

	it('tolerates malformed targets', () => {
		expect(countUpValue(undefined, COUNT_UP_MS)).toBe(0);
		expect(countUpValue('nope', COUNT_UP_MS)).toBe(0);
	});
});

describe('shouldCountUp', () => {
	it('skips the animation for data-saver and reduced-motion users', () => {
		expect(shouldCountUp({ dataSaver: true })).toBe(false);
		expect(shouldCountUp({ reduceMotion: true })).toBe(false);
		expect(shouldCountUp({ dataSaver: true, reduceMotion: true })).toBe(false);
	});

	it('animates by default', () => {
		expect(shouldCountUp()).toBe(true);
		expect(shouldCountUp({})).toBe(true);
	});
});
