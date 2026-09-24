import { json } from '@sveltejs/kit';
import { isAdminConfigured, isAdminRequest } from '$lib/server/adminAuth';
import { getDeviceNetworkStats } from '$lib/server/storage';
import { rateLimiter } from '$lib/server/rateLimiter';

const STATS_RATE_LIMIT = 60;

export async function GET({ request, url }) {
	if (!isAdminConfigured() || !isAdminRequest(request)) {
		return json({ error: 'Unauthorized', code: 'ADMIN_UNAUTHORIZED' }, { status: 401 });
	}

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/admin:device-network',
			limit: STATS_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return json(
				{
					error: 'Rate limit exceeded. Please try again later.',
					code: 'RATE_LIMIT_EXCEEDED',
					resetTime: new Date(rateLimit.resetTime).toISOString(),
				},
				{ status: 429 }
			);
		}

		const days = Number(url.searchParams.get('days')) || 30;
		const stats = await getDeviceNetworkStats({ days });
		return json(stats);
	} catch (error) {
		console.error(error);
		return json(
			{ error: 'Failed to load device & network stats', code: 'DEVICE_NETWORK_ERROR' },
			{ status: 500 }
		);
	}
}
