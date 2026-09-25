import { getAuthenticatedUser, getClientIdFromRequest } from './auth';
import { getClientKey } from './storage';

/**
 * The identity + timing prelude every API handler repeats: request start time,
 * anonymous client key, the signed-in user (when any) and the stable browser
 * client id. Routes keep their own authorization; this only gathers facts.
 */
export async function resolveRequestContext(request, cookies) {
	return {
		startedAt: Date.now(),
		clientKey: getClientKey(request),
		user: await getAuthenticatedUser(cookies),
		clientId: getClientIdFromRequest(request),
	};
}
