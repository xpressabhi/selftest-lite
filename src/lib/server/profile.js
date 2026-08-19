// Adaptive personalization engine: turns attempt history + the stored user
// profile into learner signals (weak/strong topics, accuracy), a resolved
// difficulty for the next paper, a merged focus list, and the PII-free
// context blocks injected into generation and intent-parsing prompts.
//
// Everything here is a pure function except computeLearnerSignals, which
// reads attempt rows through listAttemptsForIdentity.

import { listAttemptsForIdentity } from './storage';
import { VALID_DIFFICULTIES } from './quizConfig';
import { isPersonalized } from '$lib/shared/userProfile';

export const MIN_TOPIC_ATTEMPTS = 2;
export const HIGH_ACCURACY = 0.85;
export const LOW_ACCURACY = 0.6;
export const WARM_UP_RATIO = 0.2;
export const MAX_FOCUS_TOPICS = 5;
export const MAX_WEAK_TOPICS_IN_CONTEXT = 3;
export const RECENCY_HALF_LIFE_DAYS = 30;

const CLASS_LABELS = {
	'class-8': 'Class 8',
	'class-9': 'Class 9',
	'class-10': 'Class 10',
	'class-11': 'Class 11',
	'class-12': 'Class 12',
	college: 'College',
	'working-professional': 'Working Professional',
	other: 'Other',
};

const PROFESSION_LABELS = {
	'software-engineering': 'Software Engineer / IT',
	'engineering-non-it': 'Engineering (non-IT)',
	'banking-finance': 'Banking & Finance',
	healthcare: 'Healthcare / Medical',
	teaching: 'Teaching / Education',
	government: 'Government / Public Sector',
	law: 'Law / Legal',
	business: 'Business / Self-employed',
	'marketing-sales': 'Marketing / Sales',
	other: 'Other',
};

function recencyWeight(submittedAt, nowMs) {
	if (!submittedAt) {
		return 1;
	}
	const submittedMs = new Date(submittedAt).getTime();
	if (Number.isNaN(submittedMs)) {
		return 1;
	}
	const ageDays = Math.max(0, (nowMs - submittedMs) / (24 * 60 * 60 * 1000));
	return 0.5 ** (ageDays / RECENCY_HALF_LIFE_DAYS);
}

function gradeAttempt(row) {
	const questions = row?.test?.questions;
	if (!Array.isArray(questions) || questions.length === 0) {
		return null;
	}
	const userAnswers = row?.user_answers;
	if (!userAnswers || typeof userAnswers !== 'object' || Array.isArray(userAnswers)) {
		return null;
	}
	let answered = 0;
	let correct = 0;
	for (let index = 0; index < questions.length; index += 1) {
		const question = questions[index];
		const yourAnswer = userAnswers[String(index)];
		if (typeof yourAnswer !== 'string' || !yourAnswer.trim()) {
			continue;
		}
		const correctAnswer = typeof question?.answer === 'string' ? question.answer.trim() : null;
		if (correctAnswer === null) {
			continue;
		}
		answered += 1;
		if (yourAnswer.trim() === correctAnswer) {
			correct += 1;
		}
	}
	if (answered === 0) {
		return null;
	}
	return { answered, correct };
}

function topicKey(value) {
	return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim().toLowerCase() : '';
}

/**
 * Aggregates attempt rows (the shape returned by listAttemptsForIdentity)
 * into learner signals. Pure function, unit-testable.
 */
export function aggregateLearnerSignals(rows, nowMs = Date.now()) {
	const attempts = Array.isArray(rows) ? rows : [];
	const perTopic = new Map();
	let answeredWeighted = 0;
	let correctWeighted = 0;
	let testsTaken = 0;
	let lastDifficulty = null;
	let lastAttemptAtMs = 0;

	for (const row of attempts) {
		const graded = gradeAttempt(row);
		if (!graded) {
			continue;
		}
		testsTaken += 1;
		const submittedMs = row?.submitted_at ? new Date(row.submitted_at).getTime() : nowMs;
		if (Number.isFinite(submittedMs) && submittedMs > lastAttemptAtMs) {
			lastAttemptAtMs = submittedMs;
			lastDifficulty =
				typeof row.difficulty === 'string' && row.difficulty.length > 0
					? row.difficulty
					: lastDifficulty;
		}

		const weight = recencyWeight(submittedMs, nowMs);
		answeredWeighted += graded.answered * weight;
		correctWeighted += graded.correct * weight;

		const topic = topicKey(row?.topic || row?.test?.topic || '');
		if (!topic) {
			continue;
		}
		const entry = perTopic.get(topic) || {
			topic: topic,
			displayTopic: row.topic || row.test.topic || topic,
			answeredWeighted: 0,
			correctWeighted: 0,
			attempts: 0,
		};
		entry.answeredWeighted += graded.answered * weight;
		entry.correctWeighted += graded.correct * weight;
		entry.attempts += 1;
		perTopic.set(topic, entry);
	}

	const topicSignals = Array.from(perTopic.values()).map((entry) => {
		const accuracy =
			entry.answeredWeighted > 0 ? entry.correctWeighted / entry.answeredWeighted : 0;
		return {
			topic: entry.displayTopic,
			accuracy: Number(accuracy.toFixed(4)),
			attempts: entry.attempts,
		};
	});

	return {
		weakTopics: topicSignals
			.filter(
				(signal) => signal.attempts >= MIN_TOPIC_ATTEMPTS && signal.accuracy < LOW_ACCURACY
			)
			.sort((a, b) => a.accuracy - b.accuracy),
		strongTopics: topicSignals
			.filter(
				(signal) =>
					signal.attempts >= MIN_TOPIC_ATTEMPTS && signal.accuracy >= HIGH_ACCURACY
			)
			.sort((a, b) => b.accuracy - a.accuracy),
		overallAccuracy:
			answeredWeighted > 0 ? Number((correctWeighted / answeredWeighted).toFixed(4)) : null,
		testsTaken,
		lastDifficulty,
	};
}

/** Fetches the identity's attempt history and aggregates it into signals. */
export async function computeLearnerSignals({ userId, clientId } = {}) {
	const rows = await listAttemptsForIdentity({ userId, clientId }, { limit: 200 });
	return aggregateLearnerSignals(rows);
}

/**
 * Finds the learner signal for the topic being tested, by normalized
 * substring matching against the request's topic keywords.
 */
export function matchTopicSignal(signals, keywords = []) {
	const candidates = Array.isArray(keywords)
		? keywords.map((value) => String(value || '').trim()).filter(Boolean)
		: [];
	if (candidates.length === 0 || (!signals?.weakTopics && !signals?.strongTopics)) {
		return null;
	}
	const allTopics = [...(signals.weakTopics || []), ...(signals.strongTopics || [])];
	if (allTopics.length === 0) {
		return null;
	}
	const normalizedKeywords = candidates
		.map((value) => topicKey(value))
		.filter((value) => value.length >= 4);
	for (const keyword of normalizedKeywords) {
		const match = allTopics.find((signal) => {
			const topic = topicKey(signal.topic);
			return topic.includes(keyword) || keyword.includes(topic);
		});
		if (match) {
			return match;
		}
	}
	return null;
}

const DIFFICULTY_ORDER = Object.fromEntries(
	VALID_DIFFICULTIES.map((level, index) => [level, index])
);

function shiftDifficulty(level, delta) {
	const index = DIFFICULTY_ORDER[level];
	if (index === undefined) {
		return level;
	}
	const nextIndex = Math.min(VALID_DIFFICULTIES.length - 1, Math.max(0, index + delta));
	return VALID_DIFFICULTIES[nextIndex];
}

/**
 * Resolves the difficulty for the next paper on a topic.
 * - An explicit user-chosen difficulty always wins.
 * - Otherwise the adaptive ladder seeds from the difficulty of the user's
 *   most recent attempt (comfort level for new learners) and adjusts one
 *   level based on recent accuracy (≥85% → up, <60% → down).
 */
export function resolveDifficulty({
	profile = null,
	signals = null,
	requestDifficulty = 'intermediate',
	difficultyExplicit = false,
	topicKeywords = [],
}) {
	if (difficultyExplicit) {
		return requestDifficulty;
	}
	if (!isPersonalized(profile)) {
		return requestDifficulty;
	}

	const baseDifficulty =
		signals?.lastDifficulty && VALID_DIFFICULTIES.includes(signals.lastDifficulty)
			? signals.lastDifficulty
			: profile?.preferences?.difficultyComfort || 'beginner';

	const matched = matchTopicSignal(signals, topicKeywords);
	const accuracy = matched ? matched.accuracy : signals?.overallAccuracy;
	if (accuracy === null || accuracy === undefined) {
		return baseDifficulty;
	}
	if (accuracy >= HIGH_ACCURACY) {
		return shiftDifficulty(baseDifficulty, 1);
	}
	if (accuracy < LOW_ACCURACY) {
		return shiftDifficulty(baseDifficulty, -1);
	}
	return baseDifficulty;
}

/** The warm-up level sits one notch below the resolved target difficulty. */
export function resolveWarmUpDifficulty(resolvedDifficulty) {
	if (!VALID_DIFFICULTIES.includes(resolvedDifficulty)) {
		return null;
	}
	if (DIFFICULTY_ORDER[resolvedDifficulty] === 0) {
		return null;
	}
	return shiftDifficulty(resolvedDifficulty, -1);
}

/**
 * Merges declared focus topics with inferred weak topics into a single
 * capped list: declared first (user intent), then weakest first.
 */
export function mergeFocusTopics({ declared = [], weak = [], limit = MAX_FOCUS_TOPICS } = {}) {
	const result = [];
	const seen = new Set();
	const push = (topic) => {
		if (typeof topic !== 'string' || !topic.trim()) {
			return;
		}
		const key = topicKey(topic);
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		result.push(topic.trim());
	};
	for (const topic of Array.isArray(declared) ? declared : []) {
		push(topic);
	}
	for (const signal of Array.isArray(weak) ? weak : []) {
		push(signal.topic);
	}
	return result.slice(0, limit);
}

function formatAccuracy(value) {
	if (typeof value !== 'number') {
		return 'n/a';
	}
	return `${Math.round(value * 100)}%`;
}

function classLabel(profile) {
	return profile?.class ? CLASS_LABELS[profile.class] || null : null;
}

function professionLabel(profile) {
	return profile?.profession ? PROFESSION_LABELS[profile.profession] || null : null;
}

/**
 * Builds the PII-free user context block injected into the generation
 * prompt. Returns null when there is nothing to say (no profile or not
 * personalized).
 */
export function buildProfileContext({
	profile = null,
	signals = null,
	resolvedDifficulty = null,
	warmUpDifficulty = null,
	topicKeywords = [],
}) {
	if (!isPersonalized(profile)) {
		return null;
	}

	const lines = [];
	const className = classLabel(profile);
	if (className) {
		lines.push(`- Student level: ${className}`);
	}
	const professionName = professionLabel(profile);
	if (professionName) {
		lines.push(`- Profession: ${professionName}`);
	}
	if (profile?.examTarget?.name) {
		lines.push(`- Exam target: ${profile.examTarget.name}`);
	}
	if (Array.isArray(profile?.subjects) && profile.subjects.length > 0) {
		lines.push(`- Subjects studied: ${profile.subjects.join(', ')}`);
	}
	if (resolvedDifficulty) {
		lines.push(`- Resolved difficulty: ${resolvedDifficulty}`);
	}

	const matched = matchTopicSignal(signals, topicKeywords);
	const weakTopics = (signals?.weakTopics || []).slice(0, MAX_WEAK_TOPICS_IN_CONTEXT);
	const relevantWeak = matched
		? weakTopics.filter((signal) => topicKey(signal.topic) === topicKey(matched.topic))
		: [];
	const focusTopics = mergeFocusTopics({
		declared: profile?.declaredFocus || [],
		weak: relevantWeak,
	});
	if (focusTopics.length > 0) {
		lines.push(`- Focus topics: ${focusTopics.join(', ')}`);
	}
	if (relevantWeak.length > 0) {
		const detail = relevantWeak
			.map(
				(signal) =>
					`${signal.topic} (${formatAccuracy(signal.accuracy)} accuracy, ${signal.attempts} attempts)`
			)
			.join(', ');
		lines.push(`- Practice areas to include: ${detail}`);
	}

	if (lines.length === 0) {
		return null;
	}

	const rules = [];
	if (warmUpDifficulty) {
		rules.push(
			`Begin with approximately the first 20% of questions as a gentle warm-up at ${warmUpDifficulty} level, then ramp up to ${resolvedDifficulty} for the remaining questions.`
		);
	}
	if (focusTopics.length > 0) {
		rules.push(
			`Focus topics are hints WITHIN the requested Topic only. Never switch away from the requested Topic: generate the quiz about the requested Topic and weight some questions toward these focus topics. If a focus or practice topic is unrelated to the requested Topic, ignore it.`
		);
	}
	if (profile?.examTarget?.name || className) {
		rules.push(
			`Match the question style and rigor expected at the student's stated level and exam target.`
		);
	}

	return [
		'USER CONTEXT (personalized for this student; keep this private):',
		...lines,
		...rules,
	].join('\n');
}

/**
 * Builds the short STUDENT CONTEXT line injected into the intent-parsing
 * prompt so ambiguous requests resolve against the learner's profile.
 */
export function buildStudentContext(profile = null) {
	if (!isPersonalized(profile)) {
		return null;
	}
	const parts = [];
	const className = classLabel(profile);
	if (className) {
		parts.push(`class: ${className}`);
	}
	const professionName = professionLabel(profile);
	if (professionName) {
		parts.push(`profession: ${professionName}`);
	}
	if (profile?.examTarget?.name) {
		parts.push(`exam target: ${profile.examTarget.name}`);
	}
	if (Array.isArray(profile?.subjects) && profile.subjects.length > 0) {
		parts.push(`subjects: ${profile.subjects.join(', ')}`);
	}
	if (profile?.preferences?.language) {
		parts.push(`preferred language: ${profile.preferences.language}`);
	}
	if (profile?.preferences?.difficultyComfort) {
		parts.push(`difficulty comfort: ${profile.preferences.difficultyComfort}`);
	}
	if (parts.length === 0) {
		return null;
	}
	return [
		"STUDENT CONTEXT (use only to disambiguate vague intents; the user's explicit words always win):",
		parts.map((part) => `- ${part}`).join('\n'),
	].join('\n');
}

/** Short, PII-free summary shown in the UI ("Adjusted for ..."). */
export function buildTailoredSummary({
	profile = null,
	signals = null,
	resolvedDifficulty = null,
}) {
	if (!isPersonalized(profile)) {
		return null;
	}
	const parts = [];
	if (profile?.examTarget?.name) {
		parts.push(profile.examTarget.name);
	} else if (classLabel(profile)) {
		parts.push(classLabel(profile));
	}
	if (resolvedDifficulty) {
		parts.push(resolvedDifficulty);
	}
	const focusTopics = mergeFocusTopics({
		declared: profile?.declaredFocus || [],
		weak: signals?.weakTopics || [],
	});
	if (focusTopics.length > 0) {
		parts.push(`focus: ${focusTopics.slice(0, 3).join(', ')}`);
	}
	return parts.length > 0 ? parts.join(' • ') : null;
}

export { CLASS_LABELS };
