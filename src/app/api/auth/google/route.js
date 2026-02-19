import { NextResponse } from 'next/server';
import {
	createSessionForUser,
	setSessionCookie,
	upsertGoogleUser,
	verifyGoogleCredential,
} from '../../utils/auth';
import { getClientKey, logApiEvent } from '../../utils/storage';
import { rateLimiter } from '../../utils/rateLimiter';
import { API_LIMIT_ERROR_CODE } from '../../../utils/apiLimitError';

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

export async function POST(request) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/auth/google',
			limit: 12,
			windowMs: 60 * 1000,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/auth/google',
				action: 'google_sign_in',
				clientKey,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
			});

			return NextResponse.json(
				{
					error: 'Too many sign-in attempts. Please retry shortly.',
					code: API_LIMIT_ERROR_CODE,
				},
				{
					status: 429,
					headers: {
						'X-RateLimit-Limit': '12',
						'X-RateLimit-Remaining': rateLimit.remaining.toString(),
						'X-RateLimit-Reset': rateLimit.resetTime.toString(),
					},
				},
			);
		}

		const body = await request.json();
		const credential = body?.credential;

		if (!credential) {
			return NextResponse.json(
				{ error: 'Google credential is required' },
				{ status: 400 },
			);
		}

		const profile = await verifyGoogleCredential(credential);
		const user = await upsertGoogleUser(profile);
		const session = await createSessionForUser(user.id);

		const response = NextResponse.json({ user });
		setSessionCookie(response, session.rawSessionToken, session.expiresAt);

		await logApiEvent({
			route: '/api/auth/google',
			action: 'google_sign_in',
			clientKey,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			metadata: {
				userId: user.id,
				email: user.email,
			},
		});

		return response;
	} catch (error) {
		const statusCode = getStatusCode(error);

		await logApiEvent({
			route: '/api/auth/google',
			action: 'google_sign_in',
			clientKey,
			statusCode,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});

		return NextResponse.json(
			{
				error:
					statusCode === 401
						? 'Google sign-in failed. Please retry.'
						: 'Unable to sign in right now.',
			},
			{ status: statusCode },
		);
	}
}
