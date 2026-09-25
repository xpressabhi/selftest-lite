import {
	FULL_EXAM_TEST_TYPES,
	MAX_ANSWER_TEXT_LENGTH,
	MAX_OPTION_TEXT_LENGTH,
	MAX_PREVIOUS_TESTS,
	MAX_QUESTION_TEXT_LENGTH,
	MAX_QUESTIONS,
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
import { questionTextFor } from '$lib/shared/questionText';
import { MATCHING_PAIR_COUNT, parseCombination } from './matchingBuilder';
import { AR_OPTIONS, optionsForLanguage } from './assertionReasoning';

const MATH_SEGMENT_PATTERN = /(\$\$?)([\s\S]*?)\1/g;

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
	const normalizedAnswer = comparableText(answer).replace(/^ambiguous\s*:\s*/iu, '');
	const exactOption = options.find((option) => comparableText(option) === normalizedAnswer);
	if (exactOption) {
		return exactOption;
	}

	// Models sometimes return an option label ("A", "Option A", "B. text")
	// instead of the bare option text. A label resolves to exactly one option;
	// when option text follows the label it must match that option.
	const labelMatch = normalizedAnswer.match(/^(?:option\s+)?([A-Z])(?:\s*[.):-]?\s*(.*))?$/iu);
	if (!labelMatch) {
		return null;
	}

	const remainder = (labelMatch[2] || '').trim();
	if (remainder) {
		return options.find((option) => comparableText(option) === remainder) || null;
	}

	const optionIndex = labelMatch[1].toUpperCase().charCodeAt(0) - 65;
	return optionIndex >= 0 && optionIndex < options.length ? options[optionIndex] : null;
}

/**
 * True when `candidate` (for example a verifier's answer, which may carry an
 * option label or an "AMBIGUOUS: " prefix) resolves to the keyed answer.
 */
export function answerMatchesOption(options, answer, candidate) {
	const matched = findMatchingOption(Array.isArray(options) ? options : [], candidate);
	return Boolean(matched) && comparableText(matched) === comparableText(answer);
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

		// Structured formats carry content in dedicated fields; normalize their
		// text too so math handling is identical everywhere.
		const structured = {};
		if (Array.isArray(question.columnA) && Array.isArray(question.columnB)) {
			structured.columnA = question.columnA.map((item) => normalizeMathText(item).trim());
			structured.columnB = question.columnB.map((item) => normalizeMathText(item).trim());
		}
		if (typeof question.assertion === 'string' || typeof question.reason === 'string') {
			structured.assertion = normalizeMathText(question.assertion).trim();
			structured.reason = normalizeMathText(question.reason).trim();
		}

		return {
			...question,
			question: normalizeMathText(question.question).trim(),
			options,
			answer: matchingOption || answer,
			...structured,
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

	if (testMode === 'full-exam' && !FULL_EXAM_TEST_TYPES.includes(testType)) {
		return createValidationError(
			'MCQ_ONLY_FULL_EXAM',
			'Full exam mode supports objective formats: multiple-choice, matching, and assertion-reasoning'
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
		if (
			String(question.assertion || '').length > MAX_QUESTION_TEXT_LENGTH ||
			String(question.reason || '').length > MAX_QUESTION_TEXT_LENGTH
		) {
			return createValidationError('INVALID_TEST_DATA', 'Assertion or reason text is too long');
		}
		if (
			(Array.isArray(question.columnA) &&
				question.columnA.some(
					(item) => String(item || '').length > MAX_OPTION_TEXT_LENGTH
				)) ||
			(Array.isArray(question.columnB) &&
				question.columnB.some(
					(item) => String(item || '').length > MAX_OPTION_TEXT_LENGTH
				))
		) {
			return createValidationError('INVALID_TEST_DATA', 'Column item text is too long');
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

/**
 * Per-question structural inspection. Returns `[{ index, issue, message }]`
 * (empty means valid); `index` is -1 for paper-level problems. The salvage
 * path keeps the good questions with this; `validateGeneratedPaper` below
 * preserves the original throwing contract.
 *
 * Format-aware: matching and assertion-reasoning questions are validated
 * against the server-built option contracts, and their duplicate/length checks
 * run on the composed question text (their stems can be empty).
 */
export function inspectGeneratedPaper({ questionPaper, testType, numQuestions, language }) {
	if (!questionPaper?.topic || !Array.isArray(questionPaper.questions)) {
		return [{ index: -1, issue: 'invalid-structure', message: 'Invalid response structure' }];
	}

	const issues = [];
	const questionTexts = new Set();
	questionPaper.questions.forEach((q, index) => {
		const add = (issue, message) => issues.push({ index, issue, message });
		const questionText = questionTextFor(q);

		if (!questionText || !Array.isArray(q?.options) || !q?.answer) {
			add('invalid-structure', `Invalid question structure at index ${index}`);
			return;
		}

		const normalizedQuestion = comparableText(questionText).toLocaleLowerCase();
		if (questionTexts.has(normalizedQuestion)) {
			add('duplicate-question', `Question ${index + 1} duplicates another question`);
			return;
		}
		questionTexts.add(normalizedQuestion);

		if (q.format === 'matching') {
			if (
				!Array.isArray(q.columnA) ||
				!Array.isArray(q.columnB) ||
				q.columnA.length !== MATCHING_PAIR_COUNT ||
				q.columnB.length !== MATCHING_PAIR_COUNT
			) {
				add('matching-columns', `Question ${index + 1} must have four items in each column`);
				return;
			}
			const parsedOptions = q.options.map((option) => parseCombination(option));
			if (q.options.length !== 4 || parsedOptions.some((letters) => !letters)) {
				add(
					'matching-option-malformed',
					`Question ${index + 1} has a malformed combination option`
				);
				return;
			}
			if (
				q.options.filter((option) => comparableText(option) === comparableText(q.answer))
					.length !== 1
			) {
				add('answer-mismatch', `Question ${index + 1} answer must match exactly one combination`);
				return;
			}
			try {
				validateMathSyntax(questionText, `Question ${index + 1}`);
			} catch (error) {
				add('invalid-latex', error.message);
			}
			return;
		}

		if (q.format === 'assertion-reasoning') {
			const expected = language ? optionsForLanguage(String(language).toLowerCase()) : null;
			const matchesSet = (set) =>
				q.options.length === set.length && q.options.every((option, i) => option === set[i]);
			const canonicalOk = expected
				? matchesSet(expected)
				: Object.values(AR_OPTIONS).some((set) => matchesSet(set));
			if (!canonicalOk) {
				add(
					'ar-options-mismatch',
					`Question ${index + 1} options must be the standard assertion-reasoning statements`
				);
				return;
			}
			if (!q.options.includes(q.answer)) {
				add('answer-mismatch', `Question ${index + 1} answer must match one of the options`);
				return;
			}
			const assertion = typeof q.assertion === 'string' ? q.assertion.trim() : '';
			const reason = typeof q.reason === 'string' ? q.reason.trim() : '';
			if (!assertion || !reason || assertion === reason) {
				add(
					'ar-statements-invalid',
					`Question ${index + 1} must have distinct assertion and reason statements`
				);
				return;
			}
			try {
				validateMathSyntax(questionText, `Question ${index + 1}`);
			} catch (error) {
				add('invalid-latex', error.message);
			}
			return;
		}

		if (
			(testType === 'multiple-choice' || testType === 'speed-challenge') &&
			q.options.length !== 4
		) {
			add('option-count', `Question ${index + 1} must have exactly 4 options`);
			return;
		}

		if (testType === 'true-false' && q.options.length !== 2) {
			add('option-count', `Question ${index + 1} must have exactly 2 options for true/false format`);
			return;
		}

		if (!q.options.includes(q.answer)) {
			add('answer-mismatch', `Question ${index + 1} answer must match one of the options`);
			return;
		}

		const normalizedOptions = q.options.map((option) => comparableText(option));
		if (new Set(normalizedOptions).size !== normalizedOptions.length) {
			add('duplicate-options', `Question ${index + 1} contains duplicate options`);
			return;
		}

		try {
			validateMathSyntax(q.question, `Question ${index + 1}`);
			q.options.forEach((option, optionIndex) => {
				validateMathSyntax(option, `Question ${index + 1}, option ${optionIndex + 1}`);
			});
			validateMathSyntax(q.answer, `Question ${index + 1}, answer`);
		} catch (error) {
			add('invalid-latex', error.message);
		}
	});

	if (questionPaper.questions.length !== numQuestions) {
		issues.push({
			index: -1,
			issue: 'count-mismatch',
			message: `Expected ${numQuestions} questions but got ${questionPaper.questions.length}`,
		});
	}

	return issues;
}

export function validateGeneratedPaper({ questionPaper, testType, numQuestions }) {
	const issues = inspectGeneratedPaper({ questionPaper, testType, numQuestions });
	if (issues.length > 0) {
		throw new Error(issues[0].message);
	}
}
