import { createHash, randomBytes } from 'crypto';
import { ensureStorageSchema, query } from './storage';

export const SESSION_COOKIE_NAME = 'selftest_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const GOOGLE_TOKEN_INFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

function hashSessionToken(rawSessionToken) {
	return createHash('sha256').update(rawSessionToken).digest('hex');
}

function getGoogleClientId() {
	const clientId =
		process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
	if (!clientId) {
		throw new Error('GOOGLE_CLIENT_ID is not configured');
	}
	return clientId;
}

function getSessionCookieOptions(expiresAt) {
	return {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		path: '/',
		expires: expiresAt,
	};
}

function normalizeUserId(value) {
	const parsedValue = Number(value);
	if (Number.isInteger(parsedValue) && parsedValue > 0) {
		return parsedValue;
	}
	return null;
}

function mapUserRow(row) {
	if (!row) {
		return null;
	}

	const normalizedId = normalizeUserId(row.id);
	if (!normalizedId) {
		return null;
	}

	return {
		id: normalizedId,
		googleSub: row.google_sub,
		email: row.email,
		name: row.name,
		pictureUrl: row.picture_url,
		locale: row.locale,
		createdAt: row.created_at,
		lastLoginAt: row.last_login_at,
	};
}

async function cleanupExpiredSessionsMaybe() {
	if (Math.random() >= 0.02) {
		return;
	}

	try {
		await query(
			`DELETE FROM app_user_session WHERE expires_at < NOW() - INTERVAL '7 days'`,
		);
	} catch (error) {
		console.error('Failed to cleanup expired auth sessions:', error);
	}
}

export function setSessionCookie(response, rawSessionToken, expiresAt) {
	if (!rawSessionToken || !expiresAt) {
		return;
	}
	response.cookies.set(
		SESSION_COOKIE_NAME,
		rawSessionToken,
		getSessionCookieOptions(expiresAt),
	);
}

export function clearSessionCookie(response) {
	response.cookies.set(SESSION_COOKIE_NAME, '', {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		path: '/',
		maxAge: 0,
	});
}

export function getRawSessionTokenFromRequest(request) {
	return request.cookies.get(SESSION_COOKIE_NAME)?.value || null;
}

export async function verifyGoogleCredential(credential) {
	if (!credential || typeof credential !== 'string') {
		throw new Error('Google credential is required');
	}

	const expectedClientId = getGoogleClientId();
	const tokenInfoUrl = new URL(GOOGLE_TOKEN_INFO_URL);
	tokenInfoUrl.searchParams.set('id_token', credential);

	const response = await fetch(tokenInfoUrl.toString(), {
		method: 'GET',
		cache: 'no-store',
	});

	if (!response.ok) {
		throw new Error('Invalid Google credential');
	}

	const tokenInfo = await response.json();
	const hasValidIssuer =
		tokenInfo.iss === 'accounts.google.com' ||
		tokenInfo.iss === 'https://accounts.google.com';
	const expiresAtMs = Number(tokenInfo.exp || 0) * 1000;

	if (
		tokenInfo.aud !== expectedClientId ||
		!hasValidIssuer ||
		!tokenInfo.sub ||
		!expiresAtMs ||
		expiresAtMs <= Date.now()
	) {
		throw new Error('Google credential validation failed');
	}

	if (tokenInfo.email_verified !== 'true' || !tokenInfo.email) {
		throw new Error('Google account email is not verified');
	}

	return {
		googleSub: tokenInfo.sub,
		email: tokenInfo.email.toLowerCase(),
		name: tokenInfo.name || tokenInfo.given_name || tokenInfo.email,
		pictureUrl: tokenInfo.picture || null,
		locale: tokenInfo.locale || null,
	};
}

export async function upsertGoogleUser(profile) {
	await ensureStorageSchema();

	// Prefer update-first by either stable Google subject or email.
	// This keeps the same user record even if legacy rows exist.
	const updateResult = await query(
		`UPDATE app_user
		 SET
			google_sub = $1,
			email = $2,
			name = $3,
			picture_url = $4,
			locale = $5,
			last_login_at = NOW(),
			updated_at = NOW()
		 WHERE google_sub = $1 OR email = $2
		 RETURNING id, google_sub, email, name, picture_url, locale, created_at, last_login_at`,
		[
			profile.googleSub,
			profile.email,
			profile.name,
			profile.pictureUrl,
			profile.locale,
		],
	);

	if (updateResult.rows.length > 0) {
		return mapUserRow(updateResult.rows[0]);
	}

	try {
		const insertResult = await query(
			`INSERT INTO app_user
			 (google_sub, email, name, picture_url, locale, last_login_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
			 RETURNING id, google_sub, email, name, picture_url, locale, created_at, last_login_at`,
			[
				profile.googleSub,
				profile.email,
				profile.name,
				profile.pictureUrl,
				profile.locale,
			],
		);

		return mapUserRow(insertResult.rows[0]);
	} catch (error) {
		// Concurrent sign-ins can race on unique constraints; fetch canonical row.
		if (error?.code !== '23505') {
			throw error;
		}

		const fallbackResult = await query(
			`SELECT id, google_sub, email, name, picture_url, locale, created_at, last_login_at
			 FROM app_user
			 WHERE google_sub = $1 OR email = $2
			 ORDER BY updated_at DESC
			 LIMIT 1`,
			[profile.googleSub, profile.email],
		);

		return mapUserRow(fallbackResult.rows[0]);
	}
}

export async function createSessionForUser(userId) {
	await ensureStorageSchema();
	const normalizedUserId = normalizeUserId(userId);
	if (!normalizedUserId) {
		throw new Error('Invalid user id for session');
	}

	const rawSessionToken = randomBytes(32).toString('base64url');
	const sessionTokenHash = hashSessionToken(rawSessionToken);
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

	await query(
		`INSERT INTO app_user_session
		 (user_id, session_token_hash, expires_at, last_seen_at)
		 VALUES ($1, $2, $3, NOW())`,
		[normalizedUserId, sessionTokenHash, expiresAt.toISOString()],
	);

	cleanupExpiredSessionsMaybe();

	return {
		rawSessionToken,
		expiresAt,
	};
}

export async function revokeSessionByToken(rawSessionToken) {
	if (!rawSessionToken) {
		return;
	}

	await ensureStorageSchema();
	const sessionTokenHash = hashSessionToken(rawSessionToken);
	await query(
		`DELETE FROM app_user_session WHERE session_token_hash = $1`,
		[sessionTokenHash],
	);
}

export async function getSessionFromRequest(request, options = {}) {
	const { refresh = false } = options;
	const rawSessionToken = getRawSessionTokenFromRequest(request);
	if (!rawSessionToken) {
		return null;
	}

	await ensureStorageSchema();
	const sessionTokenHash = hashSessionToken(rawSessionToken);

	const result = await query(
		`SELECT
			s.id AS session_id,
			s.expires_at,
			u.id,
			u.google_sub,
			u.email,
			u.name,
			u.picture_url,
			u.locale,
			u.created_at,
			u.last_login_at
		 FROM app_user_session s
		 INNER JOIN app_user u ON u.id = s.user_id
		 WHERE s.session_token_hash = $1
			AND s.expires_at > NOW()
		 LIMIT 1`,
		[sessionTokenHash],
	);

	const row = result.rows[0];
	if (!row) {
		return null;
	}
	const user = mapUserRow(row);
	if (!user) {
		return null;
	}

	let expiresAt = new Date(row.expires_at);
	if (refresh) {
		expiresAt = new Date(Date.now() + SESSION_TTL_MS);
		await query(
			`UPDATE app_user_session
			 SET expires_at = $2, last_seen_at = NOW()
			 WHERE id = $1`,
			[row.session_id, expiresAt.toISOString()],
		);
	}

	cleanupExpiredSessionsMaybe();

	return {
		sessionId: row.session_id,
		rawSessionToken,
		expiresAt,
		user,
	};
}

export async function getAuthenticatedUser(request) {
	const session = await getSessionFromRequest(request, { refresh: false });
	return session?.user || null;
}
