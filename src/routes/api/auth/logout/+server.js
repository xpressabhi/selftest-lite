import { json } from '@sveltejs/kit';
import {
	clearSessionCookie,
	getRawSessionTokenFromRequest,
	revokeSessionByToken,
} from '$lib/server/auth';
import { getClientKey, logApiEvent } from '$lib/server/storage';
import { rateLimiter } from '$lib/server/rateLimiter';

const LOGOUT_RATE_LIMIT = 10;

export async function POST({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/auth/logout',
			limit: LOGOUT_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return json(
				{ error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' },
				{ status: 429 },
			);
		}

		const rawSessionToken = getRawSessionTokenFromRequest(cookies);
		if (rawSessionToken) {
			await revokeSessionByToken(rawSessionToken);
		}

		clearSessionCookie(cookies);
		await logApiEvent({
			route: '/api/auth/logout',
			action: 'sign_out',
			clientKey,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
		});

		return json({ success: true });
	} catch (error) {
		console.error('Failed to sign out:', error);
		clearSessionCookie(cookies);
		await logApiEvent({
			route: '/api/auth/logout',
			action: 'sign_out',
			clientKey,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});
		return json(
			{ error: 'Failed to sign out', code: 'LOGOUT_FAILED' },
			{ status: 500 },
		);
	}
}
