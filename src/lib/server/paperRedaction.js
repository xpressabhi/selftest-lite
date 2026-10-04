/**
 * Removes the answer key from a paper before it is sent to clients.
 *
 * Answer keys must never leave the server: clients receive questions only,
 * and grading happens server-side on submission. The anonymous device id goes
 * with it: it is an authorization credential rather than content, because the
 * /api/user/* routes accept a bare `x-client-id` header as sufficient to read
 * that identity's rows. Accepts either a bare paper ({ topic, questions }) or a
 * test record ({ test: { topic, questions } }).
 */
export function stripAnswerKey(record) {
	if (!record || typeof record !== 'object') {
		return record;
	}

	const source = Array.isArray(record.questions) ? record : record.test;
	if (!source || !Array.isArray(source.questions)) {
		return record;
	}

	// requestParams keeps the fields /test and /results render from, so only the
	// identity is dropped. It stays on the stored record for server-side
	// attribution on login (backfillUserIdentity matches on it); /api/test is
	// unauthenticated, so returning it would let anyone read or rewrite an
	// arbitrary account's history.
	let safeRequestParams;
	if (source.requestParams && typeof source.requestParams === 'object') {
		safeRequestParams = { ...source.requestParams };
		delete safeRequestParams.clientId;
	}

	const redacted = {
		...source,
		...(source.requestParams ? { requestParams: safeRequestParams } : {}),
		questions: source.questions.map((question) => {
			if (!question || typeof question !== 'object') {
				return question;
			}
			const redactedQuestion = { ...question };
			delete redactedQuestion.answer;
			return redactedQuestion;
		}),
	};

	return Array.isArray(record.questions) ? redacted : { ...record, test: redacted };
}
