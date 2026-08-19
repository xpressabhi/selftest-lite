// Google Sign-In client state and API calls. SSR-safe: everything touching
// window/fetch is guarded. The server keeps the session in an httpOnly cookie;
// this module only mirrors `user` into a store for the UI.

import { writable } from 'svelte/store';
import { getClientHeaders } from './identity';
import { flushPendingAttempts, hydrateHistoryFromServer, hydrateUserState } from './sync';

export const user = writable(null);
export const isAuthLoading = writable(true);

export const isNativeApp =
	typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true;

async function fetchJson(url, options = {}) {
	const response = await fetch(url, {
		cache: 'no-store',
		...options,
		headers: {
			...getClientHeaders(),
			...(options.headers || {}),
		},
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		const error = new Error(data?.error || 'Request failed');
		error.status = response.status;
		error.data = data;
		throw error;
	}
	return data;
}

/**
 * Best-effort, ordered post-login sync. Locally-graded attempts must be
 * pushed (POST) BEFORE server history is pulled (GET); firing them
 * concurrently can let the GET resolve before the POST is persisted, so the
 * freshly pushed attempts would be missing from the hydrated history.
 */
async function syncAfterLogin() {
	await flushPendingAttempts().catch(() => {});
	await hydrateHistoryFromServer().catch(() => {});
	await hydrateUserState().catch(() => {});
}

export async function refreshSession() {
	isAuthLoading.set(true);
	try {
		const data = await fetchJson('/api/auth/me');
		const resolvedUser = data?.user || null;
		user.set(resolvedUser);
		if (resolvedUser) {
			// Pull server-side history so pre-login work is immediately visible.
			void syncAfterLogin();
		}
		return resolvedUser;
	} catch (error) {
		if (error?.status !== 401) {
			console.error('Failed to refresh auth session:', error);
		}
		user.set(null);
		return null;
	} finally {
		isAuthLoading.set(false);
	}
}

export async function loginWithGoogleCredential(credential) {
	const data = await fetchJson('/api/auth/google', {
		method: 'POST',
		body: JSON.stringify({ credential }),
	});
	const resolvedUser = data?.user || null;
	user.set(resolvedUser);
	if (resolvedUser) {
		// Attribute pre-login attempts stored locally to the new account and
		// pull server history + bookmarks so everything is immediately visible.
		await syncAfterLogin();
	}
	return resolvedUser;
}

export async function logout() {
	try {
		await fetchJson('/api/auth/logout', { method: 'POST' });
	} catch (error) {
		console.error('Failed to call logout endpoint:', error);
	} finally {
		if (typeof window !== 'undefined' && window.google?.accounts?.id?.disableAutoSelect) {
			window.google.accounts.id.disableAutoSelect();
		}
		user.set(null);
	}
}

/**
 * Handles the GIS `ux_mode: 'redirect'` return: the id_token arrives in the
 * URL fragment (#id_token=...). Consumes it, strips it from the URL and
 * exchanges it for a server session. Needed on the Capacitor Android app
 * where popup-based sign-in is unreliable in the WebView.
 */
export async function handleAuthRedirect() {
	if (typeof window === 'undefined') {
		return;
	}

	const hash = window.location.hash || '';
	let idToken = null;
	if (hash.startsWith('#id_token=')) {
		idToken = hash.slice('#id_token='.length);
	} else if (hash.includes('id_token=')) {
		const match = hash.match(/[#&]id_token=([^&]+)/);
		idToken = match?.[1] || null;
	}

	if (!idToken || !idToken.trim()) {
		return;
	}

	try {
		window.history.replaceState(null, '', window.location.pathname + window.location.search);
		await loginWithGoogleCredential(decodeURIComponent(idToken));
	} catch (error) {
		console.error('Google sign-in redirect handling failed:', error);
	}
}
