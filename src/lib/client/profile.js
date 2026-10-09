// Client-side user profile state: a normalized profile mirroring the server
// copy (through the synced app_user_state key) plus computed insights used
// for the home-page prefill and the /profile page transparency view.

import { writable } from 'svelte/store';
import { getClientHeaders } from './identity';
import { emitLocalStorageChange, readJson, removeKey, writeJson } from './storage';
import { STORAGE_KEYS } from './constants';
import { createDefaultProfile, normalizeProfile } from '../shared/userProfile';

export const profile = writable(null);
export const profileInsights = writable(null);

export function readLocalProfile() {
	const stored = readJson(STORAGE_KEYS.USER_PROFILE, null);
	return normalizeProfile(stored);
}

export function writeLocalProfile(profileValue) {
	if (profileValue === null || profileValue === undefined) {
		removeKey(STORAGE_KEYS.USER_PROFILE);
		return;
	}
	writeJson(STORAGE_KEYS.USER_PROFILE, profileValue);
}

/**
 * Refreshes the profile from the server; falls back to the local copy (and
 * the default) when the network is unavailable. Safe for anonymous users.
 */
export async function fetchProfile() {
	let nextProfile = readLocalProfile() || createDefaultProfile();
	try {
		const response = await fetch('/api/user/profile', {
			method: 'GET',
			headers: getClientHeaders(),
		});
		if (response.ok) {
			const data = await response.json();
			const serverProfile = normalizeProfile(data?.profile);
			if (serverProfile) {
				nextProfile = serverProfile;
				writeLocalProfile(nextProfile);
			} else if (data?.profile === null) {
				nextProfile = null;
			}
		}
	} catch (error) {
		console.error('Failed to fetch user profile:', error);
	}
	profile.set(nextProfile);
	return nextProfile;
}

/**
 * Saves the profile locally and to the server.
 *
 * `displayName` is account data rather than profile data, but it is saved in the
 * same request so one Save button covers the whole form. The server's answer is
 * reported to the caller instead of being swallowed: a rejected name must not
 * look like a successful save.
 *
 * Returns `{ profile, user, error, code }` — `profile` is the normalized profile
 * that was written locally, `user` is the updated account (null unless the name
 * changed), and `error`/`code` describe a server or network failure.
 */
export async function saveProfile(next, { displayName } = {}) {
	const normalized = normalizeProfile({
		...next,
		updatedAt: new Date().toISOString(),
	});
	if (!normalized) {
		return { profile: null, user: null, error: null, code: null };
	}
	writeLocalProfile(normalized);
	profile.set(normalized);
	emitLocalStorageChange(STORAGE_KEYS.USER_PROFILE);
	try {
		const payload = { profile: normalized };
		if (typeof displayName === 'string') {
			payload.displayName = displayName;
		}
		const response = await fetch('/api/user/profile', {
			method: 'POST',
			headers: getClientHeaders(),
			body: JSON.stringify(payload),
		});
		const data = await response.json().catch(() => ({}));
		if (!response.ok) {
			return {
				profile: normalized,
				user: null,
				error: data?.error || 'Failed to save user profile',
				code: data?.code || 'PROFILE_UPDATE_ERROR',
			};
		}
		return { profile: normalized, user: data?.user || null, error: null, code: null };
	} catch (error) {
		console.error('Profile save failed (kept locally):', error);
		return { profile: normalized, user: null, error: 'offline', code: 'OFFLINE' };
	}
}

/** Clears the profile entirely (opt-out reset); history is untouched. */
export async function resetProfile() {
	removeKey(STORAGE_KEYS.USER_PROFILE);
	profile.set(null);
	profileInsights.set(null);
	emitLocalStorageChange(STORAGE_KEYS.USER_PROFILE);
	try {
		await fetch('/api/user/profile', {
			method: 'DELETE',
			headers: getClientHeaders(),
		});
	} catch (error) {
		console.error('Profile reset failed (cleared locally):', error);
	}
}

/** Fetches computed learner signals for the profile page / home prefill. */
export async function fetchProfileInsights() {
	try {
		const response = await fetch('/api/user/profile/insights', {
			method: 'GET',
			headers: getClientHeaders(),
		});
		if (!response.ok) {
			throw new Error('Failed to fetch profile insights');
		}
		const data = await response.json();
		profileInsights.set(data);
		return data;
	} catch (error) {
		console.error('Failed to fetch profile insights:', error);
		profileInsights.set(null);
		return null;
	}
}
