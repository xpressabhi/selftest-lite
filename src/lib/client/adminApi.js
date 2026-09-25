// Shared client contract for the admin API (`/api/admin/*`).

/**
 * Returned by `adminFetch` when the server answers 401 and `onUnauthorized`
 * is provided, so callers can bail out without touching their state.
 */
export const ADMIN_UNAUTHORIZED = Symbol('adminUnauthorized');

/**
 * Fetches an admin API path using the dashboard's shared response contract:
 * non-OK responses throw `Error(data.error || fallbackError)` and successes
 * resolve the parsed JSON body (`{}` when the body is not JSON).
 *
 * A 401 only signs the session out when `onUnauthorized` is passed, because
 * some endpoints (notably login) treat 401 as a normal, displayable failure.
 */
export async function adminFetch(
	path,
	{ fallbackError = 'Request failed', onUnauthorized, ...options } = {}
) {
	const response = await fetch(path, options);
	if (onUnauthorized && response.status === 401) {
		onUnauthorized();
		return ADMIN_UNAUTHORIZED;
	}
	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(data.error || fallbackError);
	}
	return data;
}
