import { rateLimited } from '#lib/server/apiResponse.js';
import { requireAdmin } from '#lib/server/adminAuth.js';
import { getAdminLogs } from '#lib/server/storage.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';

const LOGS_RATE_LIMIT = 60;

export async function GET({ request, url }) {
	const unauthorized = requireAdmin(request);
	if (unauthorized) {
		return unauthorized;
	}

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/admin:logs',
			limit: LOGS_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return rateLimited(rateLimit);
		}

		const daysParam = Number(url.searchParams.get('days'));
		const days = Number.isFinite(daysParam) ? daysParam : 7;
		const logs = await getAdminLogs({
			days,
			route: url.searchParams.get('route') || '',
			status: url.searchParams.get('status') || '',
			country: url.searchParams.get('country') || '',
			q: url.searchParams.get('q') || '',
			before: url.searchParams.get('before'),
			limit: url.searchParams.get('limit') || 50,
		});
		return Response.json(logs);
	} catch (error) {
		console.error(error);
		return Response.json(
			{ error: 'Failed to load request logs', code: 'ADMIN_LOGS_ERROR' },
			{ status: 500 }
		);
	}
}
