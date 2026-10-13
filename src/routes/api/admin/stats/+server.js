import { rateLimited } from '#lib/server/apiResponse.js';
import { requireAdmin } from '#lib/server/adminAuth.js';
import { getAdminStats, getDatabaseOverview } from '#lib/server/storage.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';

const STATS_RATE_LIMIT = 60;

export async function GET({ request, url }) {
	const unauthorized = requireAdmin(request);
	if (unauthorized) {
		return unauthorized;
	}

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/admin:stats',
			limit: STATS_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return rateLimited(rateLimit);
		}

		const recentLimit = Number(url.searchParams.get('recent')) || 50;
		const days = Number(url.searchParams.get('days')) || 0;
		const [stats, overview] = await Promise.all([
			getAdminStats({ recentLimit, days }),
			getDatabaseOverview({ days: days || 7 }),
		]);
		return Response.json({ ...stats, overview });
	} catch (error) {
		console.error(error);
		return Response.json({ error: 'Failed to load stats', code: 'ADMIN_STATS_ERROR' }, { status: 500 });
	}
}
