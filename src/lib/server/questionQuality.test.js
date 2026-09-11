import { describe, expect, it } from 'vitest';
import {
	HINDI_SCRIPT_RATIO_MIN,
	LENGTH_RATIO_LIMIT,
	NEAR_DUPLICATE_THRESHOLD,
	improveQuestion,
	inspectQuestion,
	inspectQuestionBatch,
	normalizeQuestionText,
	shuffleOptions,
	trigramSimilarity,
} from './questionQuality';

function baseQuestion(overrides = {}) {
	return {
		question: 'What is the capital of France?',
		options: ['Paris', 'Rome', 'Madrid', 'Berlin'],
		answer: 'Paris',
		...overrides,
	};
}

describe('shuffleOptions', () => {
	it('keeps the same set of options and the answer', () => {
		const shuffled = shuffleOptions(baseQuestion(), () => 0.5);
		expect([...shuffled.options].sort()).toEqual(
			[...baseQuestion().options].sort()
		);
		expect(shuffled.answer).toBe('Paris');
	});

	it('can move the answer off the first position', () => {
		const shuffled = shuffleOptions(baseQuestion(), () => 0);
		expect(shuffled.options.indexOf('Paris')).toBe(3);
	});
});

describe('inspectQuestion', () => {
	it('accepts a clean question', () => {
		expect(inspectQuestion(baseQuestion())).toEqual([]);
	});

	it('flags duplicate and empty options', () => {
		expect(inspectQuestion(baseQuestion({ options: ['Paris', 'Paris', 'Rome', 'Berlin'] }))).toContain(
			'duplicate-options'
		);
		expect(inspectQuestion(baseQuestion({ options: ['Paris', '', 'Rome', 'Berlin'] }))).toContain(
			'empty-option'
		);
	});

	it('flags an answer that is not one of the options', () => {
		expect(inspectQuestion(baseQuestion({ answer: 'Lyon' }))).toContain('answer-not-in-options');
	});

	it('flags lazy options', () => {
		expect(inspectQuestion(baseQuestion({ options: ['Paris', 'All of the above', 'Madrid', 'Berlin'] })));
	});

	it('flags an answer that is uniquely much longer than every other option', () => {
		const tell = inspectQuestion({
			question: 'Pick one',
			options: ['x'.repeat(Math.ceil(LENGTH_RATIO_LIMIT * 10) + 5), 'short', 'tiny', 'small'],
			answer: 'x'.repeat(Math.ceil(LENGTH_RATIO_LIMIT * 10) + 5),
		});
		expect(tell).toContain('longest-answer-tell');
	});

	it('flags unbalanced LaTeX', () => {
		expect(inspectQuestion(baseQuestion({ question: 'Solve $x^2' }))).toContain('latex-unbalanced');
		expect(
			inspectQuestion(baseQuestion({ question: 'Solve $x^2$ where $x>0$' }))
		).not.toContain('latex-unbalanced');
	});

	it('flags Hindi language drift', () => {
		const latinOnly = inspectQuestion(
			{ question: 'What is photosynthesis?', options: ['A', 'B'], answer: 'A' },
			{ language: 'hindi' }
		);
		expect(latinOnly).toContain('language-drift');
		const hindi = inspectQuestion(
			{
				question: 'प्रकाश संश्लेषण क्या है?',
				options: ['विकल्प क', 'विकल्प ख'],
				answer: 'विकल्प क',
			},
			{ language: 'hindi' }
		);
		expect(hindi).not.toContain('language-drift');
	});

	it('flags near-duplicate questions', () => {
		const duplicate = inspectQuestion(baseQuestion(), {
			previousQuestionTexts: ['What is the capital of France?'],
		});
		expect(duplicate).toContain('near-duplicate');
	});
});

describe('trigramSimilarity', () => {
	it('scores identical text 1 and unrelated text low', () => {
		expect(trigramSimilarity('What is the capital of France?', 'What is the capital of France?')).toBe(1);
		expect(trigramSimilarity('What is the capital of France?', 'Explain photosynthesis')).toBeLessThan(
			NEAR_DUPLICATE_THRESHOLD
		);
	});
});

describe('normalizeQuestionText', () => {
	it('strips markdown and punctuation', () => {
		expect(normalizeQuestionText('**What** is `2 + 2`?')).toBe('what is 2 2');
	});
});

describe('improveQuestion', () => {
	it('shuffles and reports remaining issues after the shuffle', () => {
		const result = improveQuestion(
			baseQuestion({ options: ['Paris', 'Paris', 'Rome', 'Berlin'] }),
			{ random: () => 0.5 }
		);
		expect(result.issues).toContain('duplicate-options');
		expect(result.question.options).toHaveLength(4);
	});
});

describe('inspectQuestionBatch', () => {
	it('flags duplicates across questions in the same batch', () => {
		const issues = inspectQuestionBatch([baseQuestion(), baseQuestion({ answer: 'Paris' })]);
		expect(issues.some((entry) => entry.issue === 'near-duplicate')).toBe(true);
	});
});

describe('script ratio constant', () => {
	it('stays in a sane range', () => {
		expect(HINDI_SCRIPT_RATIO_MIN).toBeGreaterThan(0);
		expect(HINDI_SCRIPT_RATIO_MIN).toBeLessThan(1);
	});
});
