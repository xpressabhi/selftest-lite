import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginWithGoogleCredential } from './auth.js';
import { STORAGE_KEYS } from './constants.js';

function installBrowserGlobals() {
	const store = new Map();
	vi.stubGlobal('window', {
		localStorage: {
			getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
			setItem: vi.fn((key, value) => store.set(key, String(value))),
			removeItem: vi.fn((key) => store.delete(key)),
		},
		addEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	});
	vi.stubGlobal('navigator', { onLine: true });
}

function removeBrowserGlobals() {
	vi.unstubAllGlobals();
}

function jsonResponse(body, ok = true) {
	return {
		ok,
		status: ok ? 200 : 500,
		json: () => Promise.resolve(body),
	};
}

describe('auth (post-login history sync)', () => {
	beforeEach(() => {
		installBrowserGlobals();
		// Seed one queued locally-graded attempt so the flush actually POSTs.
		window.localStorage.setItem(
			STORAGE_KEYS.PENDING_ATTEMPTS,
			JSON.stringify([
				{
					testId: 42,
					userAnswers: { '0': 'A' },
					score: 1,
					totalQuestions: 1,
					timeTaken: 10,
					submittedAt: '2026-08-01T10:00:00.000Z',
				},
			]),
		);
	});

	afterEach(() => {
		removeBrowserGlobals();
	});

	it('waits for the pending-attempt flush before hydrating history', async () => {
		let resolveHistoryPost;
		const historyPostPromise = new Promise((resolve) => {
			resolveHistoryPost = resolve;
		});
		const calls = [];
		vi.stubGlobal(
			'fetch',
			vi.fn((url, options = {}) => {
				const method = options.method || 'GET';
				calls.push(`${method} ${url}`);
				if (url === '/api/auth/google') {
					return Promise.resolve(jsonResponse({ user: { id: 1, name: 'Test' } }));
				}
				if (url === '/api/user/history' && method === 'POST') {
					// Deferred: simulates a slow push while the GET would race ahead.
					return historyPostPromise.then(() =>
						jsonResponse({ success: true }),
					);
				}
				if (url === '/api/user/history') {
					return Promise.resolve(jsonResponse({ attempts: [] }));
				}
				if (url === '/api/user/state') {
					return Promise.resolve(jsonResponse({ storage: {} }));
				}
				return Promise.resolve(jsonResponse({ error: 'not found' }, false));
			}),
		);

		const loginPromise = loginWithGoogleCredential('fake-credential');

		// Give the login a tick to reach the sync phase; the hydrate GET must
		// not fire while the flush POST is still in flight.
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(calls).toEqual(['POST /api/auth/google', 'POST /api/user/history']);

		resolveHistoryPost(jsonResponse({ success: true }));
		const resolved = await loginPromise;

		expect(resolved).toEqual({ id: 1, name: 'Test' });
		expect(calls).toEqual([
			'POST /api/auth/google',
			'POST /api/user/history',
			'GET /api/user/history',
			'GET /api/user/state',
		]);
	});

	it('still returns the user when the sync calls fail', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((url) => {
				if (url === '/api/auth/google') {
					return Promise.resolve(jsonResponse({ user: { id: 7 } }));
				}
				return Promise.resolve(jsonResponse({ error: 'down' }, false));
			}),
		);

		const resolved = await loginWithGoogleCredential('fake-credential');
		expect(resolved).toEqual({ id: 7 });
	});
});
