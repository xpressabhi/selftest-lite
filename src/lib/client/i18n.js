import { derived } from 'svelte/store';
import { language } from './preferences';
import { getDictionary } from './locales';

export function translate(key, currentLanguage = 'english', replacements = {}) {
	const dictionary = getDictionary(currentLanguage);
	const fallbackDictionary = getDictionary('english');
	let value = dictionary[key] || fallbackDictionary[key] || key;

	for (const [name, replacement] of Object.entries(replacements)) {
		value = value.replaceAll(`{${name}}`, String(replacement));
	}

	return value;
}

export const t = derived(language, ($language) => {
	return (key, replacements) => translate(key, $language, replacements);
});

const API_ERROR_MESSAGE_KEYS = {
	MISSING_TOPIC_CONTEXT: 'errorMissingTopicContext',
	EXAM_REQUIRED: 'errorExamRequired',
	OBJECTIVE_ONLY_REQUIRED: 'errorObjectiveOnly',
	INVALID_LANGUAGE: 'errorInvalidLanguage',
	MCQ_ONLY_FULL_EXAM: 'errorMcqOnlyFullExam',
	INVALID_TEST_TYPE: 'errorInvalidTestType',
	INVALID_QUESTION_COUNT: 'errorInvalidQuestionCount',
	INVALID_DIFFICULTY: 'errorInvalidDifficulty',
	TOPIC_TOO_LONG: 'errorTopicTooLong',
	TOO_MANY_SELECTED_TOPICS: 'errorTooManySelectedTopics',
	SELECTED_TOPIC_TOO_LONG: 'errorSelectedTopicTooLong',
	TOO_MANY_SYLLABUS_FOCUS: 'errorTooManySyllabusFocus',
	SYLLABUS_FOCUS_TOO_LONG: 'errorSyllabusFocusTooLong',
	INVALID_REQUEST_BODY: 'errorInvalidRequestBody',
	REQUEST_TOO_LARGE: 'errorRequestTooLarge',
	API_LIMIT_EXCEEDED: 'apiLimitExceededRetry',
	GENERATION_TIMEOUT: 'generationTimedOutRetry',
	GENERATION_FAILED: 'failedToGenerateQuiz',
	GENERATION_UNEXPECTED: 'unexpectedError',
	EXPLANATION_FAILED: 'unableToFetchExplanation',
	EXPLANATION_TIMEOUT: 'explanationTimedOut',
	EXPLAIN_FIELDS_REQUIRED: 'errorExplainFieldsRequired',
	EXPLAIN_FIELDS_TOO_LONG: 'errorExplainFieldsTooLong',
	TEST_NOT_FOUND: 'testNotFound',
	TEST_DATA_REQUIRED: 'testDataRequired',
	TEST_FETCH_ERROR: 'errorFetchingTest',
	TEST_CREATE_ERROR: 'errorCreatingTest',
	INVALID_TEST_ID: 'errorInvalidTestId',
	INVALID_ANSWERS: 'errorInvalidAnswers',
};

const API_ERROR_MESSAGE_REPLACEMENTS = {
	INVALID_QUESTION_COUNT: { min: 1, max: 200 },
};

/**
 * Maps a server error payload (with a stable `code`) to a localized message,
 * falling back to the server-provided English message.
 */
export function localizedApiError(payload, translateFn, status = 0) {
	if (status === 429 && payload?.resetTime) {
		return translateFn('rateLimitExceededRetry');
	}
	const key = API_ERROR_MESSAGE_KEYS[payload?.code];
	if (key) {
		return translateFn(key, API_ERROR_MESSAGE_REPLACEMENTS[payload?.code]);
	}
	return payload?.error || translateFn('unexpectedError');
}
