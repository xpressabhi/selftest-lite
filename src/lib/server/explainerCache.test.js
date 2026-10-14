import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { buildExplainerCacheKey } from './explainerCache';

// Independently computed to pin the documented formula: drift in either
// implementation makes the key change and the test fail.
function normalize(value) {
	return String(value ?? '')
		.normalize('NFC')
		.trim()
		.replace(/\s+/g, ' ');
}

function independentlyComputedKey({ topic, question, answer, language, viewport = 'wide', budget = 'full' }) {
	return createHash('sha256')
		.update(
			JSON.stringify([
				'pg-v2',
				'prompt-v5',
				'scaffold-v4',
				normalize(language).toLowerCase() || 'english',
				normalize(topic),
				normalize(question ?? ''),
				normalize(answer ?? ''),
				viewport,
				budget,
			])
		)
		.digest('hex');
}

describe('buildExplainerCacheKey', () => {
	it('matches an independently computed sha256 of the literal tuple', () => {
		const input = {
			topic: 'Newton third law',
			question: 'Why?',
			answer: 'Because',
			language: 'english',
		};
		expect(buildExplainerCacheKey(input)).toBe(independentlyComputedKey(input));
	});

	it('collapses whitespace before hashing', () => {
		expect(buildExplainerCacheKey({ topic: 'Newton   third\nlaw' })).toBe(
			buildExplainerCacheKey({ topic: 'Newton third law' })
		);
	});

	it('is NFC-insensitive', () => {
		expect(buildExplainerCacheKey({ topic: 'e\u0301quation' })).toBe(
			buildExplainerCacheKey({ topic: 'équation' })
		);
	});

	it('preserves case because symbols are case-sensitive', () => {
		expect(buildExplainerCacheKey({ topic: 'N' })).not.toBe(
			buildExplainerCacheKey({ topic: 'n' })
		);
	});

	it('defaults the language to english and lowercases it', () => {
		const withDefault = buildExplainerCacheKey({ topic: 'X' });
		expect(withDefault).toBe(buildExplainerCacheKey({ topic: 'X', language: 'english' }));
		expect(buildExplainerCacheKey({ topic: 'X', language: 'HINDI' })).toBe(
			buildExplainerCacheKey({ topic: 'X', language: 'hindi' })
		);
	});

	it('treats missing context as empty strings', () => {
		expect(buildExplainerCacheKey({ topic: 'X', question: undefined, answer: null })).toBe(
			buildExplainerCacheKey({ topic: 'X', question: '', answer: '' })
		);
	});

	it('separates context from no context', () => {
		expect(buildExplainerCacheKey({ topic: 'X', question: 'Q' })).not.toBe(
			buildExplainerCacheKey({ topic: 'X' })
		);
	});

	it('produces a stable key for a Hindi topic', () => {
		const hindi = buildExplainerCacheKey({ topic: 'न्यूटन का तीसरा नियम', language: 'hindi' });
		expect(hindi).toBe(buildExplainerCacheKey({ topic: 'न्यूटन का तीसरा नियम', language: 'hindi' }));
		expect(hindi).not.toBe(buildExplainerCacheKey({ topic: 'न्यूटन का तीसरा नियम' }));
	});

	it('separates device buckets and normalizes unknown ones to wide-full', () => {
		const base = { topic: 'X' };
		expect(buildExplainerCacheKey({ ...base, profile: { viewport: 'phone', budget: 'lite' } })).toBe(
			independentlyComputedKey({ topic: 'X', viewport: 'phone', budget: 'lite' })
		);
		expect(buildExplainerCacheKey({ ...base, profile: { viewport: 'phone', budget: 'lite' } })).not.toBe(
			buildExplainerCacheKey({ ...base, profile: { viewport: 'phone', budget: 'full' } })
		);
		expect(buildExplainerCacheKey({ ...base, profile: { viewport: 'watch', budget: 'ultra' } })).toBe(
			buildExplainerCacheKey(base)
		);
	});
});
