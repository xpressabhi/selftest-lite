import { isAdminConfigured, isAdminRequest } from './adminAuth.js';
import { ensureStorageSchema, normalizeUserIdValue, query } from './storage.js';

export const PREMIUM_FEATURE_EXAM_PAPER = 'exam-paper';
const VALID_FEATURES = new Set([PREMIUM_FEATURE_EXAM_PAPER]);
const MAX_NOTES_LENGTH = 200;

export function isPremiumFeature(feature) {
	return VALID_FEATURES.has(feature);
}

/**
 * Premium access = an active admin session, or a signed-in user holding an
 * active, unexpired entitlement. Everything else is denied; payments are a
 * later provider integration behind this same seam.
 */
export async function hasPremiumAccess(
	request,
	{ userId = null, feature = PREMIUM_FEATURE_EXAM_PAPER } = {}
) {
	if (isAdminConfigured() && isAdminRequest(request)) {
		return { allowed: true, reason: 'admin' };
	}
	const normalizedUserId = normalizeUserIdValue(userId);
	if (!normalizedUserId) {
		return { allowed: false, reason: 'signed-out' };
	}
	await ensureStorageSchema();
	const result = await query(
		`SELECT 1
		 FROM premium_entitlements
		 WHERE user_id = $1
		   AND feature = $2
		   AND status = 'active'
		   AND (expires_at IS NULL OR expires_at > NOW())
		 LIMIT 1`,
		[normalizedUserId, feature]
	);
	return result.rows.length > 0
		? { allowed: true, reason: 'entitlement' }
		: { allowed: false, reason: 'no-entitlement' };
}

/** Admin view: every grant, revoked ones included (rows are never deleted). */
export async function listPremiumEntitlements({ limit = 200 } = {}) {
	await ensureStorageSchema();
	const result = await query(
		`SELECT e.id, e.user_id, e.feature, e.status, e.granted_by, e.granted_at, e.expires_at,
		        e.notes, u.email, u.name
		 FROM premium_entitlements e
		 LEFT JOIN app_user u ON u.id = e.user_id
		 ORDER BY e.granted_at DESC
		 LIMIT $1`,
		[Math.min(Math.max(Number(limit) || 200, 1), 500)]
	);
	return result.rows;
}

/**
 * Grants (or re-activates) access for a signed-in user identified by email.
 * Granting keeps exactly one row per (user, feature); revocation flips status.
 */
export async function grantPremiumEntitlement({
	email,
	feature = PREMIUM_FEATURE_EXAM_PAPER,
	grantedBy = 'admin',
	expiresAt = null,
	notes = null,
}) {
	if (!isPremiumFeature(feature)) {
		return { ok: false, code: 'INVALID_FEATURE' };
	}
	const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
	if (!normalizedEmail) {
		return { ok: false, code: 'EMAIL_REQUIRED' };
	}
	const expiry = expiresAt ? new Date(expiresAt) : null;
	if (expiry && Number.isNaN(expiry.getTime())) {
		return { ok: false, code: 'INVALID_EXPIRY' };
	}
	await ensureStorageSchema();
	const userResult = await query(`SELECT id FROM app_user WHERE lower(email) = $1 LIMIT 1`, [
		normalizedEmail,
	]);
	const user = userResult.rows[0];
	if (!user) {
		return { ok: false, code: 'USER_NOT_FOUND' };
	}
	await query(
		`INSERT INTO premium_entitlements (user_id, feature, granted_by, expires_at, notes, status)
		 VALUES ($1, $2, $3, $4, $5, 'active')
		 ON CONFLICT (user_id, feature) DO UPDATE
		   SET status = 'active',
		       granted_by = EXCLUDED.granted_by,
		       granted_at = NOW(),
		       expires_at = EXCLUDED.expires_at,
		       notes = EXCLUDED.notes`,
		[
			user.id,
			feature,
			String(grantedBy || 'admin').slice(0, 80),
			expiry ? expiry.toISOString() : null,
			notes ? String(notes).slice(0, MAX_NOTES_LENGTH) : null,
		]
	);
	return { ok: true, userId: user.id };
}

export async function revokePremiumEntitlement({
	userId,
	feature = PREMIUM_FEATURE_EXAM_PAPER,
}) {
	const normalizedUserId = normalizeUserIdValue(userId);
	if (!normalizedUserId) {
		return { ok: false, code: 'INVALID_USER' };
	}
	await ensureStorageSchema();
	const result = await query(
		`UPDATE premium_entitlements
		 SET status = 'revoked'
		 WHERE user_id = $1 AND feature = $2 AND status = 'active'`,
		[normalizedUserId, feature]
	);
	return { ok: true, revoked: result.rowCount || 0 };
}
