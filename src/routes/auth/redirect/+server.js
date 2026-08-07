import { redirect } from '@sveltejs/kit';
import {
	createSessionForUser,
	getClientIdFromRequest,
	setSessionCookie,
	upsertGoogleUser,
	verifyGoogleCredential,
} from '$lib/server/auth';
import { backfillUserIdentity, getClientKey, logApiEvent } from '$lib/server/storage';
import { rateLimiter } from '$lib/server/rateLimiter';
import { isRedirect } from '@sveltejs/kit';

const REDIRECT_AUTH_RATE_LIMIT = 10;

const home = (query = '') => (query ? `/?${query}` : '/');

/**
 * Server-side login endpoint used by the Sign In with Google redirect UX
 * mode (Capacitor Android app, where popups are unreliable). Google POSTs
 * the id_token credential here; we exchange it for a session cookie and
 * redirect back into the app.
 *
 * Must be registered as an authorized redirect URI in Google Cloud Console:
 * https://www.selftest.in/auth/redirect (and http://localhost:5173/auth/redirect
 * when testing the native flow against a local dev server).
 */
export async function POST({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);
	const clientId = getClientIdFromRequest(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/auth/redirect:post',
			limit: REDIRECT_AUTH_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/auth/redirect',
				action: 'redirect_sign_in',
				clientKey,
				clientId,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
			});
			throw redirect(303, home('auth=rate-limited'));
		}

		let credential = null;
		const contentType = request.headers.get('content-type') || '';
		if (contentType.includes('application/json')) {
			const body = await request.json().catch(() => ({}));
			credential = body?.credential;
		} else {
			const body = await request.text().catch(() => '');
			credential = new URLSearchParams(body).get('credential') || null;
		}

		if (!credential || typeof credential !== 'string') {
			await logApiEvent({
				route: '/auth/redirect',
				action: 'redirect_sign_in',
				clientKey,
				clientId,
				request,
				statusCode: 400,
				durationMs: Date.now() - startedAt,
			});
			throw redirect(303, home('auth=missing-credential'));
		}

		const profile = await verifyGoogleCredential(credential);
		const user = await upsertGoogleUser(profile);
		const session = await createSessionForUser(user.id);
		setSessionCookie(cookies, session.rawSessionToken, session.expiresAt);

		const backfilledCount = await backfillUserIdentity(user.id, clientId);

		await logApiEvent({
			route: '/auth/redirect',
			action: 'redirect_sign_in',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user.id,
			metadata: {
				email: user.email,
				backfilledCount,
			},
		});

		throw redirect(303, home());
	} catch (error) {
		if (isRedirect(error)) {
			throw error;
		}
		console.error('Redirect sign-in failed:', error);
		await logApiEvent({
			route: '/auth/redirect',
			action: 'redirect_sign_in',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});
		throw redirect(303, home('auth=failed'));
	}
}

/** Fallback for GET callbacks (e.g. credential in the query string). */
export async function GET({ url, request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);
	const clientId = getClientIdFromRequest(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/auth/redirect:get',
			limit: REDIRECT_AUTH_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			throw redirect(303, home('auth=rate-limited'));
		}

		const credential = url.searchParams.get('credential') || null;
		if (!credential) {
			throw redirect(303, home('auth=cancelled'));
		}

		const profile = await verifyGoogleCredential(credential);
		const user = await upsertGoogleUser(profile);
		const session = await createSessionForUser(user.id);
		setSessionCookie(cookies, session.rawSessionToken, session.expiresAt);

		await backfillUserIdentity(user.id, clientId);

		await logApiEvent({
			route: '/auth/redirect',
			action: 'redirect_sign_in',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user.id,
			metadata: { email: user.email },
		});

		throw redirect(303, home());
	} catch (error) {
		if (isRedirect(error)) {
			throw error;
		}
		console.error('Redirect sign-in (GET) failed:', error);
		await logApiEvent({
			route: '/auth/redirect',
			action: 'redirect_sign_in',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});
		throw redirect(303, home('auth=failed'));
	}
}
