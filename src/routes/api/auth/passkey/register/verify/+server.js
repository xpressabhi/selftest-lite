import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	backfillUserIdentity,
	consumePasskeyChallenge,
	createPasskeyUserWithCredential,
	insertPasskeyForUser,
	logApiEvent
} from '$lib/server/storage';
import { createSessionForUser, getUserById, setSessionCookie } from '$lib/server/auth';
import { verifyRegistration } from '$lib/server/passkey';
import {
	bytesToBase64Url,
	describePasskeyDevice,
	readChallengeFromClientData,
	resolvePasskeyContext
} from '$lib/shared/passkeyPolicy';
import { rateLimiter } from '$lib/server/rateLimiter';
import { rateLimited } from '$lib/server/apiResponse';
import { readJsonBody } from '$lib/server/requestBody';
import { resolveRequestContext } from '$lib/server/apiContext';

const REGISTER_VERIFY_RATE_LIMIT = 20;

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

/** Verifies an attestation and either creates the account or attaches the credential. */
export async function POST({ request, url, cookies }) {
	const { startedAt, clientKey, clientId, user } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/auth/passkey/register/verify',
			limit: REGISTER_VERIFY_RATE_LIMIT
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/auth/passkey/register/verify',
				action: 'passkey_register_verify',
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
				{ error: 'A registration response is required.', code: 'PASSKEY_RESPONSE_REQUIRED' },
				{ status: 400 }
			);
		}

		// The challenge is consumed before verification so it is single-use even
		// when verification then fails.
		const challenge = readChallengeFromClientData(response.response.clientDataJSON);
		const challengeRow = challenge
			? await consumePasskeyChallenge(challenge, 'registration')
			: null;
		if (!challengeRow) {
			return json(
				{ error: 'This passkey setup expired. Please try again.', code: 'PASSKEY_CHALLENGE_EXPIRED' },
				{ status: 400 }
			);
		}

		// The challenge row decides the mode: an "add" ceremony is bound to the
		// session that started it, and a signup ceremony is refused while signed
		// in so a stray ceremony cannot create a second account.
		const boundUserId = Number(challengeRow.user_id) || null;
		if (boundUserId && (!user || boundUserId !== user.id)) {
			return json(
				{ error: 'Sign in again to add this passkey.', code: 'SESSION_REQUIRED' },
				{ status: 401 }
			);
		}
		if (!boundUserId && user) {
			return json(
				{
					error: 'You are already signed in. Add the passkey from your profile instead.',
					code: 'PASSKEY_MODE_MISMATCH'
				},
				{ status: 409 }
			);
		}

		const verification = await verifyRegistration({
			response,
			expectedChallenge: challengeRow.challenge,
			expectedOrigin: context.expectedOrigin,
			expectedRPID: context.rpId
		});

		if (!verification.verified || !verification.registrationInfo) {
			await logApiEvent({
				route: '/api/auth/passkey/register/verify',
				action: 'passkey_register_verify',
				clientKey,
				clientId,
				request,
				statusCode: 400,
				durationMs: Date.now() - startedAt,
				errorMessage: 'Attestation verification failed',
				userId: user?.id ?? null
			});
			return json(
				{ error: 'That passkey could not be verified.', code: 'PASSKEY_VERIFICATION_FAILED' },
				{ status: 400 }
			);
		}

		const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
		const credentialArgs = {
			credentialId: credential.id,
			publicKey: bytesToBase64Url(credential.publicKey),
			counter: Number(credential.counter) || 0,
			transports: Array.isArray(credential.transports) ? credential.transports : null,
			deviceType: credentialDeviceType || null,
			backedUp: typeof credentialBackedUp === 'boolean' ? credentialBackedUp : null,
			label: describePasskeyDevice(request.headers.get('user-agent'))
		};

		let userId;
		let mode;
		if (boundUserId) {
			mode = 'add';
			await insertPasskeyForUser({ userId: boundUserId, ...credentialArgs });
			userId = boundUserId;
		} else {
			mode = 'signup';
			userId = await createPasskeyUserWithCredential({
				displayName: challengeRow.display_name,
				userHandle: challengeRow.user_handle,
				...credentialArgs
			});
			if (!userId) {
				throw new Error('Passkey account was not created');
			}
		}

		const session = await createSessionForUser(userId);
		setSessionCookie(cookies, session.rawSessionToken, session.expiresAt);
		const backfilledCount = await backfillUserIdentity(userId, clientId);
		const authenticatedUser = await getUserById(userId);

		await logApiEvent({
			route: '/api/auth/passkey/register/verify',
			action: 'passkey_register_verify',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId,
			metadata: { mode, backfilledCount, deviceType: credentialArgs.deviceType }
		});

		return json({ user: authenticatedUser, mode });
	} catch (error) {
		// A credential that is already registered is a user-recoverable state,
		// not a server fault.
		const duplicate = error?.code === '23505';
		if (!duplicate) {
			console.error('Passkey registration failed:', error);
		}

		await logApiEvent({
			route: '/api/auth/passkey/register/verify',
			action: 'passkey_register_verify',
			clientKey,
			clientId,
			request,
			statusCode: duplicate ? 409 : 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
			userId: user?.id ?? null
		});

		return duplicate
			? json(
					{
						error: 'This passkey is already registered. Try signing in instead.',
						code: 'PASSKEY_ALREADY_REGISTERED'
					},
					{ status: 409 }
				)
			: json(
					{ error: 'Unable to save this passkey.', code: 'PASSKEY_REGISTRATION_ERROR' },
					{ status: 500 }
				);
	}
}
