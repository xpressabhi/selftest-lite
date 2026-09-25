import { json } from '@sveltejs/kit';
import {
	createSessionForUser,
	setSessionCookie,
	upsertGoogleUser,
	verifyGoogleCredential,
} from '$lib/server/auth';
import { backfillUserIdentity, logApiEvent } from '$lib/server/storage';
import { rateLimiter } from '$lib/server/rateLimiter';
import { readJsonBody } from '$lib/server/requestBody';
import { rateLimited } from '$lib/server/apiResponse';
import { resolveRequestContext } from '$lib/server/apiContext';

const GOOGLE_AUTH_RATE_LIMIT = 10;

function getStatusCode(error) {
	if (!error?.message) {
		return 500;
	}

	const message = error.message.toLowerCase();
	if (
		message.includes('credential') ||
		message.includes('google account') ||
		message.includes('validation')
	) {
		return 401;
	}

	if (message.includes('required')) {
		return 400;
	}

	return 500;
}

export async function POST({ request, cookies }) {
	const { startedAt, clientKey, clientId } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/auth/google',
			limit: GOOGLE_AUTH_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/auth/google',
				action: 'google_sign_in',
				clientKey,
				clientId,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
			});
			return rateLimited(rateLimit);
		}

		const body = await readJsonBody(request);
		const credential = body?.credential;

		if (!credential) {
			return json(
				{ error: 'Google credential is required', code: 'GOOGLE_CREDENTIAL_REQUIRED' },
				{ status: 400 }
			);
		}

		const profile = await verifyGoogleCredential(credential);
		const user = await upsertGoogleUser(profile);
		const session = await createSessionForUser(user.id);
		setSessionCookie(cookies, session.rawSessionToken, session.expiresAt);

		const backfilledCount = await backfillUserIdentity(user.id, clientId);

		await logApiEvent({
			route: '/api/auth/google',
			action: 'google_sign_in',
			clientKey,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user.id,
			metadata: {
				email: user.email,
				backfilledCount,
			},
		});

		return json({ user });
	} catch (error) {
		const statusCode = getStatusCode(error);

		await logApiEvent({
			route: '/api/auth/google',
			action: 'google_sign_in',
			clientKey,
			request,
			statusCode,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});

		return json(
			{
				error:
					statusCode === 401
						? 'Google sign-in failed. Please retry.'
						: 'Unable to sign in right now.',
				code: statusCode === 401 ? 'GOOGLE_SIGN_IN_FAILED' : 'SIGN_IN_ERROR',
			},
			{ status: statusCode }
		);
	}
}
