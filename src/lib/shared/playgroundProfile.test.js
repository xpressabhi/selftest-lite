import { describe, expect, it } from 'vitest';
import {
	PHONE_MAX_WIDTH,
	bucketClientProfile,
	normalizePlaygroundProfile,
} from './playgroundProfile';

describe('bucketClientProfile', () => {
	it('buckets a narrow viewport as phone and stays full for capable devices', () => {
		expect(bucketClientProfile({ width: 390, deviceMemory: 8, hardwareConcurrency: 8 })).toEqual({
			viewport: 'phone',
			budget: 'full',
		});
	});

	it('buckets at the phone boundary and one pixel over', () => {
		expect(bucketClientProfile({ width: PHONE_MAX_WIDTH }).viewport).toBe('phone');
		expect(bucketClientProfile({ width: PHONE_MAX_WIDTH + 1 }).viewport).toBe('wide');
	});

	it('defaults to wide and full when signals are missing', () => {
		expect(bucketClientProfile({})).toEqual({ viewport: 'wide', budget: 'full' });
		expect(bucketClientProfile({ width: 0 })).toEqual({ viewport: 'wide', budget: 'full' });
	});

	it('downgrades the budget on save-data', () => {
		expect(bucketClientProfile({ width: 1280, saveData: true }).budget).toBe('lite');
	});

	it('downgrades the budget on slow effective connection types only', () => {
		for (const effectiveType of ['slow-2g', '2g', '3g']) {
			expect(bucketClientProfile({ width: 1280, effectiveType }).budget).toBe('lite');
		}
		expect(bucketClientProfile({ width: 1280, effectiveType: '4g' }).budget).toBe('full');
	});

	it('downgrades the budget on low device memory or few cores', () => {
		expect(bucketClientProfile({ width: 1280, deviceMemory: 2 }).budget).toBe('lite');
		expect(bucketClientProfile({ width: 1280, hardwareConcurrency: 4 }).budget).toBe('lite');
		expect(bucketClientProfile({ width: 1280, deviceMemory: 8, hardwareConcurrency: 8 }).budget).toBe(
			'full'
		);
	});

	it('downgrades the budget under reduced motion', () => {
		expect(bucketClientProfile({ width: 1280, reducedMotion: true }).budget).toBe('lite');
	});

	it('ignores non-finite signals', () => {
		expect(
			bucketClientProfile({
				width: Number.NaN,
				deviceMemory: Number.NaN,
				hardwareConcurrency: Number.NaN,
			})
		).toEqual({ viewport: 'wide', budget: 'full' });
	});
});

describe('normalizePlaygroundProfile', () => {
	it('accepts known buckets', () => {
		expect(normalizePlaygroundProfile({ viewport: 'phone', budget: 'lite' })).toEqual({
			viewport: 'phone',
			budget: 'lite',
		});
	});

	it('defaults unknown or missing values', () => {
		expect(normalizePlaygroundProfile(undefined)).toEqual({ viewport: 'wide', budget: 'full' });
		expect(normalizePlaygroundProfile({ viewport: 'watch', budget: 'ultra' })).toEqual({
			viewport: 'wide',
			budget: 'full',
		});
	});
});
