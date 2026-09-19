import { describe, expect, it } from 'vitest';
import {
	clampInputText,
	isNearInputLimit,
	MAX_INTENT_CHARS,
	MAX_SEARCH_CHARS,
	sanitizeInputText,
} from './inputLimits.js';

describe('sanitizeInputText', () => {
	it('clamps to the requested length', () => {
		const long = 'a'.repeat(MAX_INTENT_CHARS + 500);
		expect(sanitizeInputText(long, MAX_INTENT_CHARS)).toHaveLength(MAX_INTENT_CHARS);
	});

	it('collapses whitespace runs and leading spaces', () => {
		expect(sanitizeInputText('  ten    questions\n\non   optics ', 100)).toBe(
			'ten questions on optics '
		);
	});

	it('drops control, zero-width and bidi-override characters', () => {
		const hostile = 'optics\u0000\u200b\u202e quiz\u009f';
		expect(sanitizeInputText(hostile, 100)).toBe('optics quiz');
	});

	it('normalizes non-breaking spaces', () => {
		expect(sanitizeInputText('class\u00a010', 100)).toBe('class 10');
	});

	it('handles non-string input', () => {
		expect(sanitizeInputText(undefined, 100)).toBe('');
		expect(sanitizeInputText(null, 100)).toBe('');
	});

	it('leaves values below the limit untouched (except cleaning)', () => {
		expect(sanitizeInputText('photosynthesis', MAX_SEARCH_CHARS)).toBe('photosynthesis');
	});
});

describe('clampInputText', () => {
	it('preserves inner whitespace but clamps length', () => {
		expect(clampInputText('a b  c', 4)).toBe('a b ');
	});

	it('strips invisible characters', () => {
		expect(clampInputText('pass\u200bword', 128)).toBe('password');
	});
});

describe('isNearInputLimit', () => {
	it('is false below the ratio and true at or above it', () => {
		expect(isNearInputLimit('short', 100)).toBe(false);
		expect(isNearInputLimit('x'.repeat(80), 100)).toBe(true);
		expect(isNearInputLimit('x'.repeat(101), 100)).toBe(true);
	});
});
