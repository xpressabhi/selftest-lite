import { createHash } from 'node:crypto';

/**
 * Identity for rate-limit buckets and the telemetry `client_key` column.
 *
 * This must be a function of what the *server* observed, never of a header the
 * caller chooses. It used to hash `x-forwarded-for` + `User-Agent`, and because
 * both are client-supplied, rotating `User-Agent` minted a fresh bucket per
 * request: every limit in the app — including the 5/min on the admin password
 * and the ceiling on metered model calls — was one header away from gone.
 * Key derivation now uses the adapter-observed peer address plus the
 * server-derived user id, and `User-Agent` is gone.
 */

// SvelteKit exposes getClientAddress() on the request *event*, not on the raw
// Request that handlers pass around. The server hook records the
// adapter-resolved address here for the lifetime of the request, so
// getClientKey(request) resolves the real peer from anywhere in the request
// flow. Keyed by the Request object, so entries vanish with the request.
const addressByRequest = new WeakMap();

/**
 * Normalizes an adapter-resolved address. Proxies that append to
 * `x-forwarded-for` leave the peer observed by the nearest (trusted) edge as
 * the last entry, so a caller cannot rotate buckets by prefixing a fake one.
 */
function normalizeAddress(value) {
	if (typeof value !== 'string') {
		return '';
	}
	const entries = value.split(',');
	return (entries[entries.length - 1] || '').trim();
}

/**
 * Records the peer address for a request. Called from hooks.server.js before
 * the route handler runs; never throws (a limiter must not 500 because an
 * adapter cannot report an address).
 */
export function rememberClientAddress(request, address) {
	if (!request || typeof request !== 'object') {
		return;
	}
	const normalized = normalizeAddress(address);
	if (normalized) {
		addressByRequest.set(request, normalized);
	}
}

/**
 * The peer address as resolved by the adapter. Returns 'unknown' when the
 * adapter cannot supply one — SvelteKit throws from `getClientAddress()` in
 * that case, and a limiter must not 500. Collapsing to one shared bucket is
 * the deliberately fail-safe direction: stricter than intended, never looser.
 */
export function getClientIp(request) {
	try {
		const address = normalizeAddress(String(request?.getClientAddress?.() ?? ''));
		if (address) {
			return address;
		}
	} catch {
		// Adapter does not expose the peer address.
	}
	if (request && typeof request === 'object') {
		const remembered = addressByRequest.get(request);
		if (remembered) {
			return remembered;
		}
	}
	return 'unknown';
}

/**
 * @param {Request} request
 * @param {number|null} [userId] server-derived session user id, when signed in.
 *   Present, the bucket is per-account so users sharing an address (office NAT,
 *   a mobile carrier CGNAT range) do not throttle each other. It is server-side,
 *   so it cannot be rotated by the caller the way a header can.
 */
export function getClientKey(request, userId = null) {
	const accountId = Number.isInteger(userId) && userId > 0 ? userId : null;
	const material = accountId ? `u:${accountId}` : `ip:${getClientIp(request)}`;
	return createHash('sha256').update(material).digest('hex').slice(0, 40);
}
