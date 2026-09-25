import { json } from '@sveltejs/kit';
import { rateLimited } from '$lib/server/apiResponse';
import { requireAdmin } from '$lib/server/adminAuth';
import { getDeviceNetworkStats } from '$lib/server/storage';
import { rateLimiter } from '$lib/server/rateLimiter';

const STATS_RATE_LIMIT = 60;

export async function GET({ request, url }) {
	const unauthorized = requireAdmin(request);
	if (unauthorized) {
		return unauthorized;
	}

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/admin:device-network',
			limit: STATS_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return rateLimited(rateLimit);
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
