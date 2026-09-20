import { error } from '@sveltejs/kit';
import { OBJECTIVE_ONLY_EXAMS } from '$lib/data/indianExams';

export const prerender = true;

export function entries() {
	return OBJECTIVE_ONLY_EXAMS.map((exam) => ({ examId: exam.id }));
}

export function load({ params }) {
	const exam = OBJECTIVE_ONLY_EXAMS.find((item) => item.id === params.examId);
	if (!exam) {
		error(404, 'Exam not found');
	}
	const related = OBJECTIVE_ONLY_EXAMS.filter(
		(item) => item.id !== exam.id && (item.stream === exam.stream || item.group === exam.group)
	).slice(0, 3);
	return { exam, related };
}
