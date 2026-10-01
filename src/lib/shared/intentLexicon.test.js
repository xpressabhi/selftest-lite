import { describe, expect, it } from 'vitest';
import { detectTestType } from './intentLexicon.js';

describe('detectTestType statement-based phrasing', () => {
	it('recognizes the true/false wording in both languages', () => {
		for (const intent of [
			'true false questions on national symbols',
			'binary questions on national symbols',
			'statement based questions on polity',
			'राष्ट्रीय प्रतीक पर सही/गलत प्रश्न बनाओ',
			'राष्ट्रीय प्रतीक पर कथनों पर विचार कीजिए वाले प्रश्न',
			'कथन आधारित प्रश्न चाहिए',
		]) {
			expect(detectTestType(intent)).toBe('true-false');
		}
	});

	it('does not claim unrelated "statement" wording', () => {
		expect(detectTestType('statement of purpose for my exam')).not.toBe('true-false');
	});
});
