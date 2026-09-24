// Framework-neutral user state sync: which localStorage keys are synced to
// the server (keyed by user_id or anonymous client_id), their size limits and
// the merge rules used when combining server + local snapshots.

export const SYNCED_STATE_KEYS = [
	'selftest_bookmarked_exams',
	'selftest_bookmarked_quiz_presets',
	'selftest_bookmarks',
	'selftest_user_profile',
	'selftest_streak',
];

export const MAX_STATE_VALUE_BYTES = 96 * 1024;
export const MAX_STATE_KEYS_PER_REQUEST = 16;

export const STATE_CAPS = {
	selftest_bookmarked_exams: 20,
	selftest_bookmarked_quiz_presets: 20,
	selftest_bookmarks: 300,
	selftest_user_profile: 1,
	selftest_streak: 1,
};

export function isSyncedStateKey(key) {
	return typeof key === 'string' && SYNCED_STATE_KEYS.includes(key);
}

export function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isPlainArray(value) {
	return Array.isArray(value);
}

function dedupeByIdentity(items, identityFn) {
	const seen = new Set();
	const result = [];
	for (const item of items) {
		if (item === null || item === undefined) {
			continue;
		}
		let identity;
		try {
			identity = identityFn(item);
		} catch {
			identity = null;
		}
		if (!identity) {
			continue;
		}
		if (seen.has(identity)) {
			continue;
		}
		seen.add(identity);
		result.push(item);
	}
	return result;
}

function toArray(value) {
	return isPlainArray(value) ? value : [];
}

function mergeExams(remote, local) {
	const values = [...toArray(local), ...toArray(remote)].filter(
		(item) => typeof item === 'string'
	);
	return [...new Set(values)].slice(0, STATE_CAPS.selftest_bookmarked_exams);
}

function mergePresets(remote, local) {
	const merged = dedupeByIdentity(
		[...toArray(local), ...toArray(remote)],
		(preset) => preset.key || preset.id || null
	);
	return merged.slice(0, STATE_CAPS.selftest_bookmarked_quiz_presets);
}

function mergeQuestionBookmarks(remote, local) {
	const merged = dedupeByIdentity(
		[...toArray(local), ...toArray(remote)],
		(bookmark) => `${String(bookmark.question || '')}::${String(bookmark.answer || '')}`
	);
	return merged.slice(0, STATE_CAPS.selftest_bookmarks);
}

function parseUpdatedAt(profile) {
	if (!isPlainObject(profile) || typeof profile.updatedAt !== 'string') {
		return 0;
	}
	const timestamp = new Date(profile.updatedAt).getTime();
	return Number.isNaN(timestamp) ? 0 : timestamp;
}

// The profile is a single evolving object: the newer write wins (by
// updatedAt), falling back to whichever side exists.
function mergeProfile(remote, local) {
	const hasRemote = isPlainObject(remote);
	const hasLocal = isPlainObject(local);
	if (hasRemote && hasLocal) {
		return parseUpdatedAt(remote) >= parseUpdatedAt(local) ? remote : local;
	}
	return hasRemote ? remote : hasLocal ? local : null;
}

function parseDateKey(value) {
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

// One practice day is one entry; two devices on the same day must not
// double-count it, so the union keeps the larger quizCount per date.
function mergeStreakHistory(remoteHistory, localHistory) {
	const counts = new Map();
	for (const entry of [...toArray(remoteHistory), ...toArray(localHistory)]) {
		const date = parseDateKey(entry?.date);
		if (!date) {
			continue;
		}
		const quizCount = Math.max(1, Number(entry?.quizCount) || 1);
		counts.set(date, Math.max(counts.get(date) || 0, quizCount));
	}
	return [...counts.entries()]
		.sort(([left], [right]) => (left < right ? -1 : 1))
		.slice(-90)
		.map(([date, quizCount]) => ({ date, quizCount }));
}

// Streaks merge like a two-writer register: the side with the newer
// lastActiveDate owns the live streak; ties keep the larger one. Longest
// streak, total days and the day history only ever grow.
function mergeStreak(remote, local) {
	const hasRemote = isPlainObject(remote);
	const hasLocal = isPlainObject(local);
	if (!hasRemote && !hasLocal) {
		return null;
	}
	if (!hasRemote) {
		return local;
	}
	if (!hasLocal) {
		return remote;
	}
	const remoteDate = parseDateKey(remote.lastActiveDate) || '';
	const localDate = parseDateKey(local.lastActiveDate) || '';
	const remoteCurrent = Math.max(0, Number(remote.currentStreak) || 0);
	const localCurrent = Math.max(0, Number(local.currentStreak) || 0);
	const newer =
		remoteDate > localDate || (remoteDate === localDate && remoteCurrent >= localCurrent)
			? remote
			: local;
	const history = mergeStreakHistory(remote.streakHistory, local.streakHistory);
	const currentStreak = Math.max(0, Number(newer.currentStreak) || 0);
	const longestStreak = Math.max(
		currentStreak,
		Math.max(0, Number(remote.longestStreak) || 0),
		Math.max(0, Number(local.longestStreak) || 0)
	);
	const totalQuizDays = Math.max(
		Math.max(0, Number(remote.totalQuizDays) || 0),
		Math.max(0, Number(local.totalQuizDays) || 0),
		history.length
	);
	return {
		currentStreak,
		longestStreak,
		lastActiveDate: parseDateKey(newer.lastActiveDate) || history.at(-1)?.date || null,
		freezesRemaining: Math.min(3, Math.max(0, Number(newer.freezesRemaining) || 0)),
		streakHistory: history,
		totalQuizDays,
	};
}

const MERGE_STRATEGIES = {
	selftest_bookmarked_exams: mergeExams,
	selftest_bookmarked_quiz_presets: mergePresets,
	selftest_bookmarks: mergeQuestionBookmarks,
	selftest_user_profile: mergeProfile,
	selftest_streak: mergeStreak,
};

/**
 * Parses a state value that may be a JSON string (localStorage / old rows)
 * or an already-parsed JSONB object/array (server rows). Returns null when
 * unusable.
 */
function parseStateValue(value) {
	if (value === null || value === undefined) {
		return null;
	}
	if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
		return value;
	}
	if (Array.isArray(value)) {
		return value;
	}
	if (typeof value === 'string') {
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}
	return null;
}

/** Merges a remote server snapshot into the local snapshot. Collection keys
 * (bookmarks, presets) are unioned and deduped; anything else keeps the
 * local value. Returns a new snapshot object of stringified JSON values.
 */
export function mergeStateSnapshots(remote, local) {
	const result = {};
	const localValues = isPlainObject(local) ? local : {};
	const remoteValues = isPlainObject(remote) ? remote : {};

	for (const key of SYNCED_STATE_KEYS) {
		const localValue = parseStateValue(localValues[key]);
		const remoteValue = parseStateValue(remoteValues[key]);

		const strategy = MERGE_STRATEGIES[key];
		const merged = strategy ? strategy(remoteValue, localValue) : localValue;
		if (merged !== null && merged !== undefined) {
			result[key] = JSON.stringify(merged);
		}
	}

	return result;
}

/**
 * Validates a single state value coming from the client. Returns the value
 * when acceptable (a JSON string or object/array), otherwise null.
 */
export function validateStateValue(value, key) {
	if (!isSyncedStateKey(key)) {
		return null;
	}
	if (value === undefined || value === null) {
		return null;
	}
	let parsed = value;
	if (typeof value === 'string') {
		try {
			parsed = JSON.parse(value);
		} catch {
			return null;
		}
	}
	if (!isPlainArray(parsed) && !isPlainObject(parsed)) {
		return null;
	}
	const serialized = JSON.stringify(parsed);
	if (!serialized || serialized.length > MAX_STATE_VALUE_BYTES) {
		return null;
	}
	return serialized;
}
