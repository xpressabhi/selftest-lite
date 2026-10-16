import { getExplainerBySlug } from './explainerCache.js';
import { ensureStorageSchema, normalizeUserIdValue, query } from './storage.js';
import { buildVisitIdentityKey, normalizeClientId } from './visitIdentity.js';

/**
 * Records (or refreshes) one identity's visit to a cached explainer. Returns
 * false when there is no identity to record; the count still answers.
 */
export async function recordExplainerVisit({ cacheKey, userId = null, clientId = null }) {
	const identityKey = buildVisitIdentityKey({ userId, clientId });
	if (!cacheKey || !identityKey) {
		return false;
	}
	await ensureStorageSchema();
	const result = await query(
		`INSERT INTO explainer_visits (cache_key, identity_key, user_id, client_id)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (cache_key, identity_key) DO UPDATE
		   SET last_seen_at = NOW()`,
		[cacheKey, identityKey, normalizeUserIdValue(userId), normalizeClientId(clientId)]
	);
	return (result.rowCount || 0) > 0;
}

/**
 * Public stats for one explainer page: resolves the slug, records the viewer's
 * own visit first (best-effort, so the count includes them), then counts
 * distinct identities. Returns null when the slug is unknown.
 */
export async function getExplainerStats({ slug, userId = null, clientId = null } = {}) {
	const row = await getExplainerBySlug(slug);
	if (!row) {
		return null;
	}
	try {
		await recordExplainerVisit({ cacheKey: row.cache_key, userId, clientId });
	} catch {
		// Bookkeeping is best-effort; the count below still answers.
	}
	const result = await query(
		`SELECT COUNT(*)::INTEGER AS visitors FROM explainer_visits WHERE cache_key = $1`,
		[row.cache_key]
	);
	return { visitors: Number(result.rows[0]?.visitors || 0) };
}
