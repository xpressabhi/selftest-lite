/**
 * Composes the plain-text rendering of a structured question.
 *
 * Structured formats (matching, assertion-reasoning) keep their content in
 * dedicated fields, and an assertion-reasoning question has an intentionally
 * empty stem. Everything that needs to read or quote a question as text —
 * dedupe lists, quality checks, explain requests — goes through this helper so
 * no consumer ever sees a context-free blank.
 */

export function questionTextFor(question) {
	if (!question || typeof question !== 'object') {
		return '';
	}

	const stem = typeof question.question === 'string' ? question.question.trim() : '';
	const hasColumns = Array.isArray(question.columnA) && Array.isArray(question.columnB);
	const hasStatements =
		typeof question.assertion === 'string' || typeof question.reason === 'string';

	if (hasColumns && (question.format === 'matching' || !stem)) {
		const columnA = question.columnA
			.map((item, index) => `${index + 1}. ${String(item ?? '').trim()}`)
			.join(' ');
		const columnB = question.columnB
			.map((item, index) => `${String.fromCharCode(65 + index)}. ${String(item ?? '').trim()}`)
			.join(' ');
		return [stem, `Column I: ${columnA}`, `Column II: ${columnB}`].filter(Boolean).join('\n');
	}

	if (hasStatements && (question.format === 'assertion-reasoning' || !stem)) {
		const assertion = typeof question.assertion === 'string' ? question.assertion.trim() : '';
		const reason = typeof question.reason === 'string' ? question.reason.trim() : '';
		if (!assertion && !reason) {
			return stem;
		}
		return [`Assertion (A): ${assertion}`, `Reason (R): ${reason}`].join('\n');
	}

	return stem;
}
