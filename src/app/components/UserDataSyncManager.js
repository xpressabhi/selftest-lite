'use client';

import { useCallback, useEffect, useRef } from 'react';
import { STORAGE_KEYS } from '../constants';
import { useAuth } from '../context/AuthContext';

const TRACKED_KEY_PREFIX = 'selftest_';
const EXTRA_TRACKED_KEYS = new Set(['dataSaverMode', 'soundEffectsEnabled']);
const SYNC_DEBOUNCE_MS = 1200;
const SYNC_POLL_MS = 6000;

function isTrackedKey(key) {
	if (typeof key !== 'string') {
		return false;
	}
	return key.startsWith(TRACKED_KEY_PREFIX) || EXTRA_TRACKED_KEYS.has(key);
}

function readTrackedStorageSnapshot() {
	if (typeof window === 'undefined') {
		return {};
	}

	const snapshot = {};
	for (let index = 0; index < window.localStorage.length; index += 1) {
		const key = window.localStorage.key(index);
		if (!isTrackedKey(key)) {
			continue;
		}

		const value = window.localStorage.getItem(key);
		if (value !== null) {
			snapshot[key] = value;
		}
	}

	return snapshot;
}

function writeTrackedStorageSnapshot(snapshot) {
	if (typeof window === 'undefined' || !snapshot || typeof snapshot !== 'object') {
		return;
	}

	const changedKeys = [];
	for (const [key, value] of Object.entries(snapshot)) {
		if (!isTrackedKey(key) || typeof value !== 'string') {
			continue;
		}

		if (window.localStorage.getItem(key) === value) {
			continue;
		}

		window.localStorage.setItem(key, value);
		changedKeys.push(key);
	}

	if (changedKeys.length > 0) {
		window.dispatchEvent(
			new CustomEvent('selftest-local-sync', {
				detail: {
					keys: changedKeys,
				},
			}),
		);
	}
}

function stableSnapshotHash(snapshot) {
	const normalized = {};
	for (const key of Object.keys(snapshot || {}).sort()) {
		normalized[key] = snapshot[key];
	}
	return JSON.stringify(normalized);
}

function parseJsonSafely(rawValue, fallback) {
	if (typeof rawValue !== 'string') {
		return fallback;
	}

	try {
		return JSON.parse(rawValue);
	} catch {
		return fallback;
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

function mergeRemoteAttemptsIntoHistory(history, remoteAttempts) {
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

function collectAttemptPayloads(storageSnapshot) {
	const rawHistory = storageSnapshot[STORAGE_KEYS.TEST_HISTORY];
	const history = normalizeHistory(parseJsonSafely(rawHistory, []));

	return history
		.filter((entry) => entry?.userAnswers)
		.map((entry) => {
			const testId = Number(entry.id);
			if (!Number.isInteger(testId) || testId <= 0) {
				return null;
			}

			const numericTimestamp = Number(entry.timestamp);
			const timestampCandidate = Number.isFinite(numericTimestamp)
				? new Date(numericTimestamp)
				: new Date(entry.timestamp);
			const submittedAt = Number.isNaN(timestampCandidate.getTime())
				? new Date().toISOString()
				: timestampCandidate.toISOString();

			return {
				testId,
				userAnswers:
					entry.userAnswers && typeof entry.userAnswers === 'object'
						? entry.userAnswers
						: {},
				score: Number.isFinite(Number(entry.score))
					? Number(entry.score)
					: null,
				totalQuestions: Number.isFinite(Number(entry.totalQuestions))
					? Number(entry.totalQuestions)
					: Array.isArray(entry.questions)
						? entry.questions.length
						: null,
				timeTaken: Number.isFinite(Number(entry.timeTaken))
					? Number(entry.timeTaken)
					: null,
				submittedAt,
				metadata: {
					isSpeedChallenge: Boolean(entry.isSpeedChallenge),
				},
			};
		})
		.filter(Boolean)
		.slice(0, 250);
}

export default function UserDataSyncManager() {
	const { user, isAuthLoading } = useAuth();
	const syncTimeoutRef = useRef(null);
	const syncInFlightRef = useRef(false);
	const pendingSyncRef = useRef(false);
	const lastSyncedHashRef = useRef('');

	const syncToServer = useCallback(async () => {
		if (typeof window === 'undefined') {
			return;
		}
		if (!navigator.onLine || syncInFlightRef.current) {
			pendingSyncRef.current = true;
			return;
		}

		syncInFlightRef.current = true;
		try {
			const storage = readTrackedStorageSnapshot();
			const snapshotHash = stableSnapshotHash(storage);
			if (snapshotHash === lastSyncedHashRef.current && !pendingSyncRef.current) {
				return;
			}

			const attempts = collectAttemptPayloads(storage);
			const response = await fetch('/api/user/state', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ storage, attempts }),
			});

			if (!response.ok) {
				throw new Error('Failed to sync user state');
			}

			lastSyncedHashRef.current = snapshotHash;
			pendingSyncRef.current = false;
		} catch (error) {
			console.error('User data sync failed:', error);
			pendingSyncRef.current = true;
		} finally {
			syncInFlightRef.current = false;
		}

		if (pendingSyncRef.current) {
			syncTimeoutRef.current = window.setTimeout(() => {
				syncToServer();
			}, SYNC_DEBOUNCE_MS);
		}
	}, []);

	const scheduleSync = useCallback(() => {
		if (typeof window === 'undefined' || !user?.id) {
			return;
		}
		pendingSyncRef.current = true;
		if (syncTimeoutRef.current) {
			window.clearTimeout(syncTimeoutRef.current);
		}
		syncTimeoutRef.current = window.setTimeout(() => {
			syncToServer();
		}, SYNC_DEBOUNCE_MS);
	}, [syncToServer, user?.id]);

	const hydrateFromServer = useCallback(async () => {
		if (typeof window === 'undefined' || !user?.id) {
			return;
		}

		try {
			const response = await fetch('/api/user/state', {
				method: 'GET',
				cache: 'no-store',
			});
			if (!response.ok) {
				return;
			}

			const data = await response.json();
			const remoteStorage =
				data?.storage && typeof data.storage === 'object' ? data.storage : {};
			const localStorageSnapshot = readTrackedStorageSnapshot();
			const mergedStorage = {
				...remoteStorage,
				...localStorageSnapshot,
			};

			const mergedHistory = mergeRemoteAttemptsIntoHistory(
				parseJsonSafely(mergedStorage[STORAGE_KEYS.TEST_HISTORY], []),
				Array.isArray(data?.attempts) ? data.attempts : [],
			);
			mergedStorage[STORAGE_KEYS.TEST_HISTORY] = JSON.stringify(mergedHistory);

			writeTrackedStorageSnapshot(mergedStorage);
			pendingSyncRef.current = true;
			lastSyncedHashRef.current = '';
			scheduleSync();
		} catch (error) {
			console.error('Failed to hydrate user state from server:', error);
		}
	}, [scheduleSync, user?.id]);

	useEffect(() => {
		if (isAuthLoading) {
			return undefined;
		}
		if (!user?.id || typeof window === 'undefined') {
			return undefined;
		}

		hydrateFromServer();

		let previousHash = stableSnapshotHash(readTrackedStorageSnapshot());
		const pollId = window.setInterval(() => {
			const currentSnapshot = readTrackedStorageSnapshot();
			const currentHash = stableSnapshotHash(currentSnapshot);
			if (currentHash !== previousHash) {
				previousHash = currentHash;
				scheduleSync();
			}
		}, SYNC_POLL_MS);

		const handleStorage = (event) => {
			if (isTrackedKey(event.key || '')) {
				scheduleSync();
			}
		};

		const handleOnline = () => {
			scheduleSync();
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === 'hidden') {
				syncToServer();
				return;
			}
			scheduleSync();
		};

		window.addEventListener('storage', handleStorage);
		window.addEventListener('online', handleOnline);
		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			window.clearInterval(pollId);
			window.removeEventListener('storage', handleStorage);
			window.removeEventListener('online', handleOnline);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			if (syncTimeoutRef.current) {
				window.clearTimeout(syncTimeoutRef.current);
			}
		};
	}, [hydrateFromServer, isAuthLoading, scheduleSync, syncToServer, user?.id]);

	return null;
}
