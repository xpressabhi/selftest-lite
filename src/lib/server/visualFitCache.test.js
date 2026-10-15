import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { buildVisualFitCacheKey } from './visualFitCache';

// Independently computed to pin the documented formula: drift in either
// implementation makes the key change and the test fail.
function normalize(value) {
	return String(value ?? '')
		.normalize('NFC')
		.trim()
		.replace(/\s+/g, ' ');
}

function independentlyComputedKey({ topic, question, answer, language }) {
	return createHash('sha256')
		.update(
			JSON.stringify([
				'vf-v1',
				normalize(language).toLowerCase() || 'english',
				normalize(topic),
				normalize(question ?? ''),
				normalize(answer ?? ''),
			])
		)
		.digest('hex');
}

describe('buildVisualFitCacheKey', () => {
	it('matches an independently computed sha256 of the literal tuple', () => {
		const input = {
			topic: 'Newton third law',
			question: 'Why?',
			answer: 'Because',
			language: 'english',
		};
		expect(buildVisualFitCacheKey(input)).toBe(independentlyComputedKey(input));
	});

	it('collapses whitespace before hashing', () => {
		expect(buildVisualFitCacheKey({ topic: 'Newton   third\nlaw' })).toBe(
			buildVisualFitCacheKey({ topic: 'Newton third law' })
		);
	});

	it('is NFC-insensitive', () => {
		expect(buildVisualFitCacheKey({ topic: 'e\u0301quation' })).toBe(
			buildVisualFitCacheKey({ topic: 'équation' })
		);
	});

	it('preserves case because symbols are case-sensitive', () => {
		expect(buildVisualFitCacheKey({ topic: 'N' })).not.toBe(
			buildVisualFitCacheKey({ topic: 'n' })
		);
	});

	it('defaults the language to english and lowercases it', () => {
		const withDefault = buildVisualFitCacheKey({ topic: 'X' });
		expect(withDefault).toBe(buildVisualFitCacheKey({ topic: 'X', language: 'english' }));
		expect(buildVisualFitCacheKey({ topic: 'X', language: 'HINDI' })).toBe(
			buildVisualFitCacheKey({ topic: 'X', language: 'hindi' })
		);
		expect(withDefault).not.toBe(buildVisualFitCacheKey({ topic: 'X', language: 'hindi' }));
	});

	it('treats missing context as empty strings', () => {
		expect(buildVisualFitCacheKey({ topic: 'X', question: undefined, answer: null })).toBe(
			buildVisualFitCacheKey({ topic: 'X', question: '', answer: '' })
		);
	});

	it('separates context from no context', () => {
		expect(buildVisualFitCacheKey({ topic: 'X', question: 'Q' })).not.toBe(
			buildVisualFitCacheKey({ topic: 'X' })
		);
	});

	it('separates the key on topic, question, and answer', () => {
		const base = { topic: 'A', question: 'Q', answer: 'Ans' };
		expect(buildVisualFitCacheKey({ ...base, topic: 'B' })).not.toBe(
			buildVisualFitCacheKey(base)
		);
		expect(buildVisualFitCacheKey({ ...base, question: 'Q2' })).not.toBe(
			buildVisualFitCacheKey(base)
		);
		expect(buildVisualFitCacheKey({ ...base, answer: 'Ans2' })).not.toBe(
			buildVisualFitCacheKey(base)
		);
	});
});
