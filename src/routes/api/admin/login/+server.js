import { rateLimiter } from '#lib/server/rateLimiter.js';
import { parseRequestBody } from '#lib/server/requestBody.js';
import { resolveRequestContext } from '#lib/server/apiContext.js';
import { logApiEvent } from '#lib/server/storage.js';
import {
	ADMIN_COOKIE_NAME,
	ADMIN_SESSION_TTL_MS,
	createSessionToken,
	isAdminConfigured,
	verifyAdminCredentials,
} from '#lib/server/adminAuth.js';

const LOGIN_RATE_LIMIT = 5;

export async function POST({ request, cookies }) {
	const { startedAt, clientKey } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/admin:login',
			limit: LOGIN_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return Response.json(
				{
					error: 'Too many login attempts. Please try again later.',
					code: 'ADMIN_LOGIN_RATE_LIMITED',
					resetTime: new Date(rateLimit.resetTime).toISOString(),
				},
				{ status: 429 }
			);
		}

		if (!isAdminConfigured()) {
			return Response.json(
				{
					error: 'Admin access is not configured',
					code: 'ADMIN_NOT_CONFIGURED',
				},
				{ status: 401 }
			);
		}

		const { username, password } = await parseRequestBody(request);

		if (!verifyAdminCredentials(username, password)) {
			await logApiEvent({
				route: '/api/admin:login',
				action: 'admin_login',
				clientKey,
				statusCode: 401,
				durationMs: Date.now() - startedAt,
				errorMessage: 'invalid credentials',
				metadata: { success: false },
				request,
			});
			return Response.json(
				{
					error: 'Invalid username or password',
					code: 'ADMIN_INVALID_CREDENTIALS',
				},
				{ status: 401 }
			);
		}

		cookies.set(ADMIN_COOKIE_NAME, createSessionToken(), {
			httpOnly: true,
			sameSite: 'lax',
			secure: request.headers.get('x-forwarded-proto') === 'https',
			path: '/',
			maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
		});

		await logApiEvent({
			route: '/api/admin:login',
			action: 'admin_login',
			clientKey,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			metadata: { success: true },
			request,
		});

		return Response.json({ ok: true });
	} catch (error) {
		console.error(error);
		if (error?.code === 'REQUEST_TOO_LARGE') {
			return Response.json(
				{ error: 'Request is too large', code: 'REQUEST_TOO_LARGE' },
				{ status: 413 }
			);
		}
		if (error?.code === 'INVALID_REQUEST_BODY') {
			return Response.json(
				{ error: 'Request body must be valid JSON', code: 'INVALID_REQUEST_BODY' },
				{ status: 400 }
			);
		}
		return Response.json(
			{
				error: 'An error occurred during login',
				code: 'ADMIN_LOGIN_FAILED',
			},
			{ status: 500 }
		);
	}
}
