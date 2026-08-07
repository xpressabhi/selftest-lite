// Stable anonymous identity for a browser/device. Persisted in localStorage
// so every request (telemetry, submissions, auth) can be attributed to the
// same visitor before and after Google Sign-In. On login the server backfills
// `user_id` onto all rows carrying this `client_id`, which is what makes the
// pre-login → post-login transition seamless.

export const CLIENT_ID_STORAGE_KEY = 'selftest_client_id';
export const CLIENT_ID_HEADER = 'x-client-id';

let cachedClientId = null;

function generateClientId() {
	try {
		if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
			return `c-${crypto.randomUUID()}`;
		}
	} catch {
		// Fall through to the manual generator below.
	}
	const randomPart = Math.random().toString(36).slice(2, 12);
	const timePart = Date.now().toString(36);
	return `c-${timePart}-${randomPart}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getClientId() {
	if (cachedClientId) {
		return cachedClientId;
	}
	if (typeof window === 'undefined') {
		return '';
	}

	try {
		const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
		if (existing && existing.length >= 8 && existing.length <= 64) {
			cachedClientId = existing;
			return existing;
		}
	} catch {
		// localStorage unavailable; fall back to a session-scoped id.
	}

	cachedClientId = generateClientId();
	try {
		window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, cachedClientId);
	} catch {
		// Best-effort persistence only.
	}
	return cachedClientId;
}

/**
 * Headers to attach to API calls so the server can attribute activity.
 * Always includes the anonymous client id; the session cookie is sent
 * automatically by the browser.
 */
export function getClientHeaders() {
	const headers = {
		'Content-Type': 'application/json',
	};
	const clientId = getClientId();
	if (clientId) {
		headers[CLIENT_ID_HEADER] = clientId;
	}
	return headers;
}
