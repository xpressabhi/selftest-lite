import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const envState = {
	ADMIN_USERNAME: 'admin',
	ADMIN_PASSWORD: 'hunter2',
	ADMIN_SESSION_SECRET: '',
};

vi.mock('$env/dynamic/private', () => ({
	env: envState,
}));

const {
	ADMIN_COOKIE_NAME,
	ADMIN_SESSION_TTL_MS,
	createSessionToken,
	getAdminTokenFromRequest,
	isAdminConfigured,
	verifyAdminCredentials,
	verifySessionToken,
} = await import('./adminAuth');

const NOW = 1_700_000_000_000;

beforeEach(() => {
	Object.assign(envState, {
		ADMIN_USERNAME: 'admin',
		ADMIN_PASSWORD: 'hunter2',
		ADMIN_SESSION_SECRET: '',
	});
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('verifyAdminCredentials', () => {
	it('accepts correct credentials', () => {
		expect(verifyAdminCredentials('admin', 'hunter2')).toBe(true);
	});

	it('rejects wrong credentials', () => {
		expect(verifyAdminCredentials('admin', 'wrong')).toBe(false);
		expect(verifyAdminCredentials('root', 'hunter2')).toBe(false);
	});

	it('rejects when admin is not configured', () => {
		envState.ADMIN_USERNAME = '';
		envState.ADMIN_PASSWORD = '';
		expect(verifyAdminCredentials('', '')).toBe(false);
		expect(isAdminConfigured()).toBe(false);
	});

	it('is configured when credentials exist', () => {
		expect(isAdminConfigured()).toBe(true);
	});
});

describe('session tokens', () => {
	it('creates a token that verifies', () => {
		const token = createSessionToken(NOW);
		expect(verifySessionToken(token)).toBe(true);
	});

	it('rejects expired tokens', () => {
		const token = createSessionToken(NOW);
		vi.setSystemTime(NOW + ADMIN_SESSION_TTL_MS + 1);
		expect(verifySessionToken(token)).toBe(false);
	});

	it('rejects tampered tokens', () => {
		const token = createSessionToken(NOW);
		const [, signature] = token.split('.');
		const tamperedBody = Buffer.from(
			JSON.stringify({ exp: NOW + ADMIN_SESSION_TTL_MS * 10 }),
		).toString('base64url');
		expect(verifySessionToken(`${tamperedBody}.${signature}`)).toBe(false);
		expect(verifySessionToken('garbage')).toBe(false);
		expect(verifySessionToken('')).toBe(false);
	});

	it('invalidates tokens when the password rotates', () => {
		const token = createSessionToken(NOW);
		envState.ADMIN_PASSWORD = 'new-password';
		expect(verifySessionToken(token)).toBe(false);
	});

	it('uses the session secret when configured', () => {
		envState.ADMIN_SESSION_SECRET = 'stable-secret';
		const token = createSessionToken(NOW);
		envState.ADMIN_PASSWORD = 'rotated';
		expect(verifySessionToken(token)).toBe(true);
	});
});

describe('getAdminTokenFromRequest', () => {
	it('extracts the admin cookie from the header', () => {
		const request = {
			headers: new Headers({
				cookie: `other=1; ${ADMIN_COOKIE_NAME}=abc.123; lang=en`,
			}),
		};
		expect(getAdminTokenFromRequest(request)).toBe('abc.123');
	});

	it('returns null when the cookie is missing', () => {
		const request = { headers: new Headers({ cookie: 'other=1' }) };
		expect(getAdminTokenFromRequest(request)).toBeNull();
	});
});
