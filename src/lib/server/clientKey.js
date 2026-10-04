import { createHash } from 'node:crypto';

/**
 * Identity for rate-limit buckets and the telemetry `client_key` column.
 *
 * This must be a function of what the *server* observed, never of a header the
 * caller chooses. It used to hash `x-forwarded-for` + `User-Agent`, and because
 * both are client-supplied, rotating `User-Agent` minted a fresh bucket per
 * request: every limit in the app — including the 5/min on the admin password
 * and the ceiling on metered model calls — was one header away from gone.
 * `x-forwarded-for` is the same problem wherever an edge appends rather than
 * replaces the header.
 */

/**
 * The peer address as resolved by the adapter. Returns 'unknown' when the
 * adapter cannot supply one — SvelteKit throws from `getClientAddress()` in that
 * case, and a limiter must not 500. Collapsing to one shared bucket is the
 * deliberately fail-safe direction: stricter than intended, never looser.
 */
export function getClientIp(request) {
	try {
		const address = request?.getClientAddress?.();
		if (address) {
			return String(address);
		}
	} catch {
		// Adapter does not expose the peer address.
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