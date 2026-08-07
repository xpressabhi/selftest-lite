// Client ↔ server history sync.
//
// - Submissions made through /api/test/submit are already persisted
//   server-side; this module adds best-effort pushes for locally-graded
//   attempts (papers that carry their answer keys) and an offline queue that
//   flushes on reconnect/login.
// - hydrateHistoryFromServer() merges server attempts into localStorage
//   history, which is what makes pre-login → post-login (and cross-device)
//   history seamless. The merge is keyed by test id and prefers the newer
//   submitted attempt.
// - Bookmarks/presets sync through /api/user/state, keyed by the same
//   identity (user_id when logged in, else the anonymous client_id), so they
//   survive across devices and are attributed to the account on login.

import {
	emitLocalStorageChange,
	getHistory,
	upsertHistory,
	writeJson,
} from './storage';
import { LOCAL_STORAGE_CHANGE_EVENT, STORAGE_KEYS } from './constants';
import { getClientHeaders } from './identity';
import { mergeStateSnapshots, SYNCED_STATE_KEYS } from '../shared/userState';

const PENDING_LIMIT = 50;
const STATE_SYNC_DEBOUNCE_MS = 1500;
const STATE_KEY_TO_STORAGE = {
	selftest_bookmarked_exams: STORAGE_KEYS.BOOKMARKED_EXAMS,
	selftest_bookmarked_quiz_presets: STORAGE_KEYS.BOOKMARKED_QUIZ_PRESETS,
	selftest_bookmarks: STORAGE_KEYS.QUESTION_BOOKMARKS,
	selftest_user_profile: STORAGE_KEYS.USER_PROFILE,
};
const STORAGE_TO_STATE_KEY = Object.fromEntries(
	Object.entries(STATE_KEY_TO_STORAGE).map(([key, storageKey]) => [storageKey, key]),
);

function readPendingAttempts() {
	if (typeof window === 'undefined') {
		return [];
	}
	try {
		const raw = window.localStorage.getItem(STORAGE_KEYS.PENDING_ATTEMPTS);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function writePendingAttempts(attempts) {
	if (typeof window === 'undefined') {
		return;
	}
	try {
		window.localStorage.setItem(
			STORAGE_KEYS.PENDING_ATTEMPTS,
			JSON.stringify(attempts.slice(-PENDING_LIMIT)),
		);
	} catch {
		// Best-effort queue persistence.
	}
}

export function queuePendingAttempt(attempt) {
	const pending = readPendingAttempts().filter(
		(item) =>
			!(
				item.testId === attempt.testId &&
				item.submittedAt === attempt.submittedAt
			),
	);
	pending.push({
		...attempt,
		queuedAt: Date.now(),
	});
	writePendingAttempts(pending);
}

export function getPendingAttemptCount() {
	return readPendingAttempts().length;
}

function serializeAttempt(attempt) {
	return {
		testId: attempt.testId,
		userAnswers: attempt.userAnswers || {},
		score: Number.isFinite(Number(attempt.score)) ? Number(attempt.score) : null,
		totalQuestions: Number.isFinite(Number(attempt.totalQuestions))
			? Number(attempt.totalQuestions)
			: null,
		timeTaken: Number.isFinite(Number(attempt.timeTaken))
			? Number(attempt.timeTaken)
			: null,
		submittedAt: attempt.submittedAt || new Date().toISOString(),
	};
}

/**
 * Best-effort push of one attempt. Falls back to the offline queue when the
 * network is unavailable or the push fails.
 */
export async function pushAttempt(attempt) {
	if (!attempt?.testId) {
		return;
	}
	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		queuePendingAttempt(attempt);
		return;
	}
	try {
		const response = await fetch('/api/user/history', {
			method: 'POST',
			headers: getClientHeaders(),
			body: JSON.stringify({ attempts: [serializeAttempt(attempt)] }),
		});
		if (!response.ok) {
			throw new Error('Failed to push attempt');
		}
	} catch (error) {
		console.error('Attempt push failed, queuing offline:', error);
		queuePendingAttempt(attempt);
	}
}

/** Flushes the offline queue; returns how many attempts were sent. */
export async function flushPendingAttempts() {
	if (typeof window === 'undefined') {
		return 0;
	}
	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		return 0;
	}

	const pending = readPendingAttempts();
	if (pending.length === 0) {
		return 0;
	}

	try {
		const response = await fetch('/api/user/history', {
			method: 'POST',
			headers: getClientHeaders(),
			body: JSON.stringify({
				attempts: pending.slice(0, PENDING_LIMIT).map(serializeAttempt),
			}),
		});
		if (!response.ok) {
			throw new Error('Failed to flush pending attempts');
		}
		writePendingAttempts([]);
		return pending.length;
	} catch (error) {
		console.error('Pending attempt flush failed:', error);
		return 0;
	}
}

function normalizeHistory(history) {
	if (!Array.isArray(history)) {
		return [];
	}
	return history
		.filter((entry) => entry && typeof entry === 'object')
		.map((entry) => ({ ...entry }));
}

export function mergeRemoteAttemptsIntoHistory(history, remoteAttempts) {
	const normalizedHistory = normalizeHistory(history);
	if (!Array.isArray(remoteAttempts) || remoteAttempts.length === 0) {
		return normalizedHistory;
	}

	const historyMap = new Map(
		normalizedHistory
			.filter((entry) => entry?.id !== undefined && entry?.id !== null)
			.map((entry) => [String(entry.id), entry]),
	);

	for (const attempt of remoteAttempts) {
		const testId = Number(attempt?.testId);
		if (!Number.isInteger(testId) || testId <= 0 || !attempt?.test) {
			continue;
		}

		const submittedAtMs = attempt.submittedAt
			? new Date(attempt.submittedAt).getTime()
			: Date.now();
		const safeSubmittedAtMs = Number.isNaN(submittedAtMs)
			? Date.now()
			: submittedAtMs;

		const existing = historyMap.get(String(testId));
		const existingTimestamp = Number(existing?.timestamp || 0);
		if (existing?.userAnswers && existingTimestamp >= safeSubmittedAtMs) {
			continue;
		}

		const mergedEntry = {
			...(existing || {}),
			...attempt.test,
			id: testId,
			userAnswers: attempt.userAnswers || {},
			score: attempt.score,
			totalQuestions:
				attempt.totalQuestions ||
				attempt.test?.questions?.length ||
				existing?.totalQuestions ||
				null,
			timeTaken: attempt.timeTaken,
			timestamp: safeSubmittedAtMs,
		};

		historyMap.set(String(testId), mergedEntry);
	}

	return Array.from(historyMap.values())
		.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
		.slice(0, 150);
}

/** Merges server-side attempts into the local history list (safe to call for anonymous + logged-in users). */
export async function hydrateHistoryFromServer() {
	if (typeof window === 'undefined') {
		return false;
	}

	try {
		const response = await fetch('/api/user/history', {
			method: 'GET',
			headers: getClientHeaders(),
		});
		if (response.status === 401) {
			return false;
		}
		if (!response.ok) {
			throw new Error('Failed to fetch server history');
		}

		const data = await response.json();
		const remoteAttempts = Array.isArray(data?.attempts) ? data.attempts : [];
		if (remoteAttempts.length === 0) {
			return false;
		}

		const mergedHistory = mergeRemoteAttemptsIntoHistory(
			getHistory(),
			remoteAttempts,
		);
		let changed = false;
		for (const entry of mergedHistory) {
			const local = getHistory().find(
				(item) => String(item.id) === String(entry.id),
			);
			if (!local || Number(entry.timestamp || 0) !== Number(local.timestamp || 0)) {
				upsertHistory(entry);
				changed = true;
			}
		}
		if (changed) {
			emitLocalStorageChange([STORAGE_KEYS.TEST_HISTORY]);
		}
		return changed;
	} catch (error) {
		console.error('Failed to hydrate history from server:', error);
		return false;
	}
}

let lastStateHash = '';
let statePushTimer = null;
let stateSyncStarted = false;

function readStateSnapshot() {
	if (typeof window === 'undefined') {
		return {};
	}
	const snapshot = {};
	for (const storageKey of Object.values(STATE_KEY_TO_STORAGE)) {
		try {
			const rawValue = window.localStorage.getItem(storageKey);
			if (rawValue !== null) {
				snapshot[storageKey] = rawValue;
			}
		} catch {
			// Skip unreadable keys.
		}
	}
	return snapshot;
}

function stateSnapshotHash(snapshot) {
	return JSON.stringify(Object.entries(snapshot).sort());
}

/** Pulls server-side bookmarks/presets and merges them into localStorage. */
export async function hydrateUserState() {
	if (typeof window === 'undefined') {
		return false;
	}

	try {
		const response = await fetch('/api/user/state', {
			method: 'GET',
			headers: getClientHeaders(),
		});
		if (response.status === 401) {
			return false;
		}
		if (!response.ok) {
			throw new Error('Failed to fetch user state');
		}

		const data = await response.json();
		const remoteStorage =
			data?.storage && typeof data.storage === 'object' ? data.storage : {};
		const localStorageSnapshot = readStateSnapshot();

		const merged = mergeStateSnapshots(
			remoteStorage,
			Object.fromEntries(
				Object.entries(localStorageSnapshot).map(([key, value]) => [
					STORAGE_TO_STATE_KEY[key],
					value,
				]),
			),
		);

		let changed = false;
		for (const stateKey of SYNCED_STATE_KEYS) {
			if (!(stateKey in merged)) {
				continue;
			}
			const storageKey = STATE_KEY_TO_STORAGE[stateKey];
			const current = window.localStorage.getItem(storageKey);
			const next = merged[stateKey];
			if (current !== next) {
				writeJson(storageKey, JSON.parse(next));
				changed = true;
			}
		}

		// Mark current state as synced so the watcher doesn't immediately
		// push the same values back.
		lastStateHash = stateSnapshotHash(readStateSnapshot());
		return changed;
	} catch (error) {
		console.error('Failed to hydrate user state:', error);
		return false;
	}
}

async function pushUserState() {
	if (typeof window === 'undefined') {
		return false;
	}
	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		return false;
	}

	const snapshot = readStateSnapshot();
	const snapshotHash = stateSnapshotHash(snapshot);
	if (!snapshotHash || snapshotHash === lastStateHash) {
		return false;
	}

	const payload = Object.fromEntries(
		Object.entries(snapshot).map(([storageKey, value]) => [
			STORAGE_TO_STATE_KEY[storageKey],
			value,
		]),
	);

	try {
		const response = await fetch('/api/user/state', {
			method: 'POST',
			headers: getClientHeaders(),
			body: JSON.stringify({ storage: payload }),
		});
		if (!response.ok) {
			throw new Error('Failed to sync user state');
		}
		lastStateHash = stateSnapshotHash(readStateSnapshot());
		return true;
	} catch (error) {
		console.error('User state sync failed:', error);
		return false;
	}
}

/**
 * Wires bookmark/preset sync: hydrates once on start, then watches
 * localStorage changes (debounced) and flushes on reconnect/visibility.
 * Returns a cleanup function for use in onMount.
 */
export function startStateSync() {
	if (typeof window === 'undefined' || stateSyncStarted) {
		return () => {};
	}
	stateSyncStarted = true;

	hydrateUserState().catch(() => {});

	const schedulePush = () => {
		if (statePushTimer) {
			window.clearTimeout(statePushTimer);
		}
		statePushTimer = window.setTimeout(() => {
			statePushTimer = null;
			pushUserState().catch(() => {});
		}, STATE_SYNC_DEBOUNCE_MS);
	};

	const handleLocalChange = (event) => {
		const keys = event?.detail?.keys || [];
		if (keys.length === 0 || keys.some((key) => STORAGE_TO_STATE_KEY[key])) {
			schedulePush();
		}
	};

	const handleOnline = () => {
		pushUserState().catch(() => {});
	};

	const handleVisibilityChange = () => {
		if (document.visibilityState === 'visible') {
			hydrateUserState().catch(() => {});
			schedulePush();
		}
	};

	window.addEventListener(LOCAL_STORAGE_CHANGE_EVENT, handleLocalChange);
	window.addEventListener('online', handleOnline);
	document.addEventListener('visibilitychange', handleVisibilityChange);

	return () => {
		if (statePushTimer) {
			window.clearTimeout(statePushTimer);
			statePushTimer = null;
		}
		window.removeEventListener(LOCAL_STORAGE_CHANGE_EVENT, handleLocalChange);
		window.removeEventListener('online', handleOnline);
		document.removeEventListener('visibilitychange', handleVisibilityChange);
		stateSyncStarted = false;
	};
}
