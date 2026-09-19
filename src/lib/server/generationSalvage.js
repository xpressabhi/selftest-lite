// Salvage helpers for paper generation.
//
// The generator validates a whole batch at once: one defective question used
// to discard every good question in the batch. These pure helpers let the
// endpoint keep approved questions, regenerate only the rejected ones, and
// trim the paper to a smaller-but-valid size when the remaining drafts never
// pass. Everything here is deterministic and unit-tested.

export const BATCH_SIZE = 25;
export const MAX_GENERATION_ROUNDS = 5;
export const TOP_UP_BUFFER_RATIO = 0.4;
export const GENERATION_RESERVE_MS = 20000;
export const QUIZ_TRIM_FLOOR_RATIO = 0.6;
export const EXAM_TRIM_FLOOR_RATIO = 0.75;
export const MIN_QUIZ_QUESTIONS = 5;
export const MIN_EXAM_QUESTIONS = 15;
const MAX_REJECTED_HINTS = 8;
const MAX_APPROVED_HINTS = 10;

/** Smallest paper size that is still worth showing, per test mode. */
export function trimFloor(requested, testMode = 'quiz-practice') {
	const safeRequested = Math.max(1, Number(requested) || 0);
	if (testMode === 'full-exam') {
		return Math.min(
			safeRequested,
			Math.max(MIN_EXAM_QUESTIONS, Math.ceil(safeRequested * EXAM_TRIM_FLOOR_RATIO))
		);
	}
	return Math.min(
		safeRequested,
		Math.max(MIN_QUIZ_QUESTIONS, Math.ceil(safeRequested * QUIZ_TRIM_FLOOR_RATIO))
	);
}

/** True when the approved set is worth returning at its reduced size. */
export function shouldReturnTrimmed({ approved, requested, testMode = 'quiz-practice' }) {
	return approved >= trimFloor(requested, testMode);
}

/** Candidate count for the next round: missing plus a small buffer, capped. */
export function topUpBatchSize(missing, maxBatch = BATCH_SIZE) {
	const safeMissing = Math.max(1, Number(missing) || 1);
	const buffered = safeMissing + Math.max(1, Math.ceil(safeMissing * TOP_UP_BUFFER_RATIO));
	return Math.min(maxBatch, buffered);
}

/**
 * Splits a round's candidates into approved questions and rejected drafts
 * carrying their issue codes.
 *
 * `structuralIssues` and `qualityIssues`: `[{ index, issue }]`
 * `mismatchIndexes`: `number[]` from answer verification.
 */
export function partitionRound({
	questions = [],
	structuralIssues = [],
	qualityIssues = [],
	mismatchIndexes = [],
} = {}) {
	const issuesByIndex = new Map();
	const addIssue = (index, issue) => {
		const key = Number(index);
		if (!Number.isInteger(key) || key < 0 || key >= questions.length) return;
		const list = issuesByIndex.get(key) || [];
		list.push(issue);
		issuesByIndex.set(key, list);
	};
	for (const entry of structuralIssues) addIssue(entry?.index, entry?.issue || 'invalid-structure');
	for (const entry of qualityIssues) addIssue(entry?.index, entry?.issue || 'quality');
	for (const index of mismatchIndexes) addIssue(index, 'verification-disagreement');

	const approved = [];
	const rejected = [];
	questions.forEach((question, index) => {
		const issues = issuesByIndex.get(index);
		if (issues && issues.length > 0) {
			rejected.push({ question, issues });
		} else {
			approved.push(question);
		}
	});
	return { approved, rejected };
}

function truncateText(text, limit = 160) {
	const value = String(text || '')
		.replace(/\s+/gu, ' ')
		.trim();
	return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

/**
 * Prompt fragment for a replacement round: the rejected drafts with their
 * reasons so the model avoids repeating them, plus the approved questions.
 */
export function buildTopUpInstruction({ rejected = [], approvedTexts = [], round = 1, ask = 1 }) {
	const lines = [
		`Replacement round ${round}: generate exactly ${ask} NEW questions that replace the rejected drafts below.`,
		'Use different facts, sub-topics, or angles than the rejected ones.',
	];
	const rejectedHints = rejected
		.slice(0, MAX_REJECTED_HINTS)
		.map((entry, index) => {
			const reasons = [...new Set(entry?.issues || [])].join(', ');
			return `${index + 1}. "${truncateText(entry?.question?.question)}" (rejected: ${reasons || 'quality'})`;
		});
	if (rejectedHints.length > 0) {
		lines.push('Rejected drafts (do not repeat these questions or facts):');
		lines.push(...rejectedHints);
	}
	const approvedHints = approvedTexts
		.slice(-MAX_APPROVED_HINTS)
		.map((text) => `- "${truncateText(text)}"`);
	if (approvedHints.length > 0) {
		lines.push('Already approved in this paper (also avoid):');
		lines.push(...approvedHints);
	}
	return lines.join('\n');
}

/** Compact metadata for api_request_events (never stores question text). */
export function salvageSummary({
	requested,
	approved,
	rounds,
	rejectedCount,
	trimmed = false,
	issueCounts = {},
} = {}) {
	return {
		requested,
		approved,
		rounds,
		rejected: rejectedCount,
		trimmed,
		issueCounts,
	};
}
