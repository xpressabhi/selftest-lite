import { describe, expect, it } from 'vitest';
import { inspectGeneratedPaper, validateGenerateRequest } from './quizValidation';
import {
	assertionReasoningQuestionSchema,
	explanationSchema,
	matchingQuestionSchema,
	paperSchema,
	paperSchemaFor,
	questionSchema,
} from './quizSchema';

// Shape vs content: these schemas only describe the JSON the model must
// return (zod strips unknown keys, it never rejects them). Content rules —
// option counts, difficulty, language, duplicate checks — live in
// quizValidation.js and run after parsing. The boundary tests at the bottom
// pin that split so nobody "fixes" a validation bug in the schema by accident.

const mcQuestion = {
	question: 'What is the SI unit of force?',
	rationale: 'Newton is the SI unit; Joule is energy and Watt is power.',
	options: ['Newton', 'Joule', 'Watt', 'Pascal'],
	answer: 'Newton',
};
const mcPaper = { topic: 'Class 11 Physics: laws of motion', questions: [mcQuestion] };

const matchingQuestion = {
	question: 'Match the vitamin in Column I with the deficiency disease in Column II.',
	rationale: 'Vitamin A prevents night blindness; B1 beriberi; C scurvy; D rickets.',
	columnA: ['Vitamin A', 'Vitamin B1', 'Vitamin C', 'Vitamin D'],
	columnB: ['Night blindness', 'Beriberi', 'Scurvy', 'Rickets'],
};

const arQuestion = {
	assertion: 'An iron nail dipped in copper sulphate solution turns brown.',
	reason: 'Iron is more reactive than copper and displaces it from the solution.',
	rationale: 'Iron displaces copper, so the nail gets a copper coating.',
	answer: 'a',
};

function issuePaths(result) {
	return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('paperSchemaFor', () => {
	it('keeps the full-question shape for every legacy test type and unknown input', () => {
		for (const testType of [
			'multiple-choice',
			'true-false',
			'mixed',
			'speed-challenge',
			'coding',
			undefined,
			null,
			'not-a-type',
		]) {
			expect(paperSchemaFor(testType)).toBe(paperSchema);
		}
	});

	it('accepts a valid minimal multiple-choice paper unchanged', () => {
		const result = paperSchemaFor('multiple-choice').safeParse(mcPaper);
		expect(result.success).toBe(true);
		expect(result.data).toEqual(mcPaper);
	});

	it('accepts a valid matching paper and strips the full-question fields', () => {
		const result = paperSchemaFor('matching').safeParse({
			topic: 'Vitamins',
			questions: [{ ...matchingQuestion, options: ['1-A', '2-B', '3-C', '4-D'], answer: '1-A' }],
		});
		expect(result.success).toBe(true);
		expect(result.data.questions[0]).toEqual(matchingQuestion);
	});

	it('accepts every assertion-reasoning answer code and rejects the rest', () => {
		for (const answer of ['a', 'b', 'c', 'd']) {
			const result = paperSchemaFor('assertion-reasoning').safeParse({
				topic: 'Chemistry',
				questions: [{ ...arQuestion, answer }],
			});
			expect(result.success).toBe(true);
			expect(result.data.questions[0].answer).toBe(answer);
		}
		for (const answer of ['e', 'A', '', 1, null]) {
			const result = paperSchemaFor('assertion-reasoning').safeParse({
				topic: 'Chemistry',
				questions: [{ ...arQuestion, answer }],
			});
			expect(result.success).toBe(false);
		}
	});

	it('rejects a full-question object under the matching and assertion-reasoning schemas', () => {
		const matchingPaths = issuePaths(paperSchemaFor('matching').safeParse(mcPaper));
		expect(matchingPaths).toContain('questions.0.columnA');
		expect(matchingPaths).toContain('questions.0.columnB');

		const arPaths = issuePaths(paperSchemaFor('assertion-reasoning').safeParse(mcPaper));
		expect(arPaths).toContain('questions.0.assertion');
		expect(arPaths).toContain('questions.0.reason');
	});

	it('rejects a structured-only object under the legacy schema', () => {
		const result = paperSchemaFor('true-false').safeParse({
			topic: 'Vitamins',
			questions: [matchingQuestion],
		});
		expect(result.success).toBe(false);
		expect(issuePaths(result)).toEqual(
			expect.arrayContaining(['questions.0.options', 'questions.0.answer'])
		);
	});
});

describe('shape validation', () => {
	it('rejects missing or mistyped required fields', () => {
		for (const invalid of [
			{ questions: [mcQuestion] },
			{ topic: 'Physics' },
			{ topic: 'Physics', questions: 'nope' },
			{ topic: 'Physics', questions: [{}] },
			{ topic: 'Physics', questions: [{ ...mcQuestion, rationale: undefined }] },
			{ topic: 'Physics', questions: [{ ...mcQuestion, options: 'Newton' }] },
			{ topic: 'Physics', questions: [{ ...mcQuestion, answer: 7 }] },
		]) {
			expect(paperSchema.safeParse(invalid).success).toBe(false);
		}
	});

	it('strips unknown fields instead of rejecting them', () => {
		const result = paperSchema.safeParse({
			topic: 'Physics',
			difficulty: 'impossible',
			language: 'klingon',
			extra: true,
			questions: [{ ...mcQuestion, hint: 'not part of the contract' }],
		});
		expect(result.success).toBe(true);
		expect(Object.keys(result.data).sort()).toEqual(['questions', 'topic']);
		expect(result.data.questions[0]).toEqual(mcQuestion);
	});

	it('accepts empty strings and empty question lists (count checks happen later)', () => {
		expect(paperSchema.safeParse({ topic: '', questions: [] }).success).toBe(true);
	});
});

describe('layer boundary: content rules live in quizValidation', () => {
	it('lets the schema accept option counts that inspectGeneratedPaper rejects', () => {
		const twoOptionPaper = {
			topic: 'General',
			questions: [{ ...mcQuestion, options: ['Newton', 'Joule'], answer: 'Newton' }],
		};
		const parsed = paperSchemaFor('true-false').safeParse(twoOptionPaper);
		expect(parsed.success).toBe(true);
		expect(
			inspectGeneratedPaper({
				questionPaper: parsed.data,
				testType: 'true-false',
				numQuestions: 1,
			})
		).toEqual([]);

		const mcIssues = inspectGeneratedPaper({
			questionPaper: parsed.data,
			testType: 'multiple-choice',
			numQuestions: 1,
		});
		expect(mcIssues.map((issue) => issue.issue)).toContain('option-count');
	});

	it('does not carry difficulty or language; validateGenerateRequest rejects those', () => {
		expect(
			validateGenerateRequest({
				topic: 'Physics',
				testType: 'multiple-choice',
				numQuestions: 5,
				difficulty: 'impossible',
				language: 'english',
			}).code
		).toBe('INVALID_DIFFICULTY');
		expect(
			validateGenerateRequest({
				topic: 'Physics',
				testType: 'multiple-choice',
				numQuestions: 5,
				difficulty: 'beginner',
				language: 'klingon',
			}).code
		).toBe('INVALID_LANGUAGE');
	});
});

describe('individual schemas', () => {
	it('validates one question at a time with the matching shape', () => {
		expect(questionSchema.safeParse(mcQuestion).success).toBe(true);
		expect(questionSchema.safeParse(matchingQuestion).success).toBe(false);
		expect(matchingQuestionSchema.safeParse(matchingQuestion).success).toBe(true);
		expect(matchingQuestionSchema.safeParse(mcQuestion).success).toBe(false);
		expect(assertionReasoningQuestionSchema.safeParse(arQuestion).success).toBe(true);
		expect(assertionReasoningQuestionSchema.safeParse(mcQuestion).success).toBe(false);
	});

	it('validates the explanation payload', () => {
		expect(explanationSchema.safeParse({ explanation: 'Because...' }).success).toBe(true);
		expect(explanationSchema.safeParse({}).success).toBe(false);
		expect(explanationSchema.safeParse({ explanation: 42 }).success).toBe(false);
	});
});
