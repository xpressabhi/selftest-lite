// Passkey sign-up / sign-in from the browser.
//
// The server owns every decision; this module only converts between the
// base64url JSON the WebAuthn API speaks and the ArrayBuffers the browser API
// wants, then hands the result back. Capability detection is what hides the
// affordance in a browser without WebAuthn (Android WebView), so no deployment
// flag is needed.

import { getClientHeaders } from './identity';
import { track } from './telemetry';
import { syncAfterLogin, user } from './auth';

export function isPasskeySupported() {
	return (
		typeof window !== 'undefined' &&
		typeof window.PublicKeyCredential === 'function' &&
		typeof navigator !== 'undefined' &&
		typeof navigator.credentials?.create === 'function' &&
		typeof navigator.credentials?.get === 'function'
	);
}

/**
 * Used only to pick wording ("use your fingerprint or screen lock"). It is not
 * a gate: it reports on *platform* authenticators, so gating on it would hide
 * roaming security keys and cross-device QR sign-in.
 */
export async function isPlatformAuthenticatorAvailable() {
	if (!isPasskeySupported()) {
		return false;
	}
	try {
		return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
	} catch {
		return false;
	}
}

function base64UrlToBytes(value) {
	const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

function bytesToBase64Url(buffer) {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function requestJson(url, body) {
	const response = await fetch(url, {
		method: 'POST',
		cache: 'no-store',
		headers: { ...getClientHeaders(), 'content-type': 'application/json' },
		body: JSON.stringify(body || {})
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		const error = new Error(data?.error || 'Passkey request failed');
		error.code = data?.code || 'PASSKEY_REQUEST_FAILED';
		error.status = response.status;
		throw error;
	}
	return data;
}

/** Locale key for a passkey failure, or null when the user simply cancelled. */
export function passkeyErrorKey(error) {
	if (!error) {
		return 'passkeyFailed';
	}
	if (error.name === 'NotAllowedError' || error.name === 'AbortError') {
		return null;
	}
	// The browser raises this when the account already has a credential on this
	// authenticator: adding a second passkey requires a different device.
	if (error.name === 'InvalidStateError') {
		return 'passkeyAlreadyRegistered';
	}
	switch (error.code || '') {
		case 'PASSKEY_ALREADY_REGISTERED':
			return 'passkeyAlreadyRegistered';
		case 'PASSKEY_CHALLENGE_EXPIRED':
			return 'passkeyExpired';
		case 'PASSKEY_UNAVAILABLE':
			return 'passkeyUnavailable';
		case 'LAST_LOGIN_METHOD':
			return 'signInLastMethod';
		case 'GOOGLE_NOT_LINKED':
			return 'signInGoogleNotLinked';
		case 'GOOGLE_LINK_CONFLICT':
			return 'passkeyLinkConflict';
		default:
			return 'passkeyFailed';
	}
}

function passkeyErrorReason(error) {
	if (error?.name === 'NotAllowedError') return 'cancelled';
	if (error?.name === 'InvalidStateError') return 'already-registered';
	if (typeof error?.code === 'string') return error.code;
	return 'failed';
}

function registrationResponseJson(credential) {
	return {
		id: credential.id,
		rawId: bytesToBase64Url(credential.rawId),
		type: credential.type,
		clientExtensionResults: credential.getClientExtensionResults?.() || {},
		authenticatorAttachment: credential.authenticatorAttachment || undefined,
		response: {
			clientDataJSON: bytesToBase64Url(credential.response.clientDataJSON),
			attestationObject: bytesToBase64Url(credential.response.attestationObject),
			transports: credential.response.getTransports?.() || []
		}
	};
}

function assertionResponseJson(assertion) {
	return {
		id: assertion.id,
		rawId: bytesToBase64Url(assertion.rawId),
		type: assertion.type,
		clientExtensionResults: assertion.getClientExtensionResults?.() || {},
		authenticatorAttachment: assertion.authenticatorAttachment || undefined,
		response: {
			clientDataJSON: bytesToBase64Url(assertion.response.clientDataJSON),
			authenticatorData: bytesToBase64Url(assertion.response.authenticatorData),
			signature: bytesToBase64Url(assertion.response.signature),
			userHandle: assertion.response.userHandle
				? bytesToBase64Url(assertion.response.userHandle)
				: undefined
		}
	};
}

async function runRegistrationCeremony(language) {
	const { mode, options } = await requestJson('/api/auth/passkey/register/options', {
		language
	});

	const credential = await navigator.credentials.create({
		publicKey: {
			...options,
			challenge: base64UrlToBytes(options.challenge),
			user: { ...options.user, id: base64UrlToBytes(options.user.id) },
			excludeCredentials: (options.excludeCredentials || []).map((entry) => ({
				...entry,
				id: base64UrlToBytes(entry.id)
			}))
		}
	});

	if (!credential) {
		throw new Error('Passkey creation was cancelled');
	}

	return { mode, response: registrationResponseJson(credential) };
}

async function applySignedInUser(data) {
	const resolvedUser = data?.user || null;
	if (resolvedUser) {
		user.set(resolvedUser);
		await syncAfterLogin();
	}
	return resolvedUser;
}

/** New account, created by the passkey alone. */
export async function createAccountWithPasskey({ language = 'english' } = {}) {
	track('auth:passkey-signup-start');
	try {
		const { response } = await runRegistrationCeremony(language);
		const data = await requestJson('/api/auth/passkey/register/verify', { response });
		const resolvedUser = await applySignedInUser(data);
		track('auth:passkey-signup-success', { deviceType: data?.mode || 'signup' });
		return resolvedUser;
	} catch (error) {
		track('auth:passkey-signup-failure', { reason: passkeyErrorReason(error) });
		throw error;
	}
}

/** Sign in with any passkey already registered for this site. */
export async function signInWithPasskey() {
	track('auth:passkey-login-start');
	try {
		const { options } = await requestJson('/api/auth/passkey/login/options', {});
		const assertion = await navigator.credentials.get({
			publicKey: {
				...options,
				challenge: base64UrlToBytes(options.challenge),
				allowCredentials: (options.allowCredentials || []).map((entry) => ({
					...entry,
					id: base64UrlToBytes(entry.id)
				}))
			}
		});

		if (!assertion) {
			throw new Error('Passkey sign-in was cancelled');
		}

		const data = await requestJson('/api/auth/passkey/login/verify', {
			response: assertionResponseJson(assertion)
		});
		const resolvedUser = await applySignedInUser(data);
		track('auth:passkey-login-success');
		return resolvedUser;
	} catch (error) {
		track('auth:passkey-login-failure', { reason: passkeyErrorReason(error) });
		throw error;
	}
}

/** Add another passkey to the account that is already signed in. */
export async function addPasskeyToAccount({ language = 'english' } = {}) {
	track('auth:passkey-add-start');
	try {
		const { response } = await runRegistrationCeremony(language);
		const data = await requestJson('/api/auth/passkey/register/verify', { response });
		track('auth:passkey-add-success');
		return data;
	} catch (error) {
		track('auth:passkey-add-failure', { reason: passkeyErrorReason(error) });
		throw error;
	}
}

export async function fetchPasskeys() {
	const response = await fetch('/api/auth/passkey/list', {
		cache: 'no-store',
		headers: getClientHeaders()
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		const error = new Error(data?.error || 'Unable to load passkeys');
		error.code = data?.code || 'PASSKEY_LIST_ERROR';
		error.status = response.status;
		throw error;
	}
	return {
		passkeys: data?.passkeys || [],
		googleLinked: Boolean(data?.googleLinked),
		googleEmail: data?.googleEmail || null
	};
}

export async function removePasskey(passkeyId) {
	const data = await requestJson('/api/auth/passkey/remove', { id: passkeyId });
	track('auth:passkey-remove');
	return data;
}
