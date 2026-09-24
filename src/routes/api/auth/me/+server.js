import { json } from '@sveltejs/kit';
import { clearSessionCookie, getSessionFromRequest, setSessionCookie } from '$lib/server/auth';
import { getClientKey, logApiEvent } from '$lib/server/storage';
import { rateLimiter } from '$lib/server/rateLimiter';

const ME_RATE_LIMIT = 900;

export async function GET({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/auth/me',
			limit: ME_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return json(
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
			return json({ user: null });
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

		return json({ user: session.user });
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
		return json({ error: 'Unable to resolve session', code: 'SESSION_ERROR' }, { status: 500 });
	}
}
