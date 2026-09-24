import { describe, expect, it } from 'vitest';
import {
	InvalidRequestBodyError,
	RequestBodyTooLargeError,
	answerMatchesOption,
	inspectGeneratedPaper,
	parseRequestBody,
	repairGeneratedPaper,
	sanitizePreviousTestIds,
	validateGenerateRequest,
	validateGeneratedPaper,
	validateTestRecordPayload,
} from './quizValidation';
import { buildMatchingQuestion } from './matchingBuilder';
import { buildAssertionReasoningQuestion } from './assertionReasoning';

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
			InvalidRequestBodyError
		);
	});

	it('rejects bodies over 2MB', async () => {
		const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
		await expect(parseRequestBody(jsonRequest(oversized))).rejects.toBeInstanceOf(
			RequestBodyTooLargeError
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
			})
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
			'INVALID_QUESTION_COUNT'
		);
		expect(validateGenerateRequest({ ...base, numQuestions: 201 }).code).toBe(
			'INVALID_QUESTION_COUNT'
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

	it('resolves a label-prefixed answer to option text', () => {
		const repaired = repairGeneratedPaper({
			questionPaper: {
				topic: 'Biology',
				questions: [
					{
						question: 'Q?',
						options: [
							'Secondary carotene',
							'Primary chlorophyll',
							'Cellular cytoplasm',
							'Vascular cellulose',
						],
						answer: 'B. Primary chlorophyll',
					},
				],
			},
		});
		expect(repaired.questions[0].answer).toBe('Primary chlorophyll');
	});
});

describe('answerMatchesOption', () => {
	const options = [
		'Secondary carotene',
		'Primary chlorophyll',
		'Cellular cytoplasm',
		'Vascular cellulose',
	];

	it('matches exact option text', () => {
		expect(answerMatchesOption(options, 'Primary chlorophyll', 'Primary chlorophyll')).toBe(
			true
		);
	});

	it('matches bare option labels', () => {
		expect(answerMatchesOption(options, 'Primary chlorophyll', 'B')).toBe(true);
		expect(answerMatchesOption(options, 'Primary chlorophyll', 'Option B')).toBe(true);
	});

	it('matches a label followed by the option text', () => {
		expect(answerMatchesOption(options, 'Primary chlorophyll', 'B. Primary chlorophyll')).toBe(
			true
		);
	});

	it('strips an AMBIGUOUS prefix', () => {
		expect(
			answerMatchesOption(options, 'Primary chlorophyll', 'AMBIGUOUS: B. Primary chlorophyll')
		).toBe(true);
	});

	it('rejects a different option', () => {
		expect(answerMatchesOption(options, 'Primary chlorophyll', 'Cellular cytoplasm')).toBe(
			false
		);
		expect(
			answerMatchesOption(options, 'Primary chlorophyll', 'C. Cellular cytoplasm')
		).toBe(false);
	});

	it('rejects a label whose attached text matches no option', () => {
		expect(answerMatchesOption(options, 'Primary chlorophyll', 'B. Something else')).toBe(
			false
		);
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
			})
		).not.toThrow();
	});

	it('rejects a paper missing topic or questions', () => {
		expect(() =>
			validateGeneratedPaper({
				questionPaper: {},
				testType: 'multiple-choice',
				numQuestions: 1,
			})
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
			validateGeneratedPaper({
				questionPaper: paper,
				testType: 'multiple-choice',
				numQuestions: 1,
			})
		).toThrow(/answer must match one of the options/);
	});

	it('rejects multiple-choice questions without exactly 4 options', () => {
		const paper = {
			topic: 'Physics',
			questions: [{ question: 'Q?', options: ['A', 'B'], answer: 'A' }],
		};
		expect(() =>
			validateGeneratedPaper({
				questionPaper: paper,
				testType: 'multiple-choice',
				numQuestions: 1,
			})
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
			validateGeneratedPaper({
				questionPaper: paper,
				testType: 'multiple-choice',
				numQuestions: 2,
			})
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
			validateGeneratedPaper({
				questionPaper: paper,
				testType: 'multiple-choice',
				numQuestions: 1,
			})
		).toThrow(/invalid LaTeX/);
	});
});

describe('validateTestRecordPayload', () => {
	it('accepts a minimal valid payload', () => {
		expect(
			validateTestRecordPayload({
				topic: 'Physics',
				questions: [{ question: 'Q?', options: ['A', 'B'], answer: 'A' }],
			})
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

describe('new paper formats', () => {
	const fullExamBase = {
		topic: 'Physics',
		language: 'english',
		numQuestions: 10,
		difficulty: 'intermediate',
		testMode: 'full-exam',
		examName: 'CTET Paper 1',
		objectiveOnly: true,
	};

	it('accepts matching and assertion-reasoning full-exam requests', () => {
		expect(validateGenerateRequest({ ...fullExamBase, testType: 'matching' })).toBeNull();
		expect(
			validateGenerateRequest({ ...fullExamBase, testType: 'assertion-reasoning' })
		).toBeNull();
	});

	it('still rejects non-objective formats in full-exam mode', () => {
		for (const testType of ['coding', 'true-false', 'speed-challenge', 'mixed']) {
			expect(validateGenerateRequest({ ...fullExamBase, testType }).code).toBe(
				'MCQ_ONLY_FULL_EXAM'
			);
		}
	});

	function seededRandom(seed) {
		let state = seed >>> 0;
		return () => {
			state += 0x6d2b79f5;
			let value = Math.imul(state ^ (state >>> 15), 1 | state);
			value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
			return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
		};
	}

	function builtMatching() {
		return buildMatchingQuestion(
			{
				question: 'Match the vitamin in Column I with the deficiency disease in Column II.',
				rationale: 'Pairs.',
				columnA: ['Vitamin A', 'Vitamin B1', 'Vitamin C', 'Vitamin D'],
				columnB: ['Night blindness', 'Beriberi', 'Scurvy', 'Rickets'],
			},
			{ random: seededRandom(4) }
		).question;
	}

	function builtAssertionReasoning() {
		return buildAssertionReasoningQuestion({
			assertion: 'Iron rusts in moist air.',
			reason: 'Oxygen and water react with iron.',
			rationale: 'Rusting needs both.',
			answer: 'a',
		}).question;
	}

	it('accepts a clean matching question built by the server', () => {
		const question = builtMatching();
		expect(
			inspectGeneratedPaper({
				questionPaper: { topic: 'Vitamins', questions: [question] },
				testType: 'matching',
				numQuestions: 1,
			})
		).toEqual([]);
	});

	it('flags malformed matching options, column counts, and answer mismatches', () => {
		const question = builtMatching();
		const malformed = inspectGeneratedPaper({
			questionPaper: {
				topic: 'Vitamins',
				questions: [{ ...question, options: [...question.options.slice(1), 'not-a-combination'] }],
			},
			testType: 'matching',
			numQuestions: 1,
		});
		expect(malformed.map((issue) => issue.issue)).toContain('matching-option-malformed');

		const shortColumns = inspectGeneratedPaper({
			questionPaper: {
				topic: 'Vitamins',
				questions: [{ ...question, columnA: question.columnA.slice(0, 3) }],
			},
			testType: 'matching',
			numQuestions: 1,
		});
		expect(shortColumns.map((issue) => issue.issue)).toContain('matching-columns');

		const absentKey = [
			'1-A, 2-B, 3-C, 4-D',
			'1-A, 2-C, 3-D, 4-B',
			'1-B, 2-A, 3-D, 4-C',
			'1-C, 2-D, 3-A, 4-B',
			'1-D, 2-A, 3-B, 4-C',
		].find((candidate) => !question.options.includes(candidate));
		const keyedElsewhere = inspectGeneratedPaper({
			questionPaper: {
				topic: 'Vitamins',
				questions: [{ ...question, answer: absentKey }],
			},
			testType: 'matching',
			numQuestions: 1,
		});
		expect(keyedElsewhere.map((issue) => issue.issue)).toContain('answer-mismatch');
	});

	it('accepts a clean assertion-reasoning question and flags drift', () => {
		const question = builtAssertionReasoning();
		expect(
			inspectGeneratedPaper({
				questionPaper: { topic: 'Chemistry', questions: [question] },
				testType: 'assertion-reasoning',
				numQuestions: 1,
				language: 'english',
			})
		).toEqual([]);

		const drifted = inspectGeneratedPaper({
			questionPaper: {
				topic: 'Chemistry',
				questions: [{ ...question, options: [...question.options].reverse() }],
			},
			testType: 'assertion-reasoning',
			numQuestions: 1,
			language: 'english',
		});
		expect(drifted.map((issue) => issue.issue)).toContain('ar-options-mismatch');

		const sameStatements = inspectGeneratedPaper({
			questionPaper: {
				topic: 'Chemistry',
				questions: [{ ...question, reason: question.assertion }],
			},
			testType: 'assertion-reasoning',
			numQuestions: 1,
			language: 'english',
		});
		expect(sameStatements.map((issue) => issue.issue)).toContain('ar-statements-invalid');
	});

	it('accepts the Hindi canonical set when the language is hindi', () => {
		const question = buildAssertionReasoningQuestion(
			{
				assertion: 'लोहे को नम हवा में रखने पर जंग लगता है।',
				reason: 'ऑक्सीजन और जल लोहे से क्रिया करते हैं।',
				rationale: 'दोनों आवश्यक हैं।',
				answer: 'a',
			},
			{ language: 'hindi' }
		).question;
		expect(
			inspectGeneratedPaper({
				questionPaper: { topic: 'रसायन', questions: [question] },
				testType: 'assertion-reasoning',
				numQuestions: 1,
				language: 'hindi',
			})
		).toEqual([]);
	});
});
