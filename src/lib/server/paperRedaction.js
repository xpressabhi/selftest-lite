/**
 * Removes the answer key from a paper before it is sent to clients.
 *
 * Answer keys must never leave the server: clients receive questions only,
 * and grading happens server-side on submission. Accepts either a bare paper
 * ({ topic, questions }) or a test record ({ test: { topic, questions } }).
 */
export function stripAnswerKey(record) {
	if (!record || typeof record !== 'object') {
		return record;
	}

	const source = Array.isArray(record.questions) ? record : record.test;
	if (!source || !Array.isArray(source.questions)) {
		return record;
	}

	const redacted = {
		...source,
		questions: source.questions.map((question) => {
			if (!question || typeof question !== 'object') {
				return question;
			}
			const redactedQuestion = { ...question };
			delete redactedQuestion.answer;
			return redactedQuestion;
		}),
	};

	return Array.isArray(record.questions)
		? redacted
		: { ...record, test: redacted };
}
