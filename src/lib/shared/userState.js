// Framework-neutral user state sync: which localStorage keys are synced to
// the server (keyed by user_id or anonymous client_id), their size limits and
// the merge rules used when combining server + local snapshots.

export const SYNCED_STATE_KEYS = [
	'selftest_bookmarked_exams',
	'selftest_bookmarked_quiz_presets',
	'selftest_bookmarks',
	'selftest_user_profile',
];

export const MAX_STATE_VALUE_BYTES = 96 * 1024;
export const MAX_STATE_KEYS_PER_REQUEST = 16;

export const STATE_CAPS = {
	selftest_bookmarked_exams: 20,
	selftest_bookmarked_quiz_presets: 20,
	selftest_bookmarks: 300,
	selftest_user_profile: 1,
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
		(item) => typeof item === 'string',
	);
	return [...new Set(values)].slice(0, STATE_CAPS.selftest_bookmarked_exams);
}

function mergePresets(remote, local) {
	const merged = dedupeByIdentity(
		[...toArray(local), ...toArray(remote)],
		(preset) => preset.key || preset.id || null,
	);
	return merged.slice(0, STATE_CAPS.selftest_bookmarked_quiz_presets);
}

function mergeQuestionBookmarks(remote, local) {
	const merged = dedupeByIdentity(
		[...toArray(local), ...toArray(remote)],
		(bookmark) =>
			`${String(bookmark.question || '')}::${String(bookmark.answer || '')}`,
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

const MERGE_STRATEGIES = {
	selftest_bookmarked_exams: mergeExams,
	selftest_bookmarked_quiz_presets: mergePresets,
	selftest_bookmarks: mergeQuestionBookmarks,
	selftest_user_profile: mergeProfile,
};

/**
 * Merges a remote server snapshot into the local snapshot. Collection keys
 * (bookmarks, presets) are unioned and deduped; anything else keeps the
 * local value. Returns a new snapshot object of stringified JSON values.
 */
export function mergeStateSnapshots(remote, local) {
	const result = {};
	const localValues = isPlainObject(local) ? local : {};
	const remoteValues = isPlainObject(remote) ? remote : {};

	for (const key of SYNCED_STATE_KEYS) {
		let localValue;
		try {
			localValue = localValues[key] !== undefined ? JSON.parse(localValues[key]) : null;
		} catch {
			localValue = null;
		}
		let remoteValue;
		try {
			remoteValue = remoteValues[key] !== undefined ? JSON.parse(remoteValues[key]) : null;
		} catch {
			remoteValue = null;
		}

		const strategy = MERGE_STRATEGIES[key];
		const merged = strategy
			? strategy(remoteValue, localValue)
			: localValue;
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
