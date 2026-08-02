import { createHmac, timingSafeEqual } from 'crypto';
import { env } from '$env/dynamic/private';

export const ADMIN_COOKIE_NAME = 'selftest_admin';
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function getCredentials() {
	return {
		username: env.ADMIN_USERNAME || '',
		password: env.ADMIN_PASSWORD || '',
	};
}

export function isAdminConfigured() {
	const { username, password } = getCredentials();
	return Boolean(username && password);
}

function sessionSecret() {
	if (env.ADMIN_SESSION_SECRET) {
		return env.ADMIN_SESSION_SECRET;
	}
	// Derive a stable secret from the credentials so sessions are invalidated
	// when the password rotates, without requiring an extra env var.
	const { username, password } = getCredentials();
	return createHmac('sha256', 'selftest-admin-session')
		.update(`${username}:${password}`)
		.digest('hex');
}

function safeEqual(left, right) {
	const leftBuffer = Buffer.from(String(left));
	const rightBuffer = Buffer.from(String(right));
	if (leftBuffer.length !== rightBuffer.length) {
		return false;
	}
	return timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyAdminCredentials(username, password) {
	const { username: expectedUser, password: expectedPass } = getCredentials();
	if (!expectedUser || !expectedPass) {
		return false;
	}
	return (
		safeEqual(username, expectedUser) && safeEqual(password, expectedPass)
	);
}

export function createSessionToken(now = Date.now()) {
	const payload = { exp: now + ADMIN_SESSION_TTL_MS };
	const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const signature = createHmac('sha256', sessionSecret())
		.update(body)
		.digest('base64url');
	return `${body}.${signature}`;
}

export function verifySessionToken(token) {
	if (!token || typeof token !== 'string') {
		return false;
	}
	const [body, signature] = token.split('.');
	if (!body || !signature) {
		return false;
	}
	const expected = createHmac('sha256', sessionSecret())
		.update(body)
		.digest('base64url');
	if (!safeEqual(signature, expected)) {
		return false;
	}
	try {
		const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
		return typeof payload.exp === 'number' && payload.exp > Date.now();
	} catch {
		return false;
	}
}

export function getAdminTokenFromRequest(request) {
	const cookieHeader = request.headers.get('cookie') || '';
	for (const part of cookieHeader.split(';')) {
		const [name, ...rest] = part.trim().split('=');
		if (name === ADMIN_COOKIE_NAME) {
			return rest.join('=') || null;
		}
	}
	return null;
}

export function isAdminRequest(request) {
	if (!isAdminConfigured()) {
		return false;
	}
	const token = getAdminTokenFromRequest(request);
	return Boolean(token && verifySessionToken(token));
}
