const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function normalizeQuizTestType(testType) {
	return testType === 'mixed' ? 'multiple-choice' : testType;
}

function getTimestamp(entry) {
	return Number(entry?.timestamp || entry?.createdAt || 0);
}

function getAccuracyPercentage(entry) {
	const score = Number(entry?.score);
	const totalQuestions = Number(entry?.totalQuestions);
	if (!Number.isFinite(score) || !Number.isFinite(totalQuestions) || totalQuestions <= 0) {
		return null;
	}

	return Math.round((score / totalQuestions) * 100);
}

function getQuizPracticeConfig(entry) {
	return {
		topic: entry?.topic || '',
		difficulty: entry?.requestParams?.difficulty || 'intermediate',
		testType: normalizeQuizTestType(
			entry?.requestParams?.testType || 'multiple-choice',
		),
		numQuestions: Math.min(
			20,
			Math.max(5, Number(entry?.requestParams?.numQuestions) || 10),
		),
		paperLanguage: entry?.requestParams?.language || 'english',
	};
}

function buildTopicGroups(history) {
	if (!Array.isArray(history)) {
		return [];
	}

	const groups = new Map();

	for (const entry of history) {
		if (
			!entry?.userAnswers ||
			!entry?.topic ||
			entry?.requestParams?.testMode === 'full-exam'
		) {
			continue;
		}

		const accuracy = getAccuracyPercentage(entry);
		if (accuracy === null) {
			continue;
		}

		const topic = String(entry.topic).trim();
		if (!topic) {
			continue;
		}

		const topicEntries = groups.get(topic) || [];
		topicEntries.push({
			...getQuizPracticeConfig(entry),
			id: String(entry.id || `${topic}-${getTimestamp(entry)}`),
			timestamp: getTimestamp(entry),
			accuracy,
		});
		groups.set(topic, topicEntries);
	}

	return Array.from(groups.entries()).map(([topic, entries]) => {
		const sortedEntries = [...entries].sort((left, right) => right.timestamp - left.timestamp);
		return {
			topic,
			entries: sortedEntries,
		};
	});
}

function getTrendDirection(entries) {
	if (entries.length < 2) {
		return 'steady';
	}

	const latestAccuracy = entries[0].accuracy;
	const previousWindow = entries.slice(1, 3);
	const previousAverage = Math.round(
		previousWindow.reduce((sum, entry) => sum + entry.accuracy, 0) /
			previousWindow.length,
	);
	const delta = latestAccuracy - previousAverage;

	if (delta >= 5) {
		return 'up';
	}
	if (delta <= -5) {
		return 'down';
	}
	return 'steady';
}

function getReviewIntervalDays(accuracy) {
	if (accuracy < 50) {
		return 1;
	}
	if (accuracy < 70) {
		return 2;
	}
	if (accuracy < 85) {
		return 4;
	}
	return 7;
}

export function buildRevisionRecommendations(history, maxItems = 3) {
	return buildTopicGroups(history)
		.map(({ topic, entries }) => ({
			id: entries[0].id,
			topic,
			accuracy: entries[0].accuracy,
			difficulty: entries[0].difficulty,
			testType: entries[0].testType,
			numQuestions: entries[0].numQuestions,
			paperLanguage: entries[0].paperLanguage,
			timestamp: entries[0].timestamp,
		}))
		.filter((entry) => entry.accuracy < 70)
		.sort((left, right) => {
			if (left.accuracy !== right.accuracy) {
				return left.accuracy - right.accuracy;
			}
			return right.timestamp - left.timestamp;
		})
		.slice(0, maxItems);
}

export function buildTopicMasteryItems(history, maxItems = 4) {
	return buildTopicGroups(history)
		.map(({ topic, entries }) => {
			const averageAccuracy = Math.round(
				entries.reduce((sum, entry) => sum + entry.accuracy, 0) / entries.length,
			);
			const trend = getTrendDirection(entries);
			const latestAccuracy = entries[0].accuracy;

			let status = 'needs-work';
			if (averageAccuracy >= 80 && latestAccuracy >= 75) {
				status = 'strong';
			} else if (trend === 'up' && latestAccuracy >= 60) {
				status = 'improving';
			} else if (
				averageAccuracy >= 60 &&
				latestAccuracy >= 60 &&
				trend !== 'down'
			) {
				status = 'steady';
			}

			return {
				id: entries[0].id,
				topic,
				attempts: entries.length,
				averageAccuracy,
				latestAccuracy,
				trend,
				status,
			};
		})
		.sort((left, right) => {
			if (left.averageAccuracy !== right.averageAccuracy) {
				return left.averageAccuracy - right.averageAccuracy;
			}
			return right.attempts - left.attempts;
		})
		.slice(0, maxItems);
}

export function buildReviewQueue(history, now = Date.now()) {
	const startOfToday = new Date(now);
	startOfToday.setHours(0, 0, 0, 0);
	const endOfToday = new Date(startOfToday.getTime() + ONE_DAY_MS - 1);

	const items = buildTopicGroups(history)
		.map(({ topic, entries }) => {
			const latestEntry = entries[0];
			const dueAt = latestEntry.timestamp + getReviewIntervalDays(latestEntry.accuracy) * ONE_DAY_MS;
			const isOverdue = dueAt < startOfToday.getTime();
			const isDueToday = dueAt <= endOfToday.getTime();

			return {
				id: latestEntry.id,
				topic,
				accuracy: latestEntry.accuracy,
				difficulty: latestEntry.difficulty,
				testType: latestEntry.testType,
				numQuestions: latestEntry.numQuestions,
				paperLanguage: latestEntry.paperLanguage,
				dueAt,
				isOverdue,
				isDueToday,
			};
		})
		.sort((left, right) => left.dueAt - right.dueAt);

	return {
		today: items.filter((item) => item.isDueToday),
		upcoming: items.filter((item) => !item.isDueToday).slice(0, 4),
	};
}
