export function findCachedTestRecord(testHistory, testId) {
	if (!Array.isArray(testHistory) || testId === null || testId === undefined) {
		return null;
	}

	return (
		testHistory.find(
			(entry) => String(entry?.id ?? '') === String(testId),
		) || null
	);
}

export function hydrateTestRecordFromApiResponse(data) {
	if (!data?.test || typeof data.test !== 'object') {
		return null;
	}

	const paper = {
		...data.test,
		id: data.id,
	};

	if (data.myAttempt) {
		paper.userAnswers = data.myAttempt.user_answers || {};
		paper.score = data.myAttempt.score;
		paper.totalQuestions =
			data.myAttempt.total_questions || data.test?.questions?.length || null;
		paper.timeTaken = data.myAttempt.time_taken;
		paper.timestamp = data.myAttempt.submitted_at
			? new Date(data.myAttempt.submitted_at).getTime()
			: Date.now();
	}

	return paper;
}
