import { describe, expect, it } from 'vitest';
import { AR_CODE_ORDER, AR_OPTIONS, buildAssertionReasoningQuestion } from './assertionReasoning';

// Failure modes first (spec: docs/superpowers/specs/2026-09-24-question-formats-design.md).
// The canonical option sets are paper content: the server owns them so wording
// can never drift between questions.

function baseRaw(overrides = {}) {
	return {
		assertion: 'An iron nail dipped in copper sulphate solution turns brown.',
		reason: 'Iron is more reactive than copper and displaces it from the solution.',
		rationale: 'Iron displaces copper, so the nail gets a copper coating.',
		answer: 'a',
		...overrides,
	};
}

describe('canonical option sets', () => {
	it('offers four ordered, distinct statements in both languages', () => {
		for (const language of ['english', 'hindi']) {
			const options = AR_OPTIONS[language];
			expect(options).toHaveLength(4);
			expect(new Set(options).size).toBe(4);
			for (const option of options) {
				expect(typeof option).toBe('string');
				expect(option.trim().length).toBeGreaterThan(0);
			}
		}
	});

	it('pins the conventional order (both-true-explains first, both-true-explains-not second)', () => {
		expect(AR_OPTIONS.english[0]).toBe('Both A and R are true, and R is the correct explanation of A');
		expect(AR_OPTIONS.english[1]).toBe('Both A and R are true, but R is NOT the correct explanation of A');
		expect(AR_OPTIONS.english[2]).toBe('A is true, but R is false');
		expect(AR_OPTIONS.english[3]).toBe('A is false, but R is true');
		expect(AR_CODE_ORDER).toEqual(['a', 'b', 'c', 'd']);
	});
});

describe('buildAssertionReasoningQuestion input guards', () => {
	it('rejects invalid or missing answer codes', () => {
		for (const answer of ['e', '', null, undefined, 2, 'aa']) {
			const result = buildAssertionReasoningQuestion(baseRaw({ answer }));
			expect(result.ok).toBe(false);
			expect(result.issues).toContain('ar-answer-invalid');
		}
	});

	it('rejects blank, identical, or over-length statements', () => {
		const blank = buildAssertionReasoningQuestion(baseRaw({ assertion: '   ' }));
		expect(blank.ok).toBe(false);
		expect(blank.issues).toContain('ar-statements-invalid');

		const identical = buildAssertionReasoningQuestion(
			baseRaw({ reason: 'An iron nail dipped in copper sulphate solution turns brown.' })
		);
		expect(identical.ok).toBe(false);
		expect(identical.issues).toContain('ar-statements-invalid');

		const long = buildAssertionReasoningQuestion(baseRaw({ reason: 'R'.repeat(2001) }));
		expect(long.ok).toBe(false);
		expect(long.issues).toContain('ar-statements-invalid');
	});
});

describe('buildAssertionReasoningQuestion output contract', () => {
	it('maps each code to the canonical statement', () => {
		for (const [index, code] of AR_CODE_ORDER.entries()) {
			const result = buildAssertionReasoningQuestion(baseRaw({ answer: code }), {
				language: 'english',
			});
			expect(result.ok).toBe(true);
			expect(result.question.answer).toBe(AR_OPTIONS.english[index]);
			expect(result.question.options).toEqual(AR_OPTIONS.english);
		}
	});

	it('accepts uppercase codes', () => {
		const result = buildAssertionReasoningQuestion(baseRaw({ answer: 'C' }));
		expect(result.ok).toBe(true);
		expect(result.question.answer).toBe(AR_OPTIONS.english[2]);
	});

	it('never shuffles the canonical order, whatever the key is', () => {
		const result = buildAssertionReasoningQuestion(baseRaw({ answer: 'd' }));
		expect(result.question.options[0]).toBe(AR_OPTIONS.english[0]);
		expect(result.question.options[3]).toBe(AR_OPTIONS.english[3]);
	});

	it('injects the Hindi statement set for Hindi papers', () => {
		const result = buildAssertionReasoningQuestion(baseRaw({ answer: 'b' }), { language: 'hindi' });
		expect(result.question.options).toEqual(AR_OPTIONS.hindi);
		expect(result.question.answer).toBe(AR_OPTIONS.hindi[1]);
	});

	it('falls back to English for an unknown language', () => {
		const result = buildAssertionReasoningQuestion(baseRaw(), { language: 'klingon' });
		expect(result.question.options).toEqual(AR_OPTIONS.english);
	});

	it('marks the format and keeps an empty stem', () => {
		const result = buildAssertionReasoningQuestion(baseRaw());
		expect(result.question.format).toBe('assertion-reasoning');
		expect(result.question.question).toBe('');
		expect(result.question.assertion).toBe(baseRaw().assertion);
		expect(result.question.reason).toBe(baseRaw().reason);
	});
});
