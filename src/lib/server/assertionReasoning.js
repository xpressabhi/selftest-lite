/**
 * Assertion-Reasoning format: canonical option statements + builder.
 *
 * The model supplies the assertion, the reason, and which code (a-d) is right.
 * The four option statements are server constants so wording never drifts
 * between questions, between papers, or between languages. The conventional
 * order is fixed and never shuffled: learners (and real exam papers) expect
 * "(a) both true, R explains A" first.
 */

import { MAX_QUESTION_TEXT_LENGTH } from './quizConfig';

export const AR_CODE_ORDER = ['a', 'b', 'c', 'd'];

export const AR_OPTIONS = {
	english: [
		'Both A and R are true, and R is the correct explanation of A',
		'Both A and R are true, but R is NOT the correct explanation of A',
		'A is true, but R is false',
		'A is false, but R is true',
	],
	hindi: [
		'A और R दोनों सत्य हैं, तथा R, A की सही व्याख्या है।',
		'A और R दोनों सत्य हैं, परंतु R, A की सही व्याख्या नहीं है।',
		'A सत्य है, परंतु R असत्य है।',
		'A असत्य है, परंतु R सत्य है।',
	],
};

export const AR_ISSUE_ANSWER_INVALID = 'ar-answer-invalid';
export const AR_ISSUE_STATEMENTS_INVALID = 'ar-statements-invalid';

export function optionsForLanguage(language) {
	return AR_OPTIONS[language] || AR_OPTIONS.english;
}

/**
 * @param {object} raw Model output: { assertion, reason, rationale, answer }
 * @param {{ language?: string }} options
 * @returns {{ ok: true, question: object } | { ok: false, issues: string[] }}
 */
export function buildAssertionReasoningQuestion(raw, { language = 'english' } = {}) {
	const code = typeof raw?.answer === 'string' ? raw.answer.trim().toLowerCase() : '';
	const codeIndex = AR_CODE_ORDER.indexOf(code);
	if (codeIndex === -1) {
		return { ok: false, issues: [AR_ISSUE_ANSWER_INVALID] };
	}

	const assertion = typeof raw?.assertion === 'string' ? raw.assertion.trim() : '';
	const reason = typeof raw?.reason === 'string' ? raw.reason.trim() : '';
	if (
		!assertion ||
		!reason ||
		assertion === reason ||
		assertion.length > MAX_QUESTION_TEXT_LENGTH ||
		reason.length > MAX_QUESTION_TEXT_LENGTH
	) {
		return { ok: false, issues: [AR_ISSUE_STATEMENTS_INVALID] };
	}

	const options = optionsForLanguage(language);

	return {
		ok: true,
		question: {
			format: 'assertion-reasoning',
			question: '',
			assertion,
			reason,
			rationale: typeof raw?.rationale === 'string' ? raw.rationale.trim() : '',
			options: [...options],
			answer: options[codeIndex],
		},
	};
}
