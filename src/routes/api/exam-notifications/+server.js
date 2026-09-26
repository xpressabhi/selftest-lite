import { json } from '@sveltejs/kit';
import { listExamNotifications } from '$lib/server/storage';

// Bounded, public feed for the in-app notification bell. Mirrors the /exams
// loader contract: CDN-cached (the daily sync is the freshness clock) and a
// database outage is an empty feed with a soft flag, never a 500.
const FEED_LIMIT = 30;
const FEED_WINDOW_DAYS = 90;

export async function GET({ setHeaders }) {
	setHeaders({
		'cache-control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600'
	});

	try {
		const notifications = await listExamNotifications({
			limit: FEED_LIMIT,
			windowDays: FEED_WINDOW_DAYS,
		});
		return json({ notifications });
	} catch (error) {
		console.error('Exam notification feed unavailable:', error?.message);
		return json({ notifications: [], unavailable: true });
	}
}
