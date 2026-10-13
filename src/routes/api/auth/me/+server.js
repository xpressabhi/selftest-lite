import { clearSessionCookie, getSessionFromRequest, setSessionCookie } from '#lib/server/auth.js';
import { logApiEvent } from '#lib/server/storage.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';
import { resolveRequestContext } from '#lib/server/apiContext.js';

const ME_RATE_LIMIT = 900;

export async function GET({ request, cookies }) {
	const { startedAt, clientKey } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/auth/me',
			limit: ME_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return Response.json(
				{ error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' },
				{ status: 429 }
			);
		}

		const session = await getSessionFromRequest(cookies, { refresh: true });
		if (!session) {
			// Anonymous visitors are the normal case, not an error: answer 200
			// with a null user and skip API error telemetry so the admin error
			// rate reflects real failures only.
			clearSessionCookie(cookies);
			return Response.json({ user: null });
		}

		setSessionCookie(cookies, session.rawSessionToken, session.expiresAt);
		await logApiEvent({
			route: '/api/auth/me',
			action: 'resolve_session',
			clientKey,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: session.user.id,
		});

		return Response.json({ user: session.user });
	} catch (error) {
		console.error('Failed to fetch session:', error);
		await logApiEvent({
			route: '/api/auth/me',
			action: 'resolve_session',
			clientKey,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});
		return Response.json({ error: 'Unable to resolve session', code: 'SESSION_ERROR' }, { status: 500 });
	}
}
