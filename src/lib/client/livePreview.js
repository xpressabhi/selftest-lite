// Pure live-preview helpers for the conversational planner.
//
// Tier 0 (local): deterministic lexicon lookups — instant and free, so the
// plan card can fill in as the user types.
// Tier 1 (Jev): the caller asks the server only when the local tier is
// incomplete (an unmapped mention, a difficulty contradiction, or no topic),
// which keeps the network calls rare and the payload small.

import {
	buildTopicCandidates,
	clampQuestions,
	detectDifficulty,
	detectExamId,
	detectLanguage,
	detectTestType,
	extractMentionedFields,
	extractQuestionCount,
	hasDifficultyContradiction,
} from '$lib/shared/intentLexicon';

export const PREVIEW_MIN_CHARS = 3;
export const PREVIEW_MIN_INTERVAL_MS = 700;
export const PREVIEW_DEBOUNCE_MS = 900;

// The lexicon's exam pattern only covers acronyms; for previews the words
// "exam/mock/paper" are enough to ask Jev about the exam questions.
const EXAM_HINT_PATTERN = /\b(exams?|mocks?|papers?)\b|परीक्षा|मॉक|पेपर/iu;

function normalize(text) {
	return String(text || '')
		.trim()
		.replace(/\s+/gu, ' ');
}

/** True for a numeric test-ID search ("1234"), which never describes a plan. */
export function isTestIdQuery(text) {
	return /^\d+$/u.test(normalize(text));
}

/**
 * Local (Tier 0) reading of the message; null when there is too little text or
 * when the text is a test-ID search (the composer opens that test instead).
 */
export function buildLocalPreview(text) {
	const normalized = normalize(text);
	if (normalized.length < PREVIEW_MIN_CHARS || isTestIdQuery(normalized)) {
		return null;
	}
	const mentions = extractMentionedFields(normalized);
	const candidates = buildTopicCandidates(normalized);
	const { count, explicit } = extractQuestionCount(normalized);
	const bestCandidate = candidates[0] || '';
	const bestWords = bestCandidate ? bestCandidate.split(' ').length : 0;
	// The ranker prefers content-only spans, so "class 10 physics" loses to
	// "physics"; flag that so Jev can pick the fuller span.
	const hasLongerCandidate = candidates
		.slice(1)
		.some((candidate) => candidate.split(' ').length > bestWords);
	return {
		text: normalized,
		topic: bestCandidate,
		candidateCount: candidates.length,
		hasLongerCandidate,
		examHint: mentions.exam || EXAM_HINT_PATTERN.test(normalized),
		numQuestions: explicit ? clampQuestions(count) : null,
		examId: detectExamId(normalized),
		difficulty: mentions.difficulty ? detectDifficulty(normalized) : null,
		language: mentions.language ? detectLanguage(normalized) : null,
		testType: mentions.testType ? detectTestType(normalized) : null,
		difficultyContradiction: mentions.difficulty && hasDifficultyContradiction(normalized),
		mentions,
	};
}

/** True when Jev can resolve something the local tier could not. */
export function needsJevPreview(local) {
	if (!local) return false;
	if (!local.topic) return true;
	if (local.hasLongerCandidate) return true;
	if (local.examHint && !local.examId) return true;
	if (local.mentions.difficulty && (!local.difficulty || local.difficultyContradiction))
		return true;
	if (local.mentions.language && !local.language) return true;
	if (local.mentions.testType && !local.testType) return true;
	return false;
}

/**
 * A preview is worth showing only when it names a subject or an exam. A plan
 * whose topic is just the raw in-progress message (`topicSource: 'raw'`) does
 * not describe anything yet, and neither do secondary fields on their own.
 */
export function isMeaningfulPreview(preview) {
	const { topic, examId, topicSource } = preview || {};
	if (examId) return true;
	const trimmed = typeof topic === 'string' ? topic.trim() : '';
	if (!trimmed) return false;
	return topicSource !== 'raw';
}

/** Plan fields the local tier can set; locked (explicit) fields are skipped. */
export function buildLocalPlanPatch(local, explicit = {}) {
	if (!local) return null;
	const patch = {};
	if (local.topic && !explicit.topic) patch.topic = local.topic;
	if (local.numQuestions) patch.numQuestions = local.numQuestions;
	if (local.examId && !explicit.examId) patch.examId = local.examId;
	if (local.difficulty && !explicit.difficulty) patch.difficulty = local.difficulty;
	if (local.language && !explicit.language) patch.language = local.language;
	if (local.testType && !explicit.testType) patch.testType = local.testType;
	return Object.keys(patch).length > 0 ? patch : null;
}

/** Throttle rules for the Tier 1 request. */
export function shouldRunPreview({
	text,
	lastText = '',
	status = 'idle',
	offline = false,
	dataSaver = false,
	lastAt = 0,
	now = 0,
	pausedUntil = 0,
	minIntervalMs = PREVIEW_MIN_INTERVAL_MS,
	minChars = PREVIEW_MIN_CHARS,
} = {}) {
	const normalized = normalize(text);
	if (normalized.length < minChars) return false;
	if (normalized === lastText) return false;
	if (isTestIdQuery(normalized)) return false; // test-id search path
	if (status === 'parsing') return false;
	if (offline || dataSaver) return false;
	if (pausedUntil && now < pausedUntil) return false;
	if (lastAt && now - lastAt < minIntervalMs) return false;
	return true;
}
