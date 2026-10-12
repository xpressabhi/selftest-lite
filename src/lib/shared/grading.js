/**
 * Grading of one attempt's answers against a paper's answer key.
 *
 * Framework-neutral so the two places that need identical semantics share one
 * implementation: `POST /api/test/submit` grades a fresh submission with it,
 * and `GET /api/test?id=` re-grades a stored attempt with it so a device that
 * never submitted locally can still render the full review. `answers` is the
 * normalized map (index -> trimmed non-empty string) that the submit route
 * stores; boundary validation stays in the route.
 */
export function gradeAttemptResults(questions, answers) {
	const list = Array.isArray(questions) ? questions : [];
	const source = answers && typeof answers === 'object' ? answers : {};

	return list.map((question, index) => {
		const raw = source[index];
		const yourAnswer = typeof raw === 'string' && raw.length > 0 ? raw : null;
		const correctAnswer = typeof question?.answer === 'string' ? question.answer : null;
		return {
			index,
			correct: yourAnswer !== null && correctAnswer !== null && yourAnswer === correctAnswer,
			yourAnswer,
			correctAnswer,
		};
	});
}
