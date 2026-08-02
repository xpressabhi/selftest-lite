import { describe, expect, it } from 'vitest';
import {
	InvalidRequestBodyError,
	RequestBodyTooLargeError,
	parseRequestBody,
	repairGeneratedPaper,
	sanitizePreviousTestIds,
	validateGenerateRequest,
	validateGeneratedPaper,
	validateTestRecordPayload,
} from './quizValidation';

function jsonRequest(body) {
	return { text: () => Promise.resolve(body) };
}

describe('parseRequestBody', () => {
	it('parses a valid JSON body', async () => {
		await expect(parseRequestBody(jsonRequest('{"a":1}'))).resolves.toEqual({
			a: 1,
		});
	});

	it('rejects invalid JSON', async () => {
		await expect(parseRequestBody(jsonRequest('{not json'))).rejects.toBeInstanceOf(
			InvalidRequestBodyError,
		);
	});

	it('rejects bodies over 2MB', async () => {
		const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
		await expect(parseRequestBody(jsonRequest(oversized))).rejects.toBeInstanceOf(
			RequestBodyTooLargeError,
		);
	});
});

describe('validateGenerateRequest', () => {
	const base = {
		topic: 'Physics',
		language: 'english',
		testType: 'multiple-choice',
		numQuestions: 10,
		difficulty: 'intermediate',
	};

	it('accepts a valid request', () => {
		expect(validateGenerateRequest(base)).toBeNull();
	});

	it('accepts a full-exam request with exam name and objectiveOnly', () => {
		expect(
			validateGenerateRequest({
				...base,
				testMode: 'full-exam',
				examName: 'JEE Main',
				objectiveOnly: true,
			}),
		).toBeNull();
	});

	it('requires topic context outside full-exam mode', () => {
		const error = validateGenerateRequest({ ...base, topic: undefined });
		expect(error).toEqual({
			code: 'MISSING_TOPIC_CONTEXT',
			message: expect.any(String),
		});
	});

	it('requires an exam name in full-exam mode', () => {
		const error = validateGenerateRequest({
			...base,
			testMode: 'full-exam',
			objectiveOnly: true,
		});
		expect(error.code).toBe('EXAM_REQUIRED');
	});

	it('requires objectiveOnly in full-exam mode', () => {
		const error = validateGenerateRequest({
			...base,
			testMode: 'full-exam',
			examName: 'JEE Main',
		});
		expect(error.code).toBe('OBJECTIVE_ONLY_REQUIRED');
	});

	it('rejects an invalid language', () => {
		const error = validateGenerateRequest({ ...base, language: 'klingon' });
		expect(error.code).toBe('INVALID_LANGUAGE');
	});

	it('rejects an invalid difficulty', () => {
		const error = validateGenerateRequest({ ...base, difficulty: 'impossible' });
		expect(error.code).toBe('INVALID_DIFFICULTY');
	});

	it('rejects out-of-range question counts', () => {
		expect(validateGenerateRequest({ ...base, numQuestions: 0 }).code).toBe(
			'INVALID_QUESTION_COUNT',
		);
		expect(validateGenerateRequest({ ...base, numQuestions: 201 }).code).toBe(
			'INVALID_QUESTION_COUNT',
		);
	});

	it('rejects an invalid test type', () => {
		const error = validateGenerateRequest({ ...base, testType: 'essay' });
		expect(error.code).toBe('INVALID_TEST_TYPE');
	});

	it('rejects too many selected topics', () => {
		const error = validateGenerateRequest({
			...base,
			selectedTopics: Array.from({ length: 21 }, (_, index) => `topic-${index}`),
		});
		expect(error.code).toBe('TOO_MANY_SELECTED_TOPICS');
	});
});

describe('sanitizePreviousTestIds', () => {
	it('keeps only positive integers and caps the count', () => {
		const ids = [1, '2', -3, 0, 4.5, 'x', 7, 8, 9, 10, 11, 12, 13, 14];
		const sanitized = sanitizePreviousTestIds(ids);
		expect(sanitized).toEqual([1, 2, 7, 8, 9, 10, 11, 12, 13, 14]);
		expect(sanitized).toHaveLength(10);
	});

	it('returns an empty array for non-arrays', () => {
		expect(sanitizePreviousTestIds(null)).toEqual([]);
		expect(sanitizePreviousTestIds('nope')).toEqual([]);
	});
});

describe('repairGeneratedPaper', () => {
	it('trims fields and resolves answer labels to option text', () => {
		const repaired = repairGeneratedPaper({
			questionPaper: {
				topic: '  Physics  ',
				questions: [
					{
						question: '  What is F = ma?  ',
						options: ['  Force  ', '  Velocity  ', '  Mass  ', '  Time  '],
						answer: '  A  ',
					},
				],
			},
			fallbackTopic: 'Fallback',
		});
		expect(repaired.topic).toBe('Physics');
		expect(repaired.questions[0].answer).toBe('Force');
	});

	it('keeps a full-text answer that matches an option', () => {
		const repaired = repairGeneratedPaper({
			questionPaper: {
				topic: 'Physics',
				questions: [
					{
						question: 'Q?',
						options: ['A', 'B', 'C', 'D'],
						answer: 'B',
					},
				],
			},
		});
		expect(repaired.questions[0].answer).toBe('B');
	});

	it('uses the fallback topic when topic is empty', () => {
		const repaired = repairGeneratedPaper({
			questionPaper: { topic: '', questions: [] },
			fallbackTopic: '  Fallback Topic  ',
		});
		expect(repaired.topic).toBe('Fallback Topic');
	});
});

describe('validateGeneratedPaper', () => {
	const validPaper = {
		topic: 'Physics',
		questions: [
			{
				question: 'What is 2 + 2?',
				options: ['3', '4', '5', '6'],
				answer: '4',
			},
		],
	};

	it('accepts a valid paper', () => {
		expect(() =>
			validateGeneratedPaper({
				questionPaper: validPaper,
				testType: 'multiple-choice',
				numQuestions: 1,
			}),
		).not.toThrow();
	});

	it('rejects a paper missing topic or questions', () => {
		expect(() =>
			validateGeneratedPaper({ questionPaper: {}, testType: 'multiple-choice', numQuestions: 1 }),
		).toThrow('Invalid response structure');
	});

	it('rejects a question whose answer is not one of its options', () => {
		const paper = {
			topic: 'Physics',
			questions: [
				{
					question: 'Q?',
					options: ['A', 'B', 'C', 'D'],
					answer: 'Z',
				},
			],
		};
		expect(() =>
			validateGeneratedPaper({ questionPaper: paper, testType: 'multiple-choice', numQuestions: 1 }),
		).toThrow(/answer must match one of the options/);
	});

	it('rejects multiple-choice questions without exactly 4 options', () => {
		const paper = {
			topic: 'Physics',
			questions: [{ question: 'Q?', options: ['A', 'B'], answer: 'A' }],
		};
		expect(() =>
			validateGeneratedPaper({ questionPaper: paper, testType: 'multiple-choice', numQuestions: 1 }),
		).toThrow(/exactly 4 options/);
	});

	it('rejects duplicate questions', () => {
		const paper = {
			topic: 'Physics',
			questions: [
				{ question: 'Same?', options: ['A', 'B', 'C', 'D'], answer: 'A' },
				{ question: 'Same?', options: ['W', 'X', 'Y', 'Z'], answer: 'W' },
			],
		};
		expect(() =>
			validateGeneratedPaper({ questionPaper: paper, testType: 'multiple-choice', numQuestions: 2 }),
		).toThrow(/duplicates another question/);
	});

	it('rejects invalid LaTeX in question text', () => {
		const paper = {
			topic: 'Physics',
			questions: [
				{
					question: 'What is $\\frac{1}{2}$ and also $\\notacommand$?',
					options: ['A', 'B', 'C', 'D'],
					answer: 'A',
				},
			],
		};
		expect(() =>
			validateGeneratedPaper({ questionPaper: paper, testType: 'multiple-choice', numQuestions: 1 }),
		).toThrow(/invalid LaTeX/);
	});
});

describe('validateTestRecordPayload', () => {
	it('accepts a minimal valid payload', () => {
		expect(
			validateTestRecordPayload({
				topic: 'Physics',
				questions: [{ question: 'Q?', options: ['A', 'B'], answer: 'A' }],
			}),
		).toBeNull();
	});

	it('rejects non-object payloads', () => {
		expect(validateTestRecordPayload(null)).not.toBeNull();
		expect(validateTestRecordPayload([])).not.toBeNull();
	});

	it('rejects payloads without questions', () => {
		expect(validateTestRecordPayload({ topic: 'Physics' })).not.toBeNull();
	});

	it('rejects overly long question text', () => {
		const error = validateTestRecordPayload({
			topic: 'Physics',
			questions: [{ question: 'x'.repeat(2001), options: ['A', 'B'], answer: 'A' }],
		});
		expect(error).not.toBeNull();
	});
});
