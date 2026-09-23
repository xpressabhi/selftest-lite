import { describe, expect, it } from 'vitest';
import {
	DENSE_MAX_HEIGHT,
	MICRO_MAX_HEIGHT,
	observeViewportTier,
	readVisibleHeight,
	tierForHeight,
} from './viewportTier.js';

describe('tierForHeight', () => {
	it('returns full for a roomy viewport (keyboard closed)', () => {
		expect(tierForHeight(844)).toBe('full');
		expect(tierForHeight(DENSE_MAX_HEIGHT)).toBe('full');
	});

	it('returns dense for a keyboard-halved viewport', () => {
		expect(tierForHeight(420)).toBe('dense');
		expect(tierForHeight(MICRO_MAX_HEIGHT)).toBe('dense');
	});

	it('returns micro for a short viewport (landscape, small SE)', () => {
		expect(tierForHeight(300)).toBe('micro');
		expect(tierForHeight(MICRO_MAX_HEIGHT - 1)).toBe('micro');
	});

	it('falls back to full for missing or bogus heights', () => {
		expect(tierForHeight(0)).toBe('full');
		expect(tierForHeight(-10)).toBe('full');
		expect(tierForHeight(Number.NaN)).toBe('full');
		expect(tierForHeight(undefined)).toBe('full');
	});
});

describe('browser guards', () => {
	it('readVisibleHeight returns 0 without a window', () => {
		expect(typeof window).toBe('undefined');
		expect(readVisibleHeight()).toBe(0);
	});

	it('observeViewportTier is a safe no-op without a window', () => {
		const cleanup = observeViewportTier(() => {
			throw new Error('must not be called during SSR');
		});
		expect(typeof cleanup).toBe('function');
		expect(() => cleanup()).not.toThrow();
	});
});
