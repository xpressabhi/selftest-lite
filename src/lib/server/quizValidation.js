import {
	MAX_QUESTIONS,
	MIN_QUESTIONS,
	VALID_DIFFICULTIES,
	VALID_LANGUAGES,
	VALID_TEST_TYPES,
} from './quizConfig';
import katex from 'katex';
import { normalizeMathText } from '$lib/shared/latex';

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

function comparableText(value) {
	return normalizeMathText(value).replace(/\s+/gu, ' ').trim();
}

function findMatchingOption(options, answer) {
	const normalizedAnswer = comparableText(answer);
	const exactOption = options.find(
		(option) => comparableText(option) === normalizedAnswer,
	);
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
	return optionIndex >= 0 && optionIndex < options.length
		? options[optionIndex]
		: null;
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

	const topic =
		comparableText(questionPaper.topic) || comparableText(fallbackTopic);
	const questions = questionPaper.questions.map((question) => {
		if (!question || typeof question !== 'object') {
			return question;
		}

		const options = Array.isArray(question.options)
			? question.options.map((option) => normalizeMathText(option).trim())
			: question.options;
		const answer = normalizeMathText(question.answer).trim();
		const matchingOption = Array.isArray(options)
			? findMatchingOption(options, answer)
			: null;

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
	const hasContext =
		Boolean(topic) ||
		selectedTopics.length > 0 ||
		syllabusFocus.length > 0;

	if (testMode !== 'full-exam' && !hasContext) {
		return 'Topic, selected topics, or syllabus focus is required';
	}

	if (testMode === 'full-exam' && !examName) {
		return 'Exam selection is required for full exam mode';
	}

	if (testMode === 'full-exam' && !objectiveOnly) {
		return 'Full exam mode currently supports objective papers only';
	}

	if (!VALID_LANGUAGES.includes(String(language).toLowerCase())) {
		return 'Invalid language selection';
	}

	if (testMode === 'full-exam' && testType !== 'multiple-choice') {
		return 'Full exam mode supports multiple-choice objective format';
	}

	if (!VALID_TEST_TYPES.includes(testType)) {
		return 'Invalid test type';
	}

	if (numQuestions < MIN_QUESTIONS || numQuestions > MAX_QUESTIONS) {
		return `Number of questions must be between ${MIN_QUESTIONS} and ${MAX_QUESTIONS}`;
	}

	if (!VALID_DIFFICULTIES.includes(difficulty)) {
		return 'Invalid difficulty level';
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
				`Question ${index + 1} must have exactly 2 options for true/false format`,
			);
		}

		if (!q.options.includes(q.answer)) {
			throw new Error(
				`Question ${index + 1} answer must match one of the options`,
			);
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
			`Expected ${numQuestions} questions but got ${questionPaper.questions.length}`,
		);
	}
}
