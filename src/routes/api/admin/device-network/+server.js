import { rateLimited } from '#lib/server/apiResponse.js';
import { requireAdmin } from '#lib/server/adminAuth.js';
import { getDeviceNetworkStats } from '#lib/server/storage.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';

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

		const daysParam = Number(url.searchParams.get('days'));
		const days = Number.isFinite(daysParam) ? daysParam : 30;
		const stats = await getDeviceNetworkStats({ days });
		return Response.json(stats);
	} catch (error) {
		console.error(error);
		return Response.json(
			{ error: 'Failed to load device & network stats', code: 'DEVICE_NETWORK_ERROR' },
			{ status: 500 }
		);
	}
}
