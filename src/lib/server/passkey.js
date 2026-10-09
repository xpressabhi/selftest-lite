// Passkey (WebAuthn) ceremony wrappers.
//
// The verification library is imported in exactly one place: these thin
// wrappers, which the routes call. Swapping the implementation (or hand-rolling
// it) touches this file and nothing else. All the decisions that must not
// depend on the library live in `$lib/shared/passkeyPolicy`.

import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse
} from '@simplewebauthn/server';
import { base64UrlToBytes } from '$lib/shared/passkeyPolicy';

export const PASSKEY_RP_NAME = 'Selftest';
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;

// ES256 (platform passkeys) and RS256 (some security keys and older Android).
const SUPPORTED_ALGORITHM_IDS = [-7, -257];

/** Options for `navigator.credentials.create()`. */
export async function buildRegistrationOptions({
	rpId,
	userName,
	displayName,
	userHandle,
	existingCredentials = []
}) {
	return generateRegistrationOptions({
		rpName: PASSKEY_RP_NAME,
		rpID: rpId,
		userName,
		userID: base64UrlToBytes(userHandle),
		userDisplayName: displayName,
		attestationType: 'none',
		excludeCredentials: existingCredentials.map((credential) => ({
			id: credential.credentialId,
			transports: Array.isArray(credential.transports) ? credential.transports : undefined
		})),
		authenticatorSelection: {
			residentKey: 'required',
			userVerification: 'required'
		},
		supportedAlgorithmIDs: SUPPORTED_ALGORITHM_IDS
	});
}

/**
 * Options for `navigator.credentials.get()`. An empty `allowCredentials`
 * selects discoverable credentials, which is what makes this a one-tap sign-in
 * with no identifier field.
 */
export async function buildAuthenticationOptions({ rpId }) {
	return generateAuthenticationOptions({
		rpID: rpId,
		userVerification: 'required',
		allowCredentials: []
	});
}

export async function verifyRegistration({
	response,
	expectedChallenge,
	expectedOrigin,
	expectedRPID
}) {
	return verifyRegistrationResponse({
		response,
		expectedChallenge,
		expectedOrigin,
		expectedRPID,
		requireUserVerification: true,
		supportedAlgorithmIDs: SUPPORTED_ALGORITHM_IDS
	});
}

export async function verifyAuthentication({
	response,
	expectedChallenge,
	expectedOrigin,
	expectedRPID,
	credential
}) {
	return verifyAuthenticationResponse({
		response,
		expectedChallenge,
		expectedOrigin,
		expectedRPID,
		credential,
		requireUserVerification: true
	});
}

/** Stored row -> the shape `verifyAuthenticationResponse` expects. */
export function toWebAuthnCredential(row) {
	return {
		id: row.credential_id,
		publicKey: base64UrlToBytes(row.public_key),
		counter: Number(row.counter) || 0,
		transports: Array.isArray(row.transports) ? row.transports : undefined
	};
}
