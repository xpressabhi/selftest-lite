import { json } from '@sveltejs/kit';
import { isAdminConfigured, isAdminRequest } from '$lib/server/adminAuth';
import { getAdminStats, getDatabaseOverview } from '$lib/server/storage';
import { rateLimiter } from '$lib/server/rateLimiter';

const STATS_RATE_LIMIT = 60;

export async function GET({ request, url }) {
	if (!isAdminConfigured() || !isAdminRequest(request)) {
		return json(
			{ error: 'Unauthorized', code: 'ADMIN_UNAUTHORIZED' },
			{ status: 401 },
		);
	}

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/admin:stats',
			limit: STATS_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return json(
				{
					error: 'Rate limit exceeded. Please try again later.',
					code: 'RATE_LIMIT_EXCEEDED',
					resetTime: new Date(rateLimit.resetTime).toISOString(),
				},
				{ status: 429 },
			);
		}

		const recentLimit = Number(url.searchParams.get('recent')) || 50;
		const days = Number(url.searchParams.get('days')) || 0;
		const [stats, overview] = await Promise.all([
			getAdminStats({ recentLimit, days }),
			getDatabaseOverview({ days: days || 7 }),
		]);
		return json({ ...stats, overview });
	} catch (error) {
		console.error(error);
		return json(
			{ error: 'Failed to load stats', code: 'ADMIN_STATS_ERROR' },
			{ status: 500 },
		);
	}
}
