import { readJson, writeJson } from './storage';

const STREAK_KEY = 'selftest_streak';
const ACHIEVEMENTS_KEY = 'selftest_achievements';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const ACHIEVEMENTS = [
	{ id: 'first_quiz', title: 'First Steps', description: 'Complete your first quiz' },
	{ id: 'five_quizzes', title: 'Getting Serious', description: 'Complete 5 quizzes' },
	{ id: 'ten_quizzes', title: 'Quiz Master', description: 'Complete 10 quizzes' },
	{ id: 'perfect_score', title: 'Perfectionist', description: 'Get a perfect 100% score' },
	{ id: 'hundred_questions', title: 'Centurion', description: 'Answer 100 questions total' },
	{ id: 'five_topics', title: 'Renaissance', description: 'Take quizzes on 5 different topics' },
	{ id: 'streak_3', title: 'On Fire', description: 'Reach a 3-day streak' },
	{ id: 'streak_7', title: 'Week Warrior', description: 'Reach a 7-day streak' },
];

function todayString(offsetDays = 0) {
	const date = new Date();
	date.setDate(date.getDate() + offsetDays);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
		0,
	);
	const totalScore = completed.reduce((sum, entry) => sum + Number(entry.score || 0), 0);
	const totalTime = completed.reduce((sum, entry) => sum + Number(entry.timeTaken || 0), 0);
	const topics = new Set(completed.map((entry) => entry.topic).filter(Boolean));
	const perfectScoreCount = completed.filter(
		(entry) => Number(entry.score) === Number(entry.totalQuestions || entry.questions?.length),
	).length;

	return {
		totalTests,
		totalQuestions,
		totalScore,
		averageScore: totalQuestions > 0 ? Math.round((totalScore / totalQuestions) * 100) : 0,
		totalTime,
		uniqueTopics: topics.size,
		perfectScoreCount,
		hasPerfectScore: perfectScoreCount > 0,
	};
}

export function formatDuration(seconds, minuteShort = 'min', hourShort = 'h') {
	const safeSeconds = Number(seconds || 0);
	const hours = Math.floor(safeSeconds / 3600);
	const minutes = Math.floor((safeSeconds % 3600) / 60);
	if (hours > 0) {
		return `${hours}${hourShort} ${minutes}${minuteShort}`;
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
			streakHistory: todayEntry ? history : [...history, { date: today, quizCount: 1 }].slice(-90),
		};
		writeJson(STREAK_KEY, next);
		return next;
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
	writeJson(STREAK_KEY, next);
	return next;
}

export function getWeekActivity(streak = getStreak()) {
	const history = Array.isArray(streak.streakHistory) ? streak.streakHistory : [];
	return Array.from({ length: 7 }, (_, index) => {
		const offset = index - 6;
		const date = todayString(offset);
		const entry = history.find((item) => item.date === date);
		return {
			date,
			active: Boolean(entry),
			quizCount: Number(entry?.quizCount || 0),
			isToday: offset === 0,
		};
	});
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
	};
	const newlyUnlocked = ACHIEVEMENTS.filter(
		(item) => checks[item.id] && !safeUnlockedIds.includes(item.id),
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
				entries.reduce((sum, entry) => sum + entry.accuracy, 0) / entries.length,
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
