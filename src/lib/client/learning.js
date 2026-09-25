import { emitLocalStorageChange, readJson, writeJson } from './storage';
import { STORAGE_KEYS } from './constants';

const STREAK_KEY = STORAGE_KEYS.STREAK;
const ACHIEVEMENTS_KEY = 'selftest_achievements';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const ACHIEVEMENTS = [
	{ id: 'first_quiz' },
	{ id: 'five_quizzes' },
	{ id: 'ten_quizzes' },
	{ id: 'perfect_score' },
	{ id: 'hundred_questions' },
	{ id: 'five_topics' },
	{ id: 'streak_3' },
	{ id: 'streak_7' },
	{ id: 'streak_30' },
	{ id: 'streak_100' },
];

/** Streak badge milestones, in days; keys derive from `achievement_streak_<n>_*`. */
export const STREAK_MILESTONES = [3, 7, 30, 100];

function dateKey(date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayString(offsetDays = 0) {
	const date = new Date();
	date.setDate(date.getDate() + offsetDays);
	return dateKey(date);
}

function completedTests(history) {
	return (Array.isArray(history) ? history : []).filter((entry) => entry?.userAnswers);
}

function accuracy(entry) {
	const score = Number(entry?.score);
	const total = Number(entry?.totalQuestions || entry?.questions?.length);
	if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) {
		return null;
	}
	return Math.round((score / total) * 100);
}

/**
 * Compares an attempt against the learner's previous completed attempts.
 * `currentId` is excluded so the current result never compares against itself.
 * Returns `{ state, delta }` with state 'baseline' | 'best' | 'same' | 'ahead'
 * | 'behind'; `delta` is the percentage-point gap to the previous average and
 * stays 0 for 'baseline', 'best', and 'same'.
 */
export function buildScoreComparison(history, currentId, percentage) {
	const previous = completedTests(history)
		.filter((entry) => String(entry?.id) !== String(currentId))
		.map(accuracy)
		.filter((value) => value !== null);
	if (previous.length === 0) {
		return { state: 'baseline', delta: 0 };
	}
	const best = Math.max(...previous);
	const average = Math.round(previous.reduce((sum, value) => sum + value, 0) / previous.length);
	const current = Math.round(Number(percentage) || 0);
	if (current > best) {
		return { state: 'best', delta: 0 };
	}
	if (current === average) {
		return { state: 'same', delta: 0 };
	}
	if (current > average) {
		return { state: 'ahead', delta: current - average };
	}
	return { state: 'behind', delta: average - current };
}

function normalizeQuizTestType(testType) {
	return testType === 'mixed' ? 'multiple-choice' : testType || 'multiple-choice';
}

function quizConfig(entry) {
	return {
		topic: entry?.topic || '',
		difficulty: entry?.requestParams?.difficulty || 'intermediate',
		testType: normalizeQuizTestType(entry?.requestParams?.testType),
		numQuestions: Math.min(20, Math.max(5, Number(entry?.requestParams?.numQuestions) || 10)),
		paperLanguage: entry?.requestParams?.language || 'english',
	};
}

export function getStats(history) {
	const completed = completedTests(history);
	const totalTests = completed.length;
	const totalQuestions = completed.reduce(
		(sum, entry) => sum + Number(entry.totalQuestions || entry.questions?.length || 0),
		0
	);
	const totalScore = completed.reduce((sum, entry) => sum + Number(entry.score || 0), 0);
	const totalTime = completed.reduce((sum, entry) => sum + Number(entry.timeTaken || 0), 0);
	const topics = new Set(completed.map((entry) => entry.topic).filter(Boolean));
	const perfectScoreCount = completed.filter(
		(entry) => Number(entry.score) === Number(entry.totalQuestions || entry.questions?.length)
	).length;
	const bestScore = completed.reduce((best, entry) => {
		const value = accuracy(entry);
		return value === null ? best : Math.max(best, value);
	}, 0);

	return {
		totalTests,
		totalQuestions,
		totalScore,
		averageScore: totalQuestions > 0 ? Math.round((totalScore / totalQuestions) * 100) : 0,
		bestScore,
		totalTime,
		uniqueTopics: topics.size,
		perfectScoreCount,
		hasPerfectScore: perfectScoreCount > 0,
	};
}

export function formatDuration(seconds, minuteShort = 'min', hourShort = 'h') {
	const safeSeconds = Math.max(0, Number(seconds || 0));
	const hours = Math.floor(safeSeconds / 3600);
	const minutes = Math.floor((safeSeconds % 3600) / 60);
	if (hours > 0) {
		return `${hours}${hourShort} ${minutes}${minuteShort}`;
	}
	// A started attempt is never "0 min"; show the smallest whole unit so the
	// value matches the results header instead of contradicting it.
	if (safeSeconds > 0 && minutes === 0) {
		return `1${minuteShort}`;
	}
	return `${minutes}${minuteShort}`;
}

export function getStreak() {
	return readJson(STREAK_KEY, {
		currentStreak: 0,
		longestStreak: 0,
		lastActiveDate: null,
		freezesRemaining: 1,
		streakHistory: [],
		totalQuizDays: 0,
	});
}

/** Writes the streak and announces it so cross-device sync picks it up. */
function persistStreak(next) {
	writeJson(STREAK_KEY, next);
	emitLocalStorageChange([STREAK_KEY]);
	return next;
}

export function recordStreakActivity() {
	const previous = getStreak();
	const today = todayString();
	const yesterday = todayString(-1);
	const history = Array.isArray(previous.streakHistory) ? [...previous.streakHistory] : [];
	const todayEntry = history.find((entry) => entry.date === today);

	if (previous.lastActiveDate === today) {
		if (todayEntry) {
			todayEntry.quizCount = Number(todayEntry.quizCount || 0) + 1;
		}
		const next = {
			...previous,
			streakHistory: todayEntry
				? history
				: [...history, { date: today, quizCount: 1 }].slice(-90),
		};
		return persistStreak(next);
	}

	const nextCurrent =
		previous.lastActiveDate === yesterday ? Number(previous.currentStreak || 0) + 1 : 1;
	const next = {
		currentStreak: nextCurrent,
		longestStreak: Math.max(nextCurrent, Number(previous.longestStreak || 0)),
		lastActiveDate: today,
		freezesRemaining:
			nextCurrent > 0 && nextCurrent % 7 === 0
				? Math.min(3, Number(previous.freezesRemaining || 0) + 1)
				: Number(previous.freezesRemaining || 0),
		streakHistory: [...history, { date: today, quizCount: 1 }].slice(-90),
		totalQuizDays: Number(previous.totalQuizDays || 0) + 1,
	};
	return persistStreak(next);
}

/**
 * Builds the rolling 7-day practice strip: the last seven device-local days
 * ending on `today`, oldest first. Pure and deterministic for a given
 * `today`/`locale`, so the strip is unit-testable without a DOM.
 *
 * Returns seven cells `{ date, quizCount, level, active, isToday, weekdayLabel }`
 * where `level` is 0 (no test), 1 (one), 2 (two) or 3 (three or more).
 * Malformed, out-of-window and non-positive entries are ignored.
 */
export function buildStreakWeek(streakHistory = [], { today = new Date(), locale = 'en' } = {}) {
	const counts = new Map();
	for (const entry of Array.isArray(streakHistory) ? streakHistory : []) {
		const date = typeof entry?.date === 'string' ? entry.date : null;
		const count = Number(entry?.quizCount);
		if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(count) || count <= 0) {
			continue;
		}
		counts.set(date, Math.max(counts.get(date) || 0, count));
	}

	const anchor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	const todayKey = dateKey(anchor);
	const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
	const days = [];
	for (let offset = -6; offset <= 0; offset += 1) {
		const date = new Date(anchor);
		date.setDate(anchor.getDate() + offset);
		const key = dateKey(date);
		const quizCount = counts.get(key) || 0;
		days.push({
			date: key,
			quizCount,
			level: quizCount >= 3 ? 3 : quizCount,
			active: quizCount > 0,
			isToday: key === todayKey,
			weekdayLabel: weekdayFormatter.format(date),
		});
	}
	return days;
}

export function unlockAchievements(history, streak = getStreak()) {
	const stats = getStats(history);
	const unlockedIds = readJson(ACHIEVEMENTS_KEY, []);
	const safeUnlockedIds = Array.isArray(unlockedIds) ? unlockedIds : [];
	const checks = {
		first_quiz: stats.totalTests >= 1,
		five_quizzes: stats.totalTests >= 5,
		ten_quizzes: stats.totalTests >= 10,
		perfect_score: stats.hasPerfectScore,
		hundred_questions: stats.totalQuestions >= 100,
		five_topics: stats.uniqueTopics >= 5,
		streak_3: Number(streak.longestStreak || 0) >= 3,
		streak_7: Number(streak.longestStreak || 0) >= 7,
		streak_30: Number(streak.longestStreak || 0) >= 30,
		streak_100: Number(streak.longestStreak || 0) >= 100,
	};
	const newlyUnlocked = ACHIEVEMENTS.filter(
		(item) => checks[item.id] && !safeUnlockedIds.includes(item.id)
	);
	if (newlyUnlocked.length > 0) {
		writeJson(ACHIEVEMENTS_KEY, [...safeUnlockedIds, ...newlyUnlocked.map((item) => item.id)]);
	}
	return newlyUnlocked;
}

export function getAchievements() {
	const unlockedIds = readJson(ACHIEVEMENTS_KEY, []);
	const safeUnlockedIds = Array.isArray(unlockedIds) ? unlockedIds : [];
	return ACHIEVEMENTS.map((item) => ({
		...item,
		unlocked: safeUnlockedIds.includes(item.id),
	}));
}

function topicGroups(history) {
	const groups = new Map();
	for (const entry of completedTests(history)) {
		if (!entry.topic || entry.requestParams?.testMode === 'full-exam') {
			continue;
		}
		const entryAccuracy = accuracy(entry);
		if (entryAccuracy === null) {
			continue;
		}
		const topic = String(entry.topic).trim();
		const items = groups.get(topic) || [];
		items.push({
			id: String(entry.id || `${topic}-${entry.timestamp || Date.now()}`),
			timestamp: Number(entry.timestamp || entry.createdAt || 0),
			accuracy: entryAccuracy,
			...quizConfig(entry),
		});
		groups.set(topic, items);
	}
	return Array.from(groups.entries()).map(([topic, entries]) => ({
		topic,
		entries: [...entries].sort((left, right) => right.timestamp - left.timestamp),
	}));
}

function reviewIntervalDays(value) {
	if (value < 50) return 1;
	if (value < 70) return 2;
	if (value < 85) return 4;
	return 7;
}

export function buildReviewQueue(history, now = Date.now()) {
	const startOfToday = new Date(now);
	startOfToday.setHours(0, 0, 0, 0);
	const endOfToday = new Date(startOfToday.getTime() + ONE_DAY_MS - 1);
	const items = topicGroups(history)
		.map(({ topic, entries }) => {
			const latest = entries[0];
			const dueAt = latest.timestamp + reviewIntervalDays(latest.accuracy) * ONE_DAY_MS;
			return {
				...latest,
				topic,
				dueAt,
				isOverdue: dueAt < startOfToday.getTime(),
				isDueToday: dueAt <= endOfToday.getTime(),
			};
		})
		.sort((left, right) => left.dueAt - right.dueAt);
	return {
		today: items.filter((item) => item.isDueToday),
		upcoming: items.filter((item) => !item.isDueToday).slice(0, 4),
	};
}

export function buildTopicMasteryItems(history, maxItems = 4) {
	return topicGroups(history)
		.map(({ topic, entries }) => {
			const latestAccuracy = entries[0].accuracy;
			const averageAccuracy = Math.round(
				entries.reduce((sum, entry) => sum + entry.accuracy, 0) / entries.length
			);
			return {
				id: entries[0].id,
				topic,
				attempts: entries.length,
				latestAccuracy,
				averageAccuracy,
				status: averageAccuracy >= 80 && latestAccuracy >= 75 ? 'strong' : 'needs-work',
			};
		})
		.sort((left, right) => left.averageAccuracy - right.averageAccuracy)
		.slice(0, maxItems);
}
