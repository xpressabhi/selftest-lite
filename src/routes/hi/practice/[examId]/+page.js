import { error } from '@sveltejs/kit';
import { examEntries, findExamPage } from '$lib/data/routeLoads';

export const prerender = true;

export function entries() {
	return examEntries();
}

export function load({ params }) {
	const page = findExamPage(params.examId);
	if (!page) {
		error(404, 'Exam not found');
	}
	return page;
}
