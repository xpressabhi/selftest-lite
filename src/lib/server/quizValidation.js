import {
	MAX_QUESTIONS,
	MIN_QUESTIONS,
	VALID_DIFFICULTIES,
	VALID_LANGUAGES,
	VALID_TEST_TYPES,
} from './quizConfig';

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

	questionPaper.questions.forEach((q, index) => {
		if (!q?.question || !Array.isArray(q.options) || !q?.answer) {
			throw new Error(`Invalid question structure at index ${index}`);
		}

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
	});

	if (questionPaper.questions.length !== numQuestions) {
		throw new Error(
			`Expected ${numQuestions} questions but got ${questionPaper.questions.length}`,
		);
	}
}
