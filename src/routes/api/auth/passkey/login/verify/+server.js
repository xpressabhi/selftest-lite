import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	backfillUserIdentity,
	consumePasskeyChallenge,
	getPasskeyWithUserByCredentialId,
	logApiEvent,
	updatePasskeyUsage
} from '$lib/server/storage';
import { createSessionForUser, getUserById, setSessionCookie } from '$lib/server/auth';
import { toWebAuthnCredential, verifyAuthentication } from '$lib/server/passkey';
import { readChallengeFromClientData, resolvePasskeyContext } from '$lib/shared/passkeyPolicy';
import { rateLimiter } from '$lib/server/rateLimiter';
import { rateLimited } from '$lib/server/apiResponse';
import { readJsonBody } from '$lib/server/requestBody';
import { resolveRequestContext } from '$lib/server/apiContext';

const LOGIN_VERIFY_RATE_LIMIT = 30;

function isUsableResponse(response) {
	return (
		response &&
		typeof response === 'object' &&
		typeof response.id === 'string' &&
		response.id.length > 0 &&
		response.response &&
		typeof response.response === 'object' &&
		typeof response.response.clientDataJSON === 'string'
	);
}

/** Unknown credential and failed verification answer identically on purpose. */
function rejected() {
	return json(
		{ error: 'That passkey was not accepted.', code: 'PASSKEY_UNKNOWN_CREDENTIAL' },
		{ status: 401 }
	);
}

export async function POST({ request, url, cookies }) {
	const { startedAt, clientKey, clientId, user } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/auth/passkey/login/verify',
			limit: LOGIN_VERIFY_RATE_LIMIT
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/auth/passkey/login/verify',
				action: 'passkey_login_verify',
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
			return json(
				{ error: 'Passkeys are not available here.', code: 'PASSKEY_UNAVAILABLE' },
				{ status: 503 }
			);
		}

		const body = await readJsonBody(request);
		const response = body?.response;
		if (!isUsableResponse(response)) {
			return json(
				{ error: 'A passkey response is required.', code: 'PASSKEY_RESPONSE_REQUIRED' },
				{ status: 400 }
			);
		}

		const challenge = readChallengeFromClientData(response.response.clientDataJSON);
		const challengeRow = challenge
			? await consumePasskeyChallenge(challenge, 'authentication')
			: null;
		if (!challengeRow) {
			return json(
				{ error: 'This sign-in attempt expired. Please try again.', code: 'PASSKEY_CHALLENGE_EXPIRED' },
				{ status: 400 }
			);
		}

		const passkeyRow = await getPasskeyWithUserByCredentialId(response.id);
		if (!passkeyRow) {
			await logApiEvent({
				route: '/api/auth/passkey/login/verify',
				action: 'passkey_login_verify',
				clientKey,
				clientId,
				request,
				statusCode: 401,
				durationMs: Date.now() - startedAt,
				errorMessage: 'Unknown credential'
			});
			return rejected();
		}

		const verification = await verifyAuthentication({
			response,
			expectedChallenge: challengeRow.challenge,
			expectedOrigin: context.expectedOrigin,
			expectedRPID: context.rpId,
			credential: toWebAuthnCredential(passkeyRow)
		});

		if (!verification.verified) {
			await logApiEvent({
				route: '/api/auth/passkey/login/verify',
				action: 'passkey_login_verify',
				clientKey,
				clientId,
				request,
				statusCode: 401,
				durationMs: Date.now() - startedAt,
				errorMessage: 'Assertion verification failed',
				userId: Number(passkeyRow.user_id) || null
			});
			return rejected();
		}

		const info = verification.authenticationInfo;
		const storedCounter = Number(passkeyRow.counter) || 0;
		// Synced passkeys legitimately report 0, so a non-increasing counter is
		// recorded rather than turned into a lockout.
		const counterAnomaly = storedCounter > 0 && Number(info.newCounter) <= storedCounter;

		await updatePasskeyUsage({
			passkeyId: passkeyRow.id,
			counter: info.newCounter,
			deviceType: info.credentialDeviceType || null,
			backedUp: typeof info.credentialBackedUp === 'boolean' ? info.credentialBackedUp : null
		});

		const userId = Number(passkeyRow.user_id);
		const session = await createSessionForUser(userId);
		setSessionCookie(cookies, session.rawSessionToken, session.expiresAt);
		const backfilledCount = await backfillUserIdentity(userId, clientId);
		const authenticatedUser = await getUserById(userId);

		await logApiEvent({
			route: '/api/auth/passkey/login/verify',
			action: 'passkey_login_verify',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId,
			metadata: {
				backfilledCount,
				counterAnomaly,
				deviceType: info.credentialDeviceType || null
			}
		});

		return json({ user: authenticatedUser });
	} catch (error) {
		console.error('Passkey sign-in failed:', error);
		await logApiEvent({
			route: '/api/auth/passkey/login/verify',
			action: 'passkey_login_verify',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
			userId: user?.id ?? null
		});
		return json({ error: 'Unable to sign in right now.', code: 'PASSKEY_LOGIN_ERROR' }, { status: 500 });
	}
}
