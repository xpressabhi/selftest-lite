// Framework-neutral user profile schema: the shape of what we know about a
// learner, how it is stored (one allowlisted app_user_state key) and how
// incoming values are normalized before persistence or use.

export const PROFILE_STATE_KEY = 'selftest_user_profile';

export const PROFILE_VERSION = 1;

export const VALID_CLASSES = [
	'class-8',
	'class-9',
	'class-10',
	'class-11',
	'class-12',
	'college',
	'other',
];

export const VALID_LANGUAGES = ['english', 'hindi'];

export const VALID_DIFFICULTIES = [
	'beginner',
	'intermediate',
	'advanced',
	'expert',
];

export const MAX_SUBJECTS = 12;
export const MAX_FOCUS_TOPICS = 10;
export const MAX_FOCUS_TOPIC_LENGTH = 80;
export const MAX_EXAM_NAME_LENGTH = 120;
export const MAX_PROFILE_BYTES = 16 * 1024;

export function createDefaultProfile() {
	return {
		version: PROFILE_VERSION,
		setupComplete: false,
		class: null,
		examTarget: null,
		subjects: [],
		preferences: {
			language: null,
			difficultyComfort: null,
			personalized: true,
		},
		declaredFocus: [],
		updatedAt: null,
	};
}

function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function trimList(value, limit, maxItemLength = MAX_FOCUS_TOPIC_LENGTH) {
	if (!Array.isArray(value)) {
		return [];
	}
	const seen = new Set();
	const result = [];
	for (const item of value) {
		if (typeof item !== 'string') {
			continue;
		}
		const trimmed = item.trim().slice(0, maxItemLength);
		if (!trimmed || seen.has(trimmed.toLowerCase())) {
			continue;
		}
		seen.add(trimmed.toLowerCase());
		result.push(trimmed);
		if (result.length >= limit) {
			break;
		}
	}
	return result;
}

function normalizeExamTarget(value) {
	if (!isPlainObject(value)) {
		return null;
	}
	if (typeof value.examId !== 'string' || !value.examId.trim()) {
		return null;
	}
	return {
		examId: value.examId.trim().slice(0, 100),
		name: typeof value.name === 'string' ? value.name.trim().slice(0, MAX_EXAM_NAME_LENGTH) : null,
	};
}

function normalizePreferences(value) {
	const preferences = isPlainObject(value) ? value : {};
	const language =
		typeof preferences.language === 'string' &&
		VALID_LANGUAGES.includes(preferences.language)
			? preferences.language
			: null;
	const difficultyComfort =
		typeof preferences.difficultyComfort === 'string' &&
		VALID_DIFFICULTIES.includes(preferences.difficultyComfort)
			? preferences.difficultyComfort
			: null;
	return {
		language,
		difficultyComfort,
		personalized: preferences.personalized !== false,
	};
}

function normalizeUpdatedAt(value) {
	if (typeof value !== 'string') {
		return null;
	}
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Validates and sanitizes an incoming profile value. Returns a fully
 * normalized profile object, or null when the input is unusable.
 */
export function normalizeProfile(value) {
	if (!isPlainObject(value)) {
		return null;
	}

	const preferences = normalizePreferences(value.preferences);
	if (!preferences.personalized && preferences.language === null && preferences.difficultyComfort === null) {
		// A fully-empty profile adds no value; treat as absent.
		return null;
	}

	return {
		version: PROFILE_VERSION,
		setupComplete: value.setupComplete === true,
		class:
			typeof value.class === 'string' && VALID_CLASSES.includes(value.class)
				? value.class
				: null,
		examTarget: normalizeExamTarget(value.examTarget),
		subjects: trimList(value.subjects, MAX_SUBJECTS),
		preferences,
		declaredFocus: trimList(value.declaredFocus, MAX_FOCUS_TOPICS),
		updatedAt: normalizeUpdatedAt(value.updatedAt),
	};
}

/** True when the profile exists and personalization is enabled. */
export function isPersonalized(profile) {
	return isPlainObject(profile) && profile.preferences?.personalized !== false;
}

/**
 * Parses a stored profile value that may be a JSON string (localStorage) or
 * an already-parsed JSONB object (server rows). Returns null when unusable.
 */
export function parseProfileStateValue(value) {
	let parsed = value;
	if (typeof parsed === 'string') {
		try {
			parsed = JSON.parse(parsed);
		} catch {
			return null;
		}
	}
	return normalizeProfile(parsed);
}
