import { normalizeUserIdValue } from './storage.js';

const MIN_CLIENT_ID_LENGTH = 8;

/** Trims and bounds a client-supplied device id; too-short values are noise. */
export function normalizeClientId(value) {
	return typeof value === 'string' && value.trim().length >= MIN_CLIENT_ID_LENGTH
		? value.trim().slice(0, 64)
		: null;
}

/**
 * Stable per-surface identity: signed-in users are keyed by their account so
 * visits survive a device change; anonymous visitors by the device id.
 */
export function buildVisitIdentityKey({ userId = null, clientId = null } = {}) {
	const normalizedUserId = normalizeUserIdValue(userId);
	if (normalizedUserId) {
		return `u:${normalizedUserId}`;
	}
	const normalizedClientId = normalizeClientId(clientId);
	return normalizedClientId ? `c:${normalizedClientId}` : null;
}
