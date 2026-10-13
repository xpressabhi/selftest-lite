import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// SvelteKit 3 resolves environment variables per build (src/env.js), so each
// test loads the module with its own validated env values instead of mutating
// a dynamic env object at runtime.
async function loadAdminAuth(overrides = {}) {
	vi.resetModules();
	vi.doMock('$app/env/private', () => ({
		ADMIN_USERNAME: 'admin',
		ADMIN_PASSWORD: 'hunter2',
		ADMIN_SESSION_SECRET: '',
		...overrides,
	}));
	return import('./adminAuth');
}

const NOW = 1_700_000_000_000;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('verifyAdminCredentials', () => {
	it('accepts correct credentials', async () => {
		const { verifyAdminCredentials } = await loadAdminAuth();
		expect(verifyAdminCredentials('admin', 'hunter2')).toBe(true);
	});

	it('rejects wrong credentials', async () => {
		const { verifyAdminCredentials } = await loadAdminAuth();
		expect(verifyAdminCredentials('admin', 'wrong')).toBe(false);
		expect(verifyAdminCredentials('root', 'hunter2')).toBe(false);
	});

	it('rejects when admin is not configured', async () => {
		const { verifyAdminCredentials, isAdminConfigured } = await loadAdminAuth({
			ADMIN_USERNAME: '',
			ADMIN_PASSWORD: '',
		});
		expect(verifyAdminCredentials('', '')).toBe(false);
		expect(isAdminConfigured()).toBe(false);
	});

	it('is configured when credentials exist', async () => {
		const { isAdminConfigured } = await loadAdminAuth();
		expect(isAdminConfigured()).toBe(true);
	});
});

describe('session tokens', () => {
	it('creates a token that verifies', async () => {
		const { createSessionToken, verifySessionToken } = await loadAdminAuth();
		const token = createSessionToken(NOW);
		expect(verifySessionToken(token)).toBe(true);
	});

	it('rejects expired tokens', async () => {
		const { ADMIN_SESSION_TTL_MS, createSessionToken, verifySessionToken } =
			await loadAdminAuth();
		const token = createSessionToken(NOW);
		vi.setSystemTime(NOW + ADMIN_SESSION_TTL_MS + 1);
		expect(verifySessionToken(token)).toBe(false);
	});

	it('rejects tampered tokens', async () => {
		const { ADMIN_SESSION_TTL_MS, createSessionToken, verifySessionToken } =
			await loadAdminAuth();
		const token = createSessionToken(NOW);
		const [, signature] = token.split('.');
		const tamperedBody = Buffer.from(
			JSON.stringify({ exp: NOW + ADMIN_SESSION_TTL_MS * 10 })
		).toString('base64url');
		expect(verifySessionToken(`${tamperedBody}.${signature}`)).toBe(false);
		expect(verifySessionToken('garbage')).toBe(false);
		expect(verifySessionToken('')).toBe(false);
	});

	it('invalidates tokens when the password rotates', async () => {
		const before = await loadAdminAuth();
		const token = before.createSessionToken(NOW);
		const after = await loadAdminAuth({ ADMIN_PASSWORD: 'new-password' });
		expect(after.verifySessionToken(token)).toBe(false);
	});

	it('uses the session secret when configured', async () => {
		const before = await loadAdminAuth({ ADMIN_SESSION_SECRET: 'stable-secret' });
		const token = before.createSessionToken(NOW);
		const after = await loadAdminAuth({
			ADMIN_PASSWORD: 'rotated',
			ADMIN_SESSION_SECRET: 'stable-secret',
		});
		expect(after.verifySessionToken(token)).toBe(true);
	});
});

describe('getAdminTokenFromRequest', () => {
	it('extracts the admin cookie from the header', async () => {
		const { ADMIN_COOKIE_NAME, getAdminTokenFromRequest } = await loadAdminAuth();
		const request = {
			headers: new Headers({
				cookie: `other=1; ${ADMIN_COOKIE_NAME}=abc.123; lang=en`,
			}),
		};
		expect(getAdminTokenFromRequest(request)).toBe('abc.123');
	});

	it('returns null when the cookie is missing', async () => {
		const { getAdminTokenFromRequest } = await loadAdminAuth();
		const request = { headers: new Headers({ cookie: 'other=1' }) };
		expect(getAdminTokenFromRequest(request)).toBeNull();
	});
});
