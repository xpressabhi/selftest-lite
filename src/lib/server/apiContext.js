import { getAuthenticatedUser, getClientIdFromRequest } from './auth';
import { getClientKey } from './storage';

/**
 * The identity + timing prelude every API handler repeats: request start time,
 * anonymous client key, the signed-in user (when any) and the stable browser
 * client id. Routes keep their own authorization; this only gathers facts.
 */
export async function resolveRequestContext(request, cookies) {
	// Resolve the user before the client key so a signed-in caller buckets per
	// account rather than per address: users behind one office NAT or a carrier
	// CGNAT range would otherwise share a single rate-limit bucket.
	const user = await getAuthenticatedUser(cookies);
	return {
		startedAt: Date.now(),
		clientKey: getClientKey(request, user?.id ?? null),
		user,
		clientId: getClientIdFromRequest(request),
	};
}
