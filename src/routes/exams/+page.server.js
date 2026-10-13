import { loadExamNotificationsPage } from '#lib/server/examNotificationsPage.js';

export async function load({ setHeaders }) {
	return loadExamNotificationsPage(setHeaders);
}
