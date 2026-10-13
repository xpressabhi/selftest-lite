import { rateLimited } from '#lib/server/apiResponse.js';
import { requireAdmin } from '#lib/server/adminAuth.js';
import { getFeatureUsageStats } from '#lib/server/storage.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';

const STATS_RATE_LIMIT = 60;

export async function GET({ request, url }) {
	const unauthorized = requireAdmin(request);
	if (unauthorized) {
		return unauthorized;
	}

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/admin:feature-usage',
			limit: STATS_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return rateLimited(rateLimit);
		}

		const days = Number(url.searchParams.get('days')) || 30;
		const limit = Number(url.searchParams.get('limit')) || 60;
		const stats = await getFeatureUsageStats({ days, limit });
		return Response.json(stats);
	} catch (error) {
		console.error(error);
		return Response.json(
			{ error: 'Failed to load feature usage', code: 'FEATURE_USAGE_ERROR' },
			{ status: 500 }
		);
	}
}
