import { json } from '@sveltejs/kit';
import { randomBytes } from 'crypto';
import { env } from '$env/dynamic/private';
import {
	createPasskeyChallenge,
	ensureWebauthnUserHandle,
	listPasskeyCredentialsForUser,
	logApiEvent
} from '$lib/server/storage';
import { buildRegistrationOptions } from '$lib/server/passkey';
import {
	bytesToBase64Url,
	generateDisplayName,
	normalizeDisplayLanguage,
	resolvePasskeyContext
} from '$lib/shared/passkeyPolicy';
import { rateLimiter } from '$lib/server/rateLimiter';
import { rateLimited } from '$lib/server/apiResponse';
import { readJsonBody } from '$lib/server/requestBody';
import { resolveRequestContext } from '$lib/server/apiContext';

const REGISTER_OPTIONS_RATE_LIMIT = 20;

/**
 * Starts a registration ceremony. A signed-in caller adds a passkey to their
 * account; anyone else is starting a new passkey-first account. The mode is
 * decided by the session, never by the request body.
 */
export async function POST({ request, url, cookies }) {
	const { startedAt, clientKey, clientId, user } = await resolveRequestContext(request, cookies);
	const mode = user ? 'add' : 'signup';

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/auth/passkey/register/options',
			limit: REGISTER_OPTIONS_RATE_LIMIT
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/auth/passkey/register/options',
				action: 'passkey_register_options',
				clientKey,
				clientId,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
				userId: user?.id ?? null,
				metadata: { mode }
			});
			return rateLimited(rateLimit);
		}

		const context = resolvePasskeyContext(url, env);
		if (!context) {
			await logApiEvent({
				route: '/api/auth/passkey/register/options',
				action: 'passkey_register_options',
				clientKey,
				clientId,
				request,
				statusCode: 503,
				durationMs: Date.now() - startedAt,
				errorMessage: 'Origin outside the passkey allowlist',
				metadata: { mode }
			});
			return json(
				{ error: 'Passkeys are not available here.', code: 'PASSKEY_UNAVAILABLE' },
				{ status: 503 }
			);
		}

		const body = await readJsonBody(request);
		const language = normalizeDisplayLanguage(body?.language);

		let userHandle;
		let displayName;
		let userName;
		let existingCredentials = [];

		if (mode === 'add') {
			userHandle = await ensureWebauthnUserHandle(user.id, () =>
				bytesToBase64Url(randomBytes(16))
			);
			existingCredentials = await listPasskeyCredentialsForUser(user.id);
			displayName = user.name || generateDisplayName({ language });
			userName = user.email || `learner-${userHandle.slice(0, 8)}`;
		} else {
			userHandle = bytesToBase64Url(randomBytes(16));
			displayName = generateDisplayName({ language });
			userName = `learner-${userHandle.slice(0, 8)}`;
		}

		const options = await buildRegistrationOptions({
			rpId: context.rpId,
			userName,
			displayName,
			userHandle,
			existingCredentials
		});

		await createPasskeyChallenge({
			challenge: options.challenge,
			kind: 'registration',
			userId: mode === 'add' ? user.id : null,
			userHandle,
			displayName
		});

		await logApiEvent({
			route: '/api/auth/passkey/register/options',
			action: 'passkey_register_options',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id ?? null,
			metadata: { mode }
		});

		return json({ mode, options });
	} catch (error) {
		console.error('Failed to build passkey registration options:', error);
		await logApiEvent({
			route: '/api/auth/passkey/register/options',
			action: 'passkey_register_options',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
			metadata: { mode }
		});
		return json(
			{ error: 'Unable to start passkey setup.', code: 'PASSKEY_OPTIONS_ERROR' },
			{ status: 500 }
		);
	}
}
