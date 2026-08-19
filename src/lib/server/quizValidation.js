import {
	MAX_ANSWER_TEXT_LENGTH,
	MAX_OPTION_TEXT_LENGTH,
	MAX_PREVIOUS_TESTS,
	MAX_QUESTION_TEXT_LENGTH,
	MAX_QUESTIONS,
	MAX_REQUEST_BODY_BYTES,
	MAX_SELECTED_TOPICS,
	MAX_SYLLABUS_FOCUS,
	MAX_TEST_QUESTIONS,
	MAX_TOPIC_LENGTH,
	MAX_TOPIC_LIST_ITEM_LENGTH,
	MIN_QUESTIONS,
	VALID_DIFFICULTIES,
	VALID_LANGUAGES,
	VALID_TEST_TYPES,
} from './quizConfig';
import katex from 'katex';
import { normalizeMathText } from '$lib/shared/latex';

const MATH_SEGMENT_PATTERN = /(\$\$?)([\s\S]*?)\1/g;

export class RequestBodyTooLargeError extends Error {
	constructor() {
		super('Request body exceeds the maximum allowed size');
		this.name = 'RequestBodyTooLargeError';
		this.code = 'REQUEST_TOO_LARGE';
	}
}

export class InvalidRequestBodyError extends Error {
	constructor() {
		super('Request body must be valid JSON');
		this.name = 'InvalidRequestBodyError';
		this.code = 'INVALID_REQUEST_BODY';
	}
}

/**
 * Reads and parses the JSON request body while enforcing a size cap on the
 * raw text before parsing, so callers cannot force a large parse on the
 * server.
 */
export async function parseRequestBody(request) {
	const rawBody = await request.text();
	if (rawBody.length > MAX_REQUEST_BODY_BYTES) {
		throw new RequestBodyTooLargeError();
	}
	try {
		return JSON.parse(rawBody);
	} catch {
		throw new InvalidRequestBodyError();
	}
}

function validateMathSyntax(value, label) {
	for (const match of String(value ?? '').matchAll(MATH_SEGMENT_PATTERN)) {
		try {
			katex.renderToString(match[2], {
				displayMode: match[1] === '$$',
				throwOnError: true,
			});
		} catch (error) {
			throw new Error(`${label} contains invalid LaTeX: ${error.message}`, { cause: error });
		}
	}
}

export function comparableText(value) {
	return normalizeMathText(value).replace(/\s+/gu, ' ').trim();
}

function findMatchingOption(options, answer) {
	const normalizedAnswer = comparableText(answer);
	const exactOption = options.find((option) => comparableText(option) === normalizedAnswer);
	if (exactOption) {
		return exactOption;
	}

	// Models sometimes return an option label ("A" or "Option A") instead of
	// the complete option. This is safe to repair only when the label maps to
	// exactly one existing option.
	const labelMatch = normalizedAnswer.match(/^(?:option\s+)?([A-Z])$/iu);
	if (!labelMatch) {
		return null;
	}

	const optionIndex = labelMatch[1].toUpperCase().charCodeAt(0) - 65;
	return optionIndex >= 0 && optionIndex < options.length ? options[optionIndex] : null;
}

/**
 * Repairs only deterministic presentation/contract defects. It deliberately
 * does not invent missing questions, options, or answers; those are sent back
 * to the model for regeneration by the caller.
 */
export function repairGeneratedPaper({ questionPaper, fallbackTopic = '' }) {
	if (
		!questionPaper ||
		typeof questionPaper !== 'object' ||
		!Array.isArray(questionPaper.questions)
	) {
		return questionPaper;
	}

	const topic = comparableText(questionPaper.topic) || comparableText(fallbackTopic);
	const questions = questionPaper.questions.map((question) => {
		if (!question || typeof question !== 'object') {
			return question;
		}

		const options = Array.isArray(question.options)
			? question.options.map((option) => normalizeMathText(option).trim())
			: question.options;
		const answer = normalizeMathText(question.answer).trim();
		const matchingOption = Array.isArray(options) ? findMatchingOption(options, answer) : null;

		return {
			...question,
			question: normalizeMathText(question.question).trim(),
			options,
			answer: matchingOption || answer,
		};
	});

	return {
		...questionPaper,
		topic,
		questions,
	};
}

function createValidationError(code, message) {
	return { code, message };
}

/**
 * Normalizes the client-supplied test ID lists: keeps only positive integers
 * and caps the count so direct API callers cannot request an unbounded number
 * of records.
 */
export function sanitizePreviousTestIds(value) {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((entry) => Number(entry))
		.filter((entry) => Number.isInteger(entry) && entry > 0)
		.slice(0, MAX_PREVIOUS_TESTS);
}

export function validateGenerateRequest({
	topic,
	selectedTopics = [],
	syllabusFocus = [],
	testMode = 'quiz-practice',
	examName = null,
	objectiveOnly = false,
	language,
	testType,
	numQuestions,
	difficulty,
}) {
	const hasContext = Boolean(topic) || selectedTopics.length > 0 || syllabusFocus.length > 0;

	if (testMode !== 'full-exam' && !hasContext) {
		return createValidationError(
			'MISSING_TOPIC_CONTEXT',
			'Topic, selected topics, or syllabus focus is required'
		);
	}

	if (testMode === 'full-exam' && !examName) {
		return createValidationError(
			'EXAM_REQUIRED',
			'Exam selection is required for full exam mode'
		);
	}

	if (testMode === 'full-exam' && !objectiveOnly) {
		return createValidationError(
			'OBJECTIVE_ONLY_REQUIRED',
			'Full exam mode currently supports objective papers only'
		);
	}

	if (String(topic || '').length > MAX_TOPIC_LENGTH) {
		return createValidationError('TOPIC_TOO_LONG', 'Topic is too long');
	}

	if (selectedTopics.length > MAX_SELECTED_TOPICS) {
		return createValidationError(
			'TOO_MANY_SELECTED_TOPICS',
			`Too many selected topics. Maximum is ${MAX_SELECTED_TOPICS}`
		);
	}

	if (selectedTopics.some((item) => String(item || '').length > MAX_TOPIC_LIST_ITEM_LENGTH)) {
		return createValidationError('SELECTED_TOPIC_TOO_LONG', 'A selected topic is too long');
	}

	if (syllabusFocus.length > MAX_SYLLABUS_FOCUS) {
		return createValidationError(
			'TOO_MANY_SYLLABUS_FOCUS',
			`Too many syllabus focus items. Maximum is ${MAX_SYLLABUS_FOCUS}`
		);
	}

	if (syllabusFocus.some((item) => String(item || '').length > MAX_TOPIC_LIST_ITEM_LENGTH)) {
		return createValidationError(
			'SYLLABUS_FOCUS_TOO_LONG',
			'A syllabus focus item is too long'
		);
	}

	if (!VALID_LANGUAGES.includes(String(language).toLowerCase())) {
		return createValidationError('INVALID_LANGUAGE', 'Invalid language selection');
	}

	if (testMode === 'full-exam' && testType !== 'multiple-choice') {
		return createValidationError(
			'MCQ_ONLY_FULL_EXAM',
			'Full exam mode supports multiple-choice objective format'
		);
	}

	if (!VALID_TEST_TYPES.includes(testType)) {
		return createValidationError('INVALID_TEST_TYPE', 'Invalid test type');
	}

	if (numQuestions < MIN_QUESTIONS || numQuestions > MAX_QUESTIONS) {
		return createValidationError(
			'INVALID_QUESTION_COUNT',
			`Number of questions must be between ${MIN_QUESTIONS} and ${MAX_QUESTIONS}`
		);
	}

	if (!VALID_DIFFICULTIES.includes(difficulty)) {
		return createValidationError('INVALID_DIFFICULTY', 'Invalid difficulty level');
	}

	return null;
}

export function validateTestRecordPayload(test) {
	if (!test || typeof test !== 'object' || Array.isArray(test)) {
		return createValidationError('INVALID_TEST_DATA', 'Test data must be an object');
	}

	if (!Array.isArray(test.questions) || test.questions.length < 1) {
		return createValidationError(
			'INVALID_TEST_DATA',
			'Test data must include at least one question'
		);
	}

	if (test.questions.length > MAX_TEST_QUESTIONS) {
		return createValidationError(
			'INVALID_TEST_DATA',
			`Test data cannot contain more than ${MAX_TEST_QUESTIONS} questions`
		);
	}

	if (String(test.topic || '').length > MAX_TOPIC_LENGTH) {
		return createValidationError('INVALID_TEST_DATA', 'Topic is too long');
	}

	for (const question of test.questions) {
		if (!question || typeof question !== 'object') {
			return createValidationError('INVALID_TEST_DATA', 'Invalid question entry');
		}
		if (String(question.question || '').length > MAX_QUESTION_TEXT_LENGTH) {
			return createValidationError('INVALID_TEST_DATA', 'Question text is too long');
		}
		if (String(question.answer || '').length > MAX_ANSWER_TEXT_LENGTH) {
			return createValidationError('INVALID_TEST_DATA', 'Answer text is too long');
		}
		if (
			Array.isArray(question.options) &&
			question.options.some((option) => String(option || '').length > MAX_OPTION_TEXT_LENGTH)
		) {
			return createValidationError('INVALID_TEST_DATA', 'Option text is too long');
		}
	}

	return null;
}

export function validateGeneratedPaper({ questionPaper, testType, numQuestions }) {
	if (!questionPaper?.topic || !Array.isArray(questionPaper.questions)) {
		throw new Error('Invalid response structure');
	}

	const questionTexts = new Set();
	questionPaper.questions.forEach((q, index) => {
		if (!q?.question || !Array.isArray(q.options) || !q?.answer) {
			throw new Error(`Invalid question structure at index ${index}`);
		}

		const normalizedQuestion = comparableText(q.question).toLocaleLowerCase();
		if (questionTexts.has(normalizedQuestion)) {
			throw new Error(`Question ${index + 1} duplicates another question`);
		}
		questionTexts.add(normalizedQuestion);

		if (
			(testType === 'multiple-choice' || testType === 'speed-challenge') &&
			q.options.length !== 4
		) {
			throw new Error(`Question ${index + 1} must have exactly 4 options`);
		}

		if (testType === 'true-false' && q.options.length !== 2) {
			throw new Error(
				`Question ${index + 1} must have exactly 2 options for true/false format`
			);
		}

		if (!q.options.includes(q.answer)) {
			throw new Error(`Question ${index + 1} answer must match one of the options`);
		}

		const normalizedOptions = q.options.map((option) => comparableText(option));
		if (new Set(normalizedOptions).size !== normalizedOptions.length) {
			throw new Error(`Question ${index + 1} contains duplicate options`);
		}

		validateMathSyntax(q.question, `Question ${index + 1}`);
		q.options.forEach((option, optionIndex) => {
			validateMathSyntax(option, `Question ${index + 1}, option ${optionIndex + 1}`);
		});
		validateMathSyntax(q.answer, `Question ${index + 1}, answer`);
	});

	if (questionPaper.questions.length !== numQuestions) {
		throw new Error(
			`Expected ${numQuestions} questions but got ${questionPaper.questions.length}`
		);
	}
}
