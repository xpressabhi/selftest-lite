// Shared loader for /exams and /hi/exams (SvelteKit route files cannot share
// a +page.server.js, so both call this). DB failure is not a 500: the page
// renders its empty state with a "temporarily unavailable" note, since the
// hub is also the surface that keeps working while the sync is down.

import { getLatestExamSyncRun, listExamNotifications } from './storage.js';

export async function loadExamNotificationsPage(setHeaders) {
	// Browser revalidates (max-age=0) so a reload is never stale; the CDN
	// absorbs traffic with s-maxage.
	setHeaders({
		'cache-control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600'
	});

	try {
		const [notifications, lastRun] = await Promise.all([
			listExamNotifications(),
			getLatestExamSyncRun()
		]);
		return {
			notifications,
			lastRunAt: lastRun?.finishedAt ?? null,
			lastRunStatus: lastRun?.status ?? null
		};
	} catch {
		return { notifications: [], lastRunAt: null, lastRunStatus: 'unavailable' };
	}
}
