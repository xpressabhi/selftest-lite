import { json } from '@sveltejs/kit';
import { isAdminConfigured, isAdminRequest } from '$lib/server/adminAuth';
import { getFeatureUsageStats } from '$lib/server/storage';
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
			bucket: '/api/admin:feature-usage',
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

		const days = Number(url.searchParams.get('days')) || 30;
		const limit = Number(url.searchParams.get('limit')) || 60;
		const stats = await getFeatureUsageStats({ days, limit });
		return json(stats);
	} catch (error) {
		console.error(error);
		return json(
			{ error: 'Failed to load feature usage', code: 'FEATURE_USAGE_ERROR' },
			{ status: 500 },
		);
	}
}
