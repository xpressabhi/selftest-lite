// Pure nudge policy engine: eligibility filtering, Jev question building and
// deterministic derivation for in-page asks and notification ranking.
//
// No network, no database, no Svelte: /api/personalize owns I/O. Everything
// here fails closed (silence): low confidence, missing answers, guardrail
// misses, ineligible kinds and malformed state all return no nudge. The model
// selects among candidates and thresholds that code owns; it never invents a
// kind, badges an item, or spends a permission prompt.

import { createHash } from 'node:crypto';
import * as z from 'zod';
import {
	CHALLENGE_MIN_PCT,
	MAX_NOTIFICATION_CANDIDATES,
	NUDGE_CONFIDENCE_HIGH,
	NUDGE_CONFIDENCE_MIN,
	NUDGE_HOLDOUT_PERCENT,
	NUDGE_KINDS,
	NUDGE_PAGES,
	NOTIFICATION_RELEVANCE_MIN,
	RECEPTIVITY_MIN,
	REMINDER_FIT_MIN,
	SHARE_KINDS,
	SHARE_PRIDE_MIN,
	STREAK_SHARE_MIN,
	eligibleNudgeKinds,
	nudgeCohort,
	nudgeKindGroup
} from '$lib/shared/nudgePolicy.js';

export {
	CHALLENGE_MIN_PCT,
	MAX_NOTIFICATION_CANDIDATES,
	NUDGE_CONFIDENCE_HIGH,
	NUDGE_CONFIDENCE_MIN,
	NUDGE_HOLDOUT_PERCENT,
	NUDGE_KINDS,
	NUDGE_PAGES,
	NOTIFICATION_RELEVANCE_MIN,
	RECEPTIVITY_MIN,
	REMINDER_FIT_MIN,
	SHARE_KINDS,
	SHARE_PRIDE_MIN,
	STREAK_SHARE_MIN,
	eligibleNudgeKinds,
	nudgeCohort,
	nudgeKindGroup
};

// ---- State sanitizing -------------------------------------------------------
// One hostile or stale field must never break the whole nudge (fail-open), so
// every field has a catch fallback and candidates are filtered individually.

const clampedInt = (max) => z.coerce.number().int().min(0).max(max).catch(0);

const candidateSchema = z.object({
	id: z
		.union([z.string(), z.number()])
		.transform((value) => String(value).slice(0, 64))
		.refine((value) => value.length > 0),
	org: z
		.string()
		.transform((value) => value.slice(0, 120))
		.catch(''),
	title: z.string().transform((value) => value.slice(0, 240)),
	category: z
		.string()
		.transform((value) => value.slice(0, 60))
		.nullable()
		.catch(null),
	state: z
		.string()
		.transform((value) => value.slice(0, 60))
		.nullable()
		.catch(null),
	status: z.enum(['upcoming', 'open', 'closing_soon', 'closed']).catch('upcoming'),
	daysLeft: z.number().int().min(0).max(3650).nullable().catch(null),
	match: z
		.enum(['bookmarked', 'practiced', 'category', 'state', 'level', 'none'])
		.catch('none')
});

const nudgeStateSchema = z.object({
	testsTotal: clampedInt(100000),
	distinctTestDays: clampedInt(100000),
	testsThisWeek: clampedInt(10000),
	currentStreak: clampedInt(10000),
	daysSinceLastTest: z.number().int().min(0).max(3650).nullable().catch(null),
	lastScore: z
		.object({
			pct: z.number().min(0).max(100).catch(0),
			total: clampedInt(1000)
		})
		.nullable()
		.catch(null),
	bestBeaten: z.boolean().catch(false),
	shareUsed: z.boolean().catch(false),
	shareSheetOpenedThisResult: z.boolean().catch(false),
	reminderState: z.enum(['off', 'on', 'denied', 'unsupported']).catch('off'),
	nudgeHistory: z
		.object({
			lastShareDaysAgo: z.number().int().min(0).max(3650).nullable().catch(null),
			lastPushDaysAgo: z.number().int().min(0).max(3650).nullable().catch(null),
			dismissals: clampedInt(100)
		})
		.catch({ lastShareDaysAgo: null, lastPushDaysAgo: null, dismissals: 0 }),
	session: z
		.object({
			secondsOnPage: clampedInt(86400),
			interactionCount: clampedInt(10000),
			hourLocal: clampedInt(23),
			isDataSaver: z.boolean().catch(false)
		})
		.catch({ secondsOnPage: 0, interactionCount: 0, hourLocal: 0, isDataSaver: false }),
	locale: z.enum(['en', 'hi']).catch('en'),
	topics: z
		.array(z.string().transform((value) => value.slice(0, 80)))
		.catch([])
		.transform((list) => list.slice(0, 5))
});

function sanitizeCandidates(raw) {
	if (!Array.isArray(raw)) {
		return [];
	}
	const candidates = [];
	for (const item of raw.slice(0, MAX_NOTIFICATION_CANDIDATES * 2)) {
		const parsed = candidateSchema.safeParse(item);
		if (parsed.success) {
			candidates.push(parsed.data);
		}
		if (candidates.length >= MAX_NOTIFICATION_CANDIDATES) {
			break;
		}
	}
	return candidates;
}

/**
 * Validates and clamps the client nudge slice. Returns null for unknown pages
 * or unusable input; the caller then simply sends no nudge questions.
 */
export function sanitizeNudgeState(raw, page) {
	if (!NUDGE_PAGES.includes(page) || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}
	const parsed = nudgeStateSchema.safeParse(raw);
	if (!parsed.success) {
		return null;
	}
	return {
		page,
		...parsed.data,
		candidates: page === 'notifications' ? sanitizeCandidates(raw.candidates) : []
	};
}

// ---- Eligibility ------------------------------------------------------------
// (nudgeCohort / eligibleNudgeKinds live in the shared policy module so the
// browser pre-filter and the question builder can never disagree.)

// ---- Questions --------------------------------------------------------------

const KIND_CRITERIA = {
	share_result:
		'A fresh result is on screen and the learner is still with it; sharing the plain link feels natural',
	challenge_friend:
		'A fresh result strong enough to challenge a friend to beat; the rivalry makes the ask welcome',
	share_streak:
		'Streak progress of three or more days is the salient win; sharing the streak card fits',
	enable_reminders:
		'A returning learner whose practice habit is worth protecting; a daily reminder would be welcome, not pushy'
};

const WAIT_CRITERIA = 'A later checkpoint (next result, next visit) fits better than this moment';
const NOTHING_CRITERIA = 'An ask would be unwelcome or pointless right now';

const PRIDE_LEVELS = [
	'Not a moment; showing this result to a friend would feel awkward',
	'Fine; acceptable if offered',
	'Proud; a strong moment to show off'
];

const REMINDER_FIT_LEVELS = [
	'No habit yet; a reminder would be noise',
	'Some routine; a gentle reminder might land',
	'Clear habit; a reminder protects something real'
];

const RECEPTIVITY_INSTRUCTIONS =
	'Is the learner in a calm, attentive moment, likely to welcome a small ask rather than feeling rushed or interrupted? Weigh time on the page, interactions so far, hour of day, and dismissal history.';

function momentInstructions(state, kinds) {
	const hasPush = kinds.includes('enable_reminders');
	return [
		'What single ask, if any, fits this learner at this moment?',
		`The learner has completed ${state.testsTotal} tests over ${state.distinctTestDays} distinct practice days, with a current streak of ${state.currentStreak}.`,
		hasPush
			? 'A reminder ask spends a browser permission prompt, so only choose it when the habit clearly justifies it.'
			: 'Only the listed asks are available; never invent another.',
		'Choose wait when a later checkpoint will fit better, and nothing when no ask is warranted.'
	].join(' ');
}

function notificationInstructions() {
	return [
		'Which single exam update, if any, deserves to interrupt this learner in the app right now?',
		'The candidates are government recruitment notices matched to exams the learner follows or practices.',
		'Choose none when nothing should interrupt, even if an update is useful.'
	].join(' ');
}

function relevanceInstructions(candidate, topics = []) {
	const where = candidate.state ? `${candidate.state} state` : 'national';
	const practice =
		topics.length > 0 ? ` Learner's recent practice topics: ${topics.join('; ')}.` : '';
	return `How relevant is this update to this learner? Candidate: ${candidate.org} — ${candidate.title} (${candidate.category || 'uncategorised'}, ${where}, status ${candidate.status}).${practice}`;
}

function buildNotificationQuestions(state) {
	const candidates = state.candidates.slice(0, MAX_NOTIFICATION_CANDIDATES);
	if (candidates.length === 0) {
		return {};
	}
	const criteria = {};
	for (const candidate of candidates) {
		criteria[String(candidate.id)] = `${candidate.org}: ${candidate.title} — ${candidate.match} match, status ${candidate.status}`;
	}
	criteria.none = 'Nothing should interrupt right now';
	const questions = {
		nudge_notify_item: {
			type: 'choice',
			instructions: notificationInstructions(),
			criteria
		}
	};
	for (const candidate of candidates) {
		if (candidate.match === 'bookmarked' || candidate.match === 'practiced') {
			continue;
		}
		questions[`nudge_relevance_${candidate.id}`] = {
			type: 'score',
			instructions: relevanceInstructions(candidate, state.topics),
			criteria: [
				'Unrelated to this learner; surfacing it would be noise',
				'Worth seeing; same broad area as the learner follows',
				"Directly matches this learner's exams or stated preparation"
			]
		};
	}
	questions.nudge_receptivity = { type: 'noul', instructions: RECEPTIVITY_INSTRUCTIONS };
	return questions;
}

/**
 * Builds the System One `questions` map for a nudge moment. Empty object means
 * no question is asked and no tokens are spent.
 */
export function buildNudgeQuestions(state) {
	if (!state || !NUDGE_PAGES.includes(state.page)) {
		return {};
	}
	if (state.page === 'notifications') {
		return buildNotificationQuestions(state);
	}
	const kinds = eligibleNudgeKinds(state);
	if (kinds.length === 0) {
		return {};
	}
	const criteria = {};
	for (const kind of kinds) {
		criteria[kind] = KIND_CRITERIA[kind];
	}
	criteria.wait = WAIT_CRITERIA;
	criteria.nothing = NOTHING_CRITERIA;
	const questions = {
		nudge_moment: {
			type: 'choice',
			instructions: momentInstructions(state, kinds),
			criteria
		}
	};
	if (kinds.some((kind) => SHARE_KINDS.includes(kind))) {
		questions.nudge_share_pride = {
			type: 'score',
			instructions:
				'How comfortable would this learner be showing this result or streak to a friend?',
			criteria: PRIDE_LEVELS
		};
	}
	if (kinds.includes('enable_reminders')) {
		questions.nudge_reminder_fit = {
			type: 'score',
			instructions:
				'How well does a daily practice reminder fit this learner right now? Choose a low level when the habit is too new to protect.',
			criteria: REMINDER_FIT_LEVELS
		};
	}
	questions.nudge_receptivity = { type: 'noul', instructions: RECEPTIVITY_INSTRUCTIONS };
	return questions;
}

// ---- Derivation -------------------------------------------------------------

function readChoice(judgments, id) {
	const answer = judgments?.[id];
	if (!answer || answer.type !== 'choice' || typeof answer.choice !== 'string') {
		return null;
	}
	const probability = Number(answer.probabilities?.[answer.choice]);
	return {
		choice: answer.choice,
		confidence: Number.isFinite(Number(answer.confidence)) ? Number(answer.confidence) : 0,
		probability: Number.isFinite(probability) ? probability : 0
	};
}

function readScore(judgments, id) {
	const answer = judgments?.[id];
	if (!answer || answer.type !== 'score') {
		return null;
	}
	return Number.isFinite(Number(answer.score)) ? Number(answer.score) : null;
}

function readNoul(judgments, id) {
	const answer = judgments?.[id];
	if (!answer || answer.type !== 'noul') {
		return null;
	}
	return Number.isFinite(Number(answer.noul)) ? Number(answer.noul) : null;
}

function suppressed(reason) {
	return { kind: null, confidence: null, suppressed: reason };
}

function classifyConfidence(value) {
	return value >= NUDGE_CONFIDENCE_HIGH ? 'high' : 'medium';
}

/**
 * Turns one Jev response into an in-page ask decision. Never throws; anything
 * uncertain returns `kind: null` plus a machine-readable suppression reason.
 */
export function deriveNudge(state, answers = {}) {
	if (!state || !NUDGE_PAGES.includes(state.page) || state.page === 'notifications') {
		return suppressed('not-eligible');
	}
	const kinds = eligibleNudgeKinds(state);
	if (kinds.length === 0) {
		return suppressed('not-eligible');
	}
	const moment = readChoice(answers, 'nudge_moment');
	if (!moment || moment.confidence < NUDGE_CONFIDENCE_MIN) {
		return suppressed('low-confidence');
	}
	if (moment.choice === 'wait' || moment.choice === 'nothing') {
		return suppressed(moment.choice);
	}
	if (!kinds.includes(moment.choice)) {
		return suppressed('unknown-kind');
	}
	if (SHARE_KINDS.includes(moment.choice)) {
		const pride = readScore(answers, 'nudge_share_pride');
		if (pride === null || pride < SHARE_PRIDE_MIN) {
			return suppressed('guardrail');
		}
	}
	if (moment.choice === 'enable_reminders') {
		const fit = readScore(answers, 'nudge_reminder_fit');
		if (fit === null || fit < REMINDER_FIT_MIN) {
			return suppressed('guardrail');
		}
		const receptivity = readNoul(answers, 'nudge_receptivity');
		if (receptivity === null || receptivity < RECEPTIVITY_MIN) {
			return suppressed('guardrail');
		}
	}
	return { kind: moment.choice, confidence: classifyConfidence(moment.confidence), suppressed: null };
}

/**
 * Ranks notification candidates: the single interrupt-worthy item and the
 * soft-candidate relevance map. `relevantIds` is the only list the client may
 * badge for soft matches; tier-0 (bookmarked/practiced) items badge locally.
 */
export function deriveNotificationRanking(answers = {}, candidates = []) {
	const list = (Array.isArray(candidates) ? candidates : []).slice(0, MAX_NOTIFICATION_CANDIDATES);
	if (list.length === 0) {
		return { pickedId: null, relevance: {}, relevantIds: [], suppressed: 'no-candidates' };
	}
	const relevance = {};
	for (const candidate of list) {
		if (candidate.match === 'bookmarked' || candidate.match === 'practiced') {
			continue;
		}
		const value = readScore(answers, `nudge_relevance_${candidate.id}`);
		if (value !== null) {
			relevance[String(candidate.id)] = value;
		}
	}
	const relevantIds = Object.entries(relevance)
		.filter(([, value]) => value >= NOTIFICATION_RELEVANCE_MIN)
		.map(([id]) => id);

	const choice = readChoice(answers, 'nudge_notify_item');
	if (!choice || choice.confidence < NUDGE_CONFIDENCE_MIN) {
		return { pickedId: null, relevance, relevantIds, suppressed: 'low-confidence' };
	}
	if (choice.choice === 'none') {
		return { pickedId: null, relevance, relevantIds, suppressed: 'nothing' };
	}
	const picked = list.find((candidate) => String(candidate.id) === choice.choice);
	if (!picked) {
		return { pickedId: null, relevance, relevantIds, suppressed: 'unknown-kind' };
	}
	const receptivity = readNoul(answers, 'nudge_receptivity');
	if (receptivity === null || receptivity < RECEPTIVITY_MIN) {
		return { pickedId: null, relevance, relevantIds, suppressed: 'guardrail' };
	}
	return { pickedId: String(picked.id), relevance, relevantIds, suppressed: null };
}

// ---- Holdout ----------------------------------------------------------------

/**
 * Deterministic 10% incrementality holdout, keyed by the server-derived
 * client key. A holdout learner receives no nudge questions and no badge.
 */
export function isNudgeHoldout(clientKey, percent = NUDGE_HOLDOUT_PERCENT) {
	const key = typeof clientKey === 'string' && clientKey.length > 0 ? clientKey : 'anonymous';
	const bucket = createHash('sha256').update(key).digest().readUInt32BE(0) % 100;
	const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
	return bucket < clamped;
}
