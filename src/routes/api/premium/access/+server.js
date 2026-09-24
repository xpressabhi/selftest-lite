import { json } from '@sveltejs/kit';
import { hasPremiumAccess } from '$lib/server/premium';
import { getAuthenticatedUser } from '$lib/server/auth';
import { rateLimiter } from '$lib/server/rateLimiter';

/** Access state for the premium surfaces (admin, entitlement, or denied). */
export async function GET({ request, cookies }) {
	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/premium:access',
			limit: 60,
		});
		if (rateLimit.limited) {
			return json(
				{
					error: 'Rate limit exceeded. Please try again later.',
					code: 'RATE_LIMIT_EXCEEDED',
				},
				{ status: 429 }
			);
		}

		const user = await getAuthenticatedUser(cookies);
		const access = await hasPremiumAccess(request, { userId: user?.id });
		return json(
			{
				allowed: access.allowed,
				reason: access.reason,
				signedIn: Boolean(user?.id),
			},
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (error) {
		console.error('Premium access check failed:', error);
		return json({ error: 'Failed to check access', code: 'ACCESS_CHECK_ERROR' }, { status: 500 });
	}
}
