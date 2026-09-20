import { describe, expect, it } from 'vitest';
import { stripCardText, wrapCardText } from './scoreCard.js';

describe('stripCardText', () => {
	it('removes markdown and collapses whitespace', () => {
		expect(stripCardText('**Photosynthesis** `x` _a_ [b](c)')).toBe('Photosynthesis x a b');
		expect(stripCardText('  a   b\nc ')).toBe('a b c');
		expect(stripCardText(null)).toBe('');
	});
});

describe('wrapCardText', () => {
	it('wraps words into capped lines with ellipsis', () => {
		const lines = wrapCardText('one two three four five six', 10, 2);
		expect(lines).toHaveLength(2);
		expect(lines[1].endsWith('…')).toBe(true);
	});

	it('keeps short text on one line', () => {
		expect(wrapCardText('hello world', 20, 3)).toEqual(['hello world']);
	});

	it('handles empty input', () => {
		expect(wrapCardText('', 20, 3)).toEqual([]);
	});
});
