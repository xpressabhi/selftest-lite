import {
	LOCAL_STORAGE_CHANGE_EVENT,
	LOCAL_STORAGE_SYNC_EVENT,
	STORAGE_KEYS,
} from './constants';

export function emitLocalStorageChange(keys = []) {
	if (typeof window === 'undefined') {
		return;
	}

	const normalizedKeys = Array.isArray(keys) ? keys : [keys];
	window.dispatchEvent(
		new CustomEvent(LOCAL_STORAGE_CHANGE_EVENT, {
			detail: {
				keys: normalizedKeys.filter(Boolean),
			},
		}),
	);
}

export function readJson(key, fallback) {
	if (typeof window === 'undefined') {
		return fallback;
	}

	try {
		const rawValue = window.localStorage.getItem(key);
		return rawValue ? JSON.parse(rawValue) : fallback;
	} catch (error) {
		console.error('Failed to read localStorage key:', key, error);
		return fallback;
	}
}

export function writeJson(key, value) {
	if (typeof window === 'undefined') {
		return;
	}

	try {
		window.localStorage.setItem(key, JSON.stringify(value));
		emitLocalStorageChange(key);
	} catch (error) {
		console.error('Failed to write localStorage key:', key, error);
	}
}

export function removeKey(key) {
	if (typeof window === 'undefined') {
		return;
	}

	try {
		window.localStorage.removeItem(key);
		emitLocalStorageChange(key);
	} catch (error) {
		console.error('Failed to remove localStorage key:', key, error);
	}
}

export function getHistory() {
	const history = readJson(STORAGE_KEYS.TEST_HISTORY, []);
	return Array.isArray(history) ? history : [];
}

export function saveHistory(history) {
	const normalized = Array.isArray(history) ? history : [];
	writeJson(
		STORAGE_KEYS.TEST_HISTORY,
		normalized
			.filter((entry) => entry && typeof entry === 'object')
			.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
			.slice(0, 150),
	);
}

export function upsertHistory(test) {
	if (!test?.id) {
		return;
	}

	const history = getHistory().filter((entry) => String(entry.id) !== String(test.id));
	const normalizedTest = {
		...test,
		timestamp: test.timestamp || Date.now(),
	};
	saveHistory([normalizedTest, ...history]);
}

export function saveCurrentPaper(test) {
	writeJson(STORAGE_KEYS.QUESTION_PAPER, test);
	if (test?.id) {
		upsertHistory(test);
	}
}

export function getCurrentPaper() {
	return readJson(STORAGE_KEYS.QUESTION_PAPER, null);
}

export function getBookmarkedExamIds() {
	const value = readJson(STORAGE_KEYS.BOOKMARKED_EXAMS, []);
	return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

export function saveBookmarkedExamIds(examIds) {
	writeJson(
		STORAGE_KEYS.BOOKMARKED_EXAMS,
		Array.isArray(examIds) ? [...new Set(examIds.filter(Boolean))].slice(0, 20) : [],
	);
}

export function getBookmarkedQuizPresets() {
	const value = readJson(STORAGE_KEYS.BOOKMARKED_QUIZ_PRESETS, []);
	return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}

export function saveBookmarkedQuizPresets(presets) {
	writeJson(
		STORAGE_KEYS.BOOKMARKED_QUIZ_PRESETS,
		Array.isArray(presets) ? presets.filter((item) => item && typeof item === 'object').slice(0, 20) : [],
	);
}

export function getQuestionBookmarks() {
	const value = readJson(STORAGE_KEYS.QUESTION_BOOKMARKS, []);
	return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
}

export function saveQuestionBookmarks(bookmarks) {
	writeJson(
		STORAGE_KEYS.QUESTION_BOOKMARKS,
		Array.isArray(bookmarks) ? bookmarks.filter((item) => item && typeof item === 'object').slice(0, 300) : [],
	);
}

export function isQuestionBookmarked(question) {
	return getQuestionBookmarks().some(
		(item) => item.question === question?.question && item.answer === question?.answer,
	);
}

export function toggleQuestionBookmark(question, metadata = {}) {
	if (!question?.question) {
		return [];
	}
	const bookmarks = getQuestionBookmarks();
	const exists = bookmarks.some(
		(item) => item.question === question.question && item.answer === question.answer,
	);
	const nextBookmarks = exists
		? bookmarks.filter((item) => item.question !== question.question || item.answer !== question.answer)
		: [
				{
					...question,
					...metadata,
					bookmarkedAt: Date.now(),
				},
				...bookmarks,
			];
	saveQuestionBookmarks(nextBookmarks);
	return nextBookmarks;
}

export function getDraftAnswerKey(testId) {
	return `${STORAGE_KEYS.UNSUBMITTED_TEST}_answers_${testId || 'current'}`;
}

export function readDraftAnswers(testId) {
	const answers = readJson(getDraftAnswerKey(testId), {});
	return answers && typeof answers === 'object' && !Array.isArray(answers)
		? answers
		: {};
}

export function writeDraftAnswers(testId, answers) {
	writeJson(getDraftAnswerKey(testId), answers || {});
}

export function clearDraftAnswers(testId) {
	removeKey(getDraftAnswerKey(testId));
}

export function getUnsubmittedTest() {
	return readJson(STORAGE_KEYS.UNSUBMITTED_TEST, null);
}

export function saveUnsubmittedTest(test) {
	if (!test?.id) {
		return;
	}
	writeJson(STORAGE_KEYS.UNSUBMITTED_TEST, {
		id: test.id,
		topic: test.topic || '',
		timestamp: Date.now(),
		totalQuestions: test.questions?.length || test.totalQuestions || 0,
	});
}

export function clearUnsubmittedTest(testId) {
	const current = getUnsubmittedTest();
	if (!testId || !current || String(current.id) === String(testId)) {
		removeKey(STORAGE_KEYS.UNSUBMITTED_TEST);
	}
}

export async function resolveTestRecord(testId) {
	if (!testId) {
		const currentPaper = getCurrentPaper();
		if (currentPaper) {
			return currentPaper;
		}
		return getHistory()[0] || null;
	}

	const localRecord = getHistory().find((entry) => String(entry.id) === String(testId));
	if (localRecord) {
		return localRecord;
	}

	const response = await fetch(`/api/test?id=${encodeURIComponent(testId)}`, {
		cache: 'no-store',
	});
	if (!response.ok) {
		return null;
	}

	const record = await response.json();
	if (!record?.test) {
		return null;
	}

	const resolved = {
		...record.test,
		id: Number(record.id),
		createdAt: record.created_at,
		myAttempt: record.myAttempt || null,
	};
	if (record.myAttempt?.user_answers || record.myAttempt?.userAnswers) {
		resolved.userAnswers = record.myAttempt.user_answers || record.myAttempt.userAnswers;
		resolved.score = record.myAttempt.score;
		resolved.totalQuestions = record.myAttempt.total_questions || record.myAttempt.totalQuestions;
		resolved.timeTaken = record.myAttempt.time_taken || record.myAttempt.timeTaken;
		resolved.timestamp = new Date(record.myAttempt.submitted_at || Date.now()).getTime();
	}
	upsertHistory(resolved);
	return resolved;
}

export function writeTrackedStorageSnapshot(snapshot) {
	if (typeof window === 'undefined' || !snapshot || typeof snapshot !== 'object') {
		return [];
	}

	const changedKeys = [];
	for (const [key, value] of Object.entries(snapshot)) {
		if (typeof value !== 'string') {
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
			new CustomEvent(LOCAL_STORAGE_SYNC_EVENT, {
				detail: {
					keys: changedKeys,
				},
			}),
		);
	}

	return changedKeys;
}
