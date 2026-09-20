import { describe, expect, it } from 'vitest';
import { buildChallengeUrl, compareScores, parseChallengeParams } from './challenge.js';

describe('parseChallengeParams', () => {
	it('parses a valid challenge query', () => {
		expect(parseChallengeParams('?id=5&ch=8&by=Aarav')).toEqual({ score: 8, by: 'Aarav' });
	});

	it('rejects invalid or missing params', () => {
		expect(parseChallengeParams('?id=5')).toBeNull();
		expect(parseChallengeParams('?id=5&ch=abc&by=Aarav')).toBeNull();
		expect(parseChallengeParams('?id=5&ch=-1&by=Aarav')).toBeNull();
		expect(parseChallengeParams('?id=5&ch=8')).toBeNull();
	});

	it('trims and caps the challenger name', () => {
		expect(parseChallengeParams('?ch=8&by=%20Aarav%20')?.by).toBe('Aarav');
		expect(parseChallengeParams(`?ch=8&by=${'a'.repeat(40)}`)?.by).toHaveLength(24);
	});
});

describe('compareScores', () => {
	it('decides win, lose, and draw', () => {
		expect(compareScores(8, 7)).toBe('win');
		expect(compareScores(6, 9)).toBe('lose');
		expect(compareScores(7, 7)).toBe('draw');
	});
});

describe('buildChallengeUrl', () => {
	it('appends encoded challenge params', () => {
		expect(buildChallengeUrl('/test?id=5', 8, 'Aarav & Co')).toBe(
			'/test?id=5&ch=8&by=Aarav+%26+Co'
		);
	});

	it('replaces an existing challenge', () => {
		expect(buildChallengeUrl('/test?id=5&ch=3&by=Old', 9, 'New')).toBe(
			'/test?id=5&ch=9&by=New'
		);
	});
});
