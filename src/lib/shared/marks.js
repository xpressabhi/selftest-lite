// Marks-aware scoring for pattern papers. Count-based scoring stays the
// primary percentage; marks are an additive view for real exam formats.
// Framework-neutral so the server and the locally-grading client share it.

function roundMarks(value) {
	return Math.round(value * 100) / 100;
}

/**
 * Computes exam marks for an attempt. Returns null when the paper has no
 * sections (a quiz-practice paper), so callers can skip the marks display.
 */
export function computeAttemptMarks({ questions = [], answers = {}, sections = [] } = {}) {
	if (!Array.isArray(sections) || sections.length === 0) {
		return null;
	}

	const sectionByIndex = new Map();
	for (const section of sections) {
		for (const index of section?.questionIndexes || []) {
			sectionByIndex.set(Number(index), section);
		}
	}

	let marks = 0;
	let totalMarks = 0;
	let correct = 0;
	let wrong = 0;
	let unanswered = 0;
	questions.forEach((question, index) => {
		const section = sectionByIndex.get(index) || sections[0];
		const perQuestion =
			Number(section?.marksPerQuestion) > 0 ? Number(section.marksPerQuestion) : 1;
		const negative = Number(section?.negativeMarks) > 0 ? Number(section.negativeMarks) : 0;
		totalMarks += perQuestion;

		const answer = answers[index];
		if (answer === undefined || answer === null || answer === '') {
			unanswered += 1;
			return;
		}
		const isCorrect =
			typeof question?.answer === 'string' && String(answer) === String(question.answer);
		if (isCorrect) {
			correct += 1;
			marks += perQuestion;
		} else {
			wrong += 1;
			if (negative > 0) {
				marks -= negative;
			}
		}
	});

	return {
		marks: roundMarks(marks),
		totalMarks: roundMarks(totalMarks),
		correct,
		wrong,
		unanswered,
	};
}
