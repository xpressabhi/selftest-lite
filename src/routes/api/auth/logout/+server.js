import {
	clearSessionCookie,
	getRawSessionTokenFromRequest,
	revokeSessionByToken,
} from '#lib/server/auth.js';
import { logApiEvent } from '#lib/server/storage.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';
import { resolveRequestContext } from '#lib/server/apiContext.js';

const LOGOUT_RATE_LIMIT = 10;

export async function POST({ request, cookies }) {
	const { startedAt, clientKey } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/auth/logout',
			limit: LOGOUT_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return Response.json(
				{ error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' },
				{ status: 429 }
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

		return Response.json({ success: true });
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
		return Response.json({ error: 'Failed to sign out', code: 'LOGOUT_FAILED' }, { status: 500 });
	}
}
