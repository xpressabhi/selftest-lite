import { describe, expect, it } from 'vitest';
import { buildExplanationCacheKey } from './explanationCache';

const base = {
	question: 'What is the SI unit of force?',
	answer: 'Newton',
	language: 'english',
};

describe('buildExplanationCacheKey', () => {
	it('is deterministic for identical input', () => {
		expect(buildExplanationCacheKey(base)).toBe(buildExplanationCacheKey({ ...base }));
	});

	it('collapses surrounding and repeated whitespace', () => {
		const noisy = {
			question: '  What is the SI unit   of force? ',
			answer: '\tNewton\n',
			language: 'english',
		};
		expect(buildExplanationCacheKey(noisy)).toBe(buildExplanationCacheKey(base));
	});

	it('treats canonically equivalent unicode as one key', () => {
		const composed = { ...base, question: 'Explain the value of café.' };
		const decomposed = { ...base, question: 'Explain the value of cafe\u0301.' };
		expect(buildExplanationCacheKey(composed)).toBe(buildExplanationCacheKey(decomposed));
	});

	it('keeps case significant (symbols and variables are case-sensitive)', () => {
		expect(buildExplanationCacheKey({ ...base, answer: 'newton' })).not.toBe(
			buildExplanationCacheKey(base)
		);
	});

	it('separates questions, answers and languages', () => {
		const key = buildExplanationCacheKey(base);
		expect(buildExplanationCacheKey({ ...base, question: 'Another question?' })).not.toBe(key);
		expect(buildExplanationCacheKey({ ...base, answer: 'Joule' })).not.toBe(key);
		expect(buildExplanationCacheKey({ ...base, language: 'hindi' })).not.toBe(key);
	});

	it('defaults missing or blank languages to english', () => {
		const english = buildExplanationCacheKey(base);
		expect(buildExplanationCacheKey({ ...base, language: undefined })).toBe(english);
		expect(buildExplanationCacheKey({ ...base, language: '   ' })).toBe(english);
	});

	it('normalizes language case and padding', () => {
		expect(buildExplanationCacheKey({ ...base, language: ' ENGLISH ' })).toBe(
			buildExplanationCacheKey(base)
		);
	});

	it('cannot be confused by field boundaries', () => {
		const first = buildExplanationCacheKey({ question: 'a\nb', answer: 'c', language: 'english' });
		const second = buildExplanationCacheKey({ question: 'a', answer: 'b\nc', language: 'english' });
		expect(first).not.toBe(second);
	});

	it('returns a sha256 hex digest', () => {
		expect(buildExplanationCacheKey(base)).toMatch(/^[a-f0-9]{64}$/);
	});
});
