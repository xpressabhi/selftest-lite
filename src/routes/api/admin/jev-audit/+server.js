import { rateLimited } from '#lib/server/apiResponse.js';
import { requireAdmin } from '#lib/server/adminAuth.js';
import { getJevAuditEvent } from '#lib/server/storage.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';

const AUDIT_RATE_LIMIT = 60;

export async function GET({ request, url }) {
	const unauthorized = requireAdmin(request);
	if (unauthorized) {
		return unauthorized;
	}

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/admin:jev-audit',
			limit: AUDIT_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return rateLimited(rateLimit);
		}

		const event = await getJevAuditEvent(url.searchParams.get('id'));
		if (!event) {
			return Response.json(
				{ error: 'Audit event not found', code: 'JEV_AUDIT_NOT_FOUND' },
				{ status: 404 }
			);
		}
		return Response.json({ event });
	} catch (error) {
		console.error(error);
		return Response.json(
			{ error: 'Failed to load the Jev audit event', code: 'JEV_AUDIT_ERROR' },
			{ status: 500 }
		);
	}
}
