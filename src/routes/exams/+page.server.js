import { loadExamNotificationsPage } from '$lib/server/examNotificationsPage';

export async function load({ setHeaders }) {
	return loadExamNotificationsPage(setHeaders);
}
