import { json } from '@sveltejs/kit';
import { rateLimited } from '$lib/server/apiResponse';
import { requireAdmin } from '$lib/server/adminAuth';
import {
	grantPremiumEntitlement,
	listPremiumEntitlements,
	revokePremiumEntitlement,
} from '$lib/server/premium';
import { rateLimiter } from '$lib/server/rateLimiter';
import { readJsonBody } from '$lib/server/requestBody';

const PREMIUM_ADMIN_RATE_LIMIT = 30;

async function checkRateLimit(request, bucket) {
	const rateLimit = await rateLimiter(request, {
		bucket,
		limit: PREMIUM_ADMIN_RATE_LIMIT,
	});
	if (rateLimit.limited) {
		return rateLimited(rateLimit);
	}
	return null;
}

/** Admin-only list of all premium grants, revoked ones included. */
export async function GET({ request }) {
	const unauthorized = requireAdmin(request);
	if (unauthorized) {
		return unauthorized;
	}
	try {
		const limited = await checkRateLimit(request, '/api/admin:premium');
		if (limited) {
			return limited;
		}
		const grants = await listPremiumEntitlements();
		return json({ grants });
	} catch (error) {
		console.error(error);
		return json({ error: 'Failed to load premium grants', code: 'PREMIUM_LIST_ERROR' }, { status: 500 });
	}
}

/** Grant by email, or revoke by user id (`action: 'revoke'`). */
export async function POST({ request }) {
	const unauthorized = requireAdmin(request);
	if (unauthorized) {
		return unauthorized;
	}
	try {
		const limited = await checkRateLimit(request, '/api/admin:premium');
		if (limited) {
			return limited;
		}
		const body = await readJsonBody(request);

		if (body?.action === 'revoke') {
			const result = await revokePremiumEntitlement({
				userId: body.userId,
				feature: body.feature,
			});
			if (!result.ok) {
				return json({ error: 'Invalid user', code: result.code }, { status: 400 });
			}
			return json({ success: true, revoked: result.revoked });
		}

		const result = await grantPremiumEntitlement({
			email: body?.email,
			feature: body?.feature,
			grantedBy: 'admin',
			expiresAt: body?.expiresAt || null,
			notes: body?.notes || null,
		});
		if (!result.ok) {
			const status = result.code === 'USER_NOT_FOUND' ? 404 : 400;
			return json({ error: 'Could not grant premium access', code: result.code }, { status });
		}
		return json({ success: true, userId: result.userId });
	} catch (error) {
		console.error(error);
		return json(
			{ error: 'Failed to update premium access', code: 'PREMIUM_UPDATE_ERROR' },
			{ status: 500 }
		);
	}
}
