// Offline grading queue.
//
// A paper is cached locally the moment it is generated (saveCurrentPaper), so
// the test page can render it with no network. Grading still needs the answer
// key, which never leaves the server — so an offline submission stores the raw
// answers here and replays /api/test/submit when the connection returns. The
// attempt is not shown as scored until that replay succeeds.
import { getClientHeaders } from './identity.js';
import { STORAGE_KEYS } from './constants.js';
import {
	clearDraftAnswers,
	clearDraftFlags,
	clearDraftHints,
	clearUnsubmittedTest,
	getHistory,
	readJson,
	saveAttemptResult,
	upsertHistory,
	writeJson,
} from './storage.js';

const PENDING_LIMIT = 10;
export const PENDING_GRADES_EVENT = 'selftest:pending-grades';

function readPending() {
	const value = readJson(STORAGE_KEYS.PENDING_GRADES, []);
	return Array.isArray(value) ? value.filter((entry) => entry?.testId) : [];
}

function writePending(entries) {
	writeJson(STORAGE_KEYS.PENDING_GRADES, entries.slice(-PENDING_LIMIT));
}

/** Queues one offline submission, replacing any earlier copy for the test. */
export function queuePendingGrade({
	testId,
	answers = {},
	timeTaken = 0,
	hintedIndexes = {},
	name = '',
}) {
	if (!testId) {
		return;
	}
	const pending = readPending().filter(
		(entry) => String(entry.testId) !== String(testId)
	);
	pending.push({
		testId,
		answers,
		timeTaken,
		hintedIndexes,
		name,
		queuedAt: Date.now(),
	});
	writePending(pending);
}

export function readPendingGrades() {
	return readPending();
}

export function hasPendingGrade(testId) {
	return readPending().some((entry) => String(entry.testId) === String(testId));
}

/**
 * Replays every queued submission. A failed entry stays queued (including the
 * one that just failed); a successful entry is graded, stored locally, and
 * moved out of the draft state so the results page has a normal record.
 */
export async function flushPendingGrades() {
	if (typeof window === 'undefined') {
		return 0;
	}
	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		return 0;
	}
	const pending = readPending();
	if (pending.length === 0) {
		return 0;
	}

	const remaining = [];
	let graded = 0;
	for (const entry of pending) {
		try {
			const response = await fetch('/api/test/submit', {
				method: 'POST',
				headers: getClientHeaders(),
				body: JSON.stringify({
					id: entry.testId,
					answers: entry.answers,
					timeTaken: entry.timeTaken,
					hintedIndexes: entry.hintedIndexes,
					name: entry.name,
				}),
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(data.error || 'Failed to grade queued attempt');
			}
			saveAttemptResult(entry.testId, data);
			const paper =
				getHistory().find((record) => String(record.id) === String(entry.testId)) || {};
			upsertHistory({
				...paper,
				id: entry.testId,
				userAnswers: entry.answers,
				score: data.score,
				totalQuestions: data.totalQuestions,
				timeTaken: entry.timeTaken,
				timestamp: Date.now(),
				pendingGrade: false,
			});
			clearDraftAnswers(entry.testId);
			clearDraftFlags(entry.testId);
			clearDraftHints(entry.testId);
			clearUnsubmittedTest(entry.testId);
			graded += 1;
		} catch {
			remaining.push(entry);
		}
	}

	writePending(remaining);
	if (graded > 0) {
		window.dispatchEvent(
			new CustomEvent(PENDING_GRADES_EVENT, { detail: { graded } })
		);
	}
	return graded;
}
