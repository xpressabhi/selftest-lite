import { describe, expect, it } from 'vitest';
import { fitTextToLines, truncateToWidth, wrapTextToWidth } from './cardText.js';

// One "unit" per grapheme cluster, so the tests exercise the wrapping
// algorithm rather than a font. Real callers pass ctx.measureText().
const measure = (value) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].length;

describe('wrapTextToWidth', () => {
	it('returns no lines for empty or whitespace-only text', () => {
		expect(wrapTextToWidth('', { maxWidth: 10, maxLines: 2, measure }).lines).toEqual([]);
		expect(wrapTextToWidth('   \n ', { maxWidth: 10, maxLines: 2, measure }).lines).toEqual([]);
	});

	it('keeps short text on one line without an ellipsis', () => {
		const result = wrapTextToWidth('hello world', { maxWidth: 20, maxLines: 3, measure });
		expect(result).toEqual({ lines: ['hello world'], truncated: false });
	});

	it('wraps at spaces', () => {
		const result = wrapTextToWidth('alpha beta gamma delta', {
			maxWidth: 11,
			maxLines: 3,
			measure,
		});
		expect(result.lines).toEqual(['alpha beta', 'gamma delta']);
		expect(result.truncated).toBe(false);
	});

	it('breaks a word longer than the line at grapheme boundaries', () => {
		const result = wrapTextToWidth('abcdefghij', { maxWidth: 4, maxLines: 3, measure });
		expect(result.lines).toEqual(['abcd', 'efgh', 'ij']);
		expect(result.truncated).toBe(false);
	});

	it('clamps to maxLines and adds an ellipsis when text remains', () => {
		const result = wrapTextToWidth('one two three four five six', {
			maxWidth: 9,
			maxLines: 2,
			measure,
		});
		expect(result.lines).toHaveLength(2);
		expect(result.lines[1].endsWith('…')).toBe(true);
		expect(result.truncated).toBe(true);
		expect(result.lines.join(' ').length).toBeLessThanOrEqual(18);
	});

	it('never splits an emoji or a joined cluster', () => {
		const family = '👨‍👩‍👧‍👦';
		const result = wrapTextToWidth(`${family}${family}${family}`, {
			maxWidth: 1,
			maxLines: 3,
			measure,
		});
		for (const line of result.lines) {
			expect(line.isWellFormed()).toBe(true);
		}
		expect(result.lines[0]).toBe(family);
	});

	it('does not add an ellipsis when the text fits exactly at maxLines', () => {
		const result = wrapTextToWidth('one two', { maxWidth: 7, maxLines: 1, measure });
		expect(result).toEqual({ lines: ['one two'], truncated: false });
	});

	it('returns no lines for a non-positive width or line budget', () => {
		expect(wrapTextToWidth('text', { maxWidth: 0, maxLines: 2, measure }).lines).toEqual([]);
		expect(wrapTextToWidth('text', { maxWidth: 10, maxLines: 0, measure }).lines).toEqual([]);
	});
});

describe('truncateToWidth', () => {
	it('returns one line that fits the width', () => {
		const value = truncateToWidth('a very long single line of text', { maxWidth: 10, measure });
		expect(measure(value)).toBeLessThanOrEqual(10);
		expect(value.endsWith('…')).toBe(true);
		expect(value.isWellFormed()).toBe(true);
	});

	it('returns the text unchanged when it fits', () => {
		expect(truncateToWidth('short', { maxWidth: 10, measure })).toBe('short');
	});
});

describe('fitTextToLines', () => {
	it('picks the largest font size that fits', () => {
		const sizes = [3, 2, 1];
		const result = fitTextToLines('ab cd', sizes, {
			maxWidth: 10,
			maxLines: 2,
			measureForSize: (size) => (value) => measure(value) * size,
		});
		expect(result.size).toBe(3);
		expect(result.truncated).toBe(false);
	});

	it('falls back to the smallest size with an ellipsis when nothing fits', () => {
		const result = fitTextToLines('alpha beta gamma delta epsilon', [3, 2, 1], {
			maxWidth: 6,
			maxLines: 1,
			measureForSize: (size) => (value) => measure(value) * size,
		});
		expect(result.size).toBe(1);
		expect(result.truncated).toBe(true);
		expect(result.lines).toHaveLength(1);
	});
});
