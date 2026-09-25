import { describe, expect, it } from 'vitest';
import { cardFilename, shareCardText } from './cardKit.js';

describe('shareCardText', () => {
	it('appends the url on its own line', () => {
		expect(shareCardText('I am on a 4-day streak', 'https://selftest.in')).toBe(
			'I am on a 4-day streak\nhttps://selftest.in'
		);
	});

	it('leaves a caption that already contains the url unchanged', () => {
		expect(shareCardText('See https://selftest.in now', 'https://selftest.in')).toBe(
			'See https://selftest.in now'
		);
	});

	it('returns the url alone for an empty caption', () => {
		expect(shareCardText('', 'https://selftest.in')).toBe('https://selftest.in');
	});

	it('returns the caption alone for an empty url', () => {
		expect(shareCardText('  hello  ', '')).toBe('hello');
	});

	it('trims both parts', () => {
		expect(shareCardText('  hi  ', '  https://selftest.in  ')).toBe('hi\nhttps://selftest.in');
	});
});

describe('cardFilename', () => {
	it('maps the known kinds', () => {
		expect(cardFilename('streak')).toBe('selftest-streak.png');
		expect(cardFilename('test')).toBe('selftest-test.png');
		expect(cardFilename('score')).toBe('selftest-score.png');
	});

	it('falls back for unknown kinds', () => {
		expect(cardFilename('nope')).toBe('selftest-card.png');
		expect(cardFilename()).toBe('selftest-card.png');
	});
});
