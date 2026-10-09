import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createPasskeyChallenge, logApiEvent } from '$lib/server/storage';
import { buildAuthenticationOptions } from '$lib/server/passkey';
import { resolvePasskeyContext } from '$lib/shared/passkeyPolicy';
import { rateLimiter } from '$lib/server/rateLimiter';
import { rateLimited } from '$lib/server/apiResponse';
import { resolveRequestContext } from '$lib/server/apiContext';

const LOGIN_OPTIONS_RATE_LIMIT = 30;

/**
 * Starts a one-tap sign-in. `allowCredentials` is empty on purpose: the
 * browser offers every discoverable passkey for this site, so the user never
 * types an identifier and the server never confirms whether an account exists.
 */
export async function POST({ request, url, cookies }) {
	const { startedAt, clientKey, clientId, user } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/auth/passkey/login/options',
			limit: LOGIN_OPTIONS_RATE_LIMIT
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/auth/passkey/login/options',
				action: 'passkey_login_options',
				clientKey,
				clientId,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
				userId: user?.id ?? null
			});
			return rateLimited(rateLimit);
		}

		const context = resolvePasskeyContext(url, env);
		if (!context) {
			await logApiEvent({
				route: '/api/auth/passkey/login/options',
				action: 'passkey_login_options',
				clientKey,
				clientId,
				request,
				statusCode: 503,
				durationMs: Date.now() - startedAt,
				errorMessage: 'Origin outside the passkey allowlist'
			});
			return json(
				{ error: 'Passkeys are not available here.', code: 'PASSKEY_UNAVAILABLE' },
				{ status: 503 }
			);
		}

		const options = await buildAuthenticationOptions({ rpId: context.rpId });
		await createPasskeyChallenge({ challenge: options.challenge, kind: 'authentication' });

		await logApiEvent({
			route: '/api/auth/passkey/login/options',
			action: 'passkey_login_options',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id ?? null
		});

		return json({ options });
	} catch (error) {
		console.error('Failed to build passkey authentication options:', error);
		await logApiEvent({
			route: '/api/auth/passkey/login/options',
			action: 'passkey_login_options',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message
		});
		return json(
			{ error: 'Unable to start passkey sign-in.', code: 'PASSKEY_OPTIONS_ERROR' },
			{ status: 500 }
		);
	}
}
