import { describe, expect, it } from 'vitest';
import { SLUG_MAX_BASE_LENGTH, buildExplainerSlug, slugifyExplainerTitle } from './explainerSlug';

describe('slugifyExplainerTitle', () => {
	it('lowercases and joins words with single hyphens', () => {
		expect(slugifyExplainerTitle("Ohm's Law: Finding  Resistance!")).toBe(
			'ohm-s-law-finding-resistance'
		);
	});

	it('strips latin diacritics', () => {
		expect(slugifyExplainerTitle('Café résumé')).toBe('cafe-resume');
	});

	it('caps the base length and never ends with a hyphen', () => {
		const long = 'word '.repeat(40);
		const slug = slugifyExplainerTitle(long);
		expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_BASE_LENGTH);
		expect(slug.endsWith('-')).toBe(false);
	});

	it('returns an empty string for scripts it cannot transliterate', () => {
		expect(slugifyExplainerTitle('प्रकाश संश्लेषण')).toBe('');
	});
});

describe('buildExplainerSlug', () => {
	it('is deterministic for the same artifact', () => {
		const first = buildExplainerSlug({ title: 'Ohm Law', cacheKey: 'abc' });
		const second = buildExplainerSlug({ title: 'Ohm Law', cacheKey: 'abc' });
		expect(first).toBe(second);
	});

	it('has the documented shape: slug base plus an eight-hex suffix', () => {
		expect(buildExplainerSlug({ title: 'Ohm Law', cacheKey: 'abc' })).toMatch(
			/^[a-z0-9-]+-[0-9a-f]{8}$/
		);
	});

	it('separates different artifacts with the same title', () => {
		expect(buildExplainerSlug({ title: 'Ohm Law', cacheKey: 'one' })).not.toBe(
			buildExplainerSlug({ title: 'Ohm Law', cacheKey: 'two' })
		);
	});

	it('falls back to a generic base when the title has no ascii', () => {
		expect(buildExplainerSlug({ title: 'प्रकाश संश्लेषण', cacheKey: 'abc' })).toMatch(
			/^explainer-[0-9a-f]{8}$/
		);
	});

	it('handles missing titles', () => {
		expect(buildExplainerSlug({ cacheKey: 'abc' })).toMatch(/^explainer-[0-9a-f]{8}$/);
	});
});
