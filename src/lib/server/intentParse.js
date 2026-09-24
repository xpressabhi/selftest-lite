// Pure intent-parsing engine for the conversational test planner.
//
// No network, no Svelte, no database: the HTTP route in
// src/routes/api/parse-intent/+server.js owns I/O, rate limiting, profile
// context, and telemetry. Everything here is deterministic and unit-testable.
//
// The engine turns TypeSafe Jev answers (Choice/Noul) about a user's message
// into the planner's structured plan, merges them with the previous plan while
// protecting fields the user set explicitly, and decides whether one targeted
// clarification question is worth asking.
//
// Two answer namespaces travel together:
// - `judgments`: raw Jev answers keyed by question id (exam_id, topic_span, ...)
// - `answers`:   authoritative user clarification answers keyed by plan field
//                (topic, examId, difficulty, ...)

import { OBJECTIVE_ONLY_EXAMS, getIndianExamById } from '$lib/data/indianExams';
import {
	DEFAULT_EXAM_QUESTIONS,
	DEFAULT_QUIZ_QUESTIONS,
	MAX_QUESTIONS,
	MAX_TOPIC_CANDIDATES,
	MAX_TOPIC_OPTIONS,
	MIN_QUESTIONS,
	buildTopicCandidates,
	clampQuestions,
	extractMentionedFields,
	extractQuestionCount,
	hasDifficultyContradiction,
	repairTopicSpan,
} from '$lib/shared/intentLexicon';

export {
	MAX_QUESTIONS,
	MAX_TOPIC_CANDIDATES,
	MIN_QUESTIONS,
	buildTopicCandidates,
	clampQuestions,
	extractMentionedFields,
	extractQuestionCount,
	hasDifficultyContradiction,
	repairTopicSpan,
};

export const INTENT_MODEL = 'jev-latest';

export const MAX_CLARIFY_ROUNDS = 2;
export const MAX_RECENT_MESSAGES = 8;
export const MAX_RECENT_MESSAGE_CHARS = 300;

// Exam acceptance: a wrong exam is worse than no exam.
export const EXAM_MIN_CONFIDENCE = 0.6;
export const EXAM_MIN_PROBABILITY = 0.5;
// Ask only when an exam is plausible but not certain.
export const EXAM_ASK_PROBABILITY = 0.3;

// Topic span acceptance and clarification options.
export const TOPIC_MIN_PROBABILITY = 0.3;

export const CONFIDENCE_HIGH = 0.8;
export const CONFIDENCE_MEDIUM = 0.5;

export const VALID_TEST_TYPES = [
	'multiple-choice',
	'true-false',
	'coding',
	'speed-challenge',
	'matching',
	'assertion-reasoning',
];
export const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'expert'];
export const VALID_LANGUAGES = ['english', 'hindi'];

export const DEFAULT_PLAN = Object.freeze({
	topic: '',
	testType: 'multiple-choice',
	difficulty: 'intermediate',
	numQuestions: DEFAULT_QUIZ_QUESTIONS,
	examId: null,
	isFullExam: false,
	language: 'english',
});

// ---------------------------------------------------------------------------
// Plan helpers
// ---------------------------------------------------------------------------

/** Coerces any incoming plan into a valid, fully-populated plan object. */
export function normalizePlan(plan) {
	const source = plan && typeof plan === 'object' ? plan : {};
	const examId =
		typeof source.examId === 'string' && getIndianExamById(source.examId)
			? source.examId
			: null;

	return {
		topic: typeof source.topic === 'string' ? source.topic.trim().slice(0, 500) : '',
		testType: VALID_TEST_TYPES.includes(source.testType)
			? source.testType
			: DEFAULT_PLAN.testType,
		difficulty: VALID_DIFFICULTIES.includes(source.difficulty)
			? source.difficulty
			: DEFAULT_PLAN.difficulty,
		numQuestions: clampQuestions(source.numQuestions),
		examId,
		isFullExam: Boolean(source.isFullExam) || Boolean(examId),
		language: VALID_LANGUAGES.includes(source.language)
			? source.language
			: DEFAULT_PLAN.language,
	};
}

// ---------------------------------------------------------------------------
// Jev question payloads
// ---------------------------------------------------------------------------

/** `{ id: "Name — Stream (Group)" }` plus a `none` option, for the exam Choice. */
export function buildExamCriteria() {
	const criteria = { none: 'No specific exam in this list, or a general topic quiz' };
	for (const exam of OBJECTIVE_ONLY_EXAMS) {
		const group = exam.group ? `, group ${exam.group}` : '';
		criteria[exam.id] = `${exam.name} — ${exam.stream}${group}. ${exam.description}`;
	}
	return criteria;
}

const INSTRUCTIONS = {
	is_exam:
		'Is the user asking for a full competitive exam paper rather than a general practice quiz?',
	exam_id:
		'Which exam paper is the user asking for? Choose none when the request is not about a specific exam from this list. If the request is exam-shaped but does not name one, the student context may name their exam target.',
	test_type: 'What kind of test does the user want?',
	difficulty:
		'How difficult should this test be for this user? Choose intermediate when the user gives no difficulty hint.',
	language:
		'Which language should the test be written in? Choose hindi when the request uses Devanagari or Hindi words; otherwise use the language in the student context; default to english.',
	topic_span:
		'Which phrase from the request names the subject the test should cover? Pick the most specific complete subject phrase. Ignore question counts, difficulty, format, language, and audience words. Choose none when no subject is stated.',
};

/**
 * Builds the System One `questions` map. Plain objects: the SDK accepts the
 * same shape, and keeping them plain keeps this module test-friendly.
 */
export function buildIntentQuestions({
	candidates = [],
	maxCandidates = MAX_TOPIC_CANDIDATES,
	only = null,
} = {}) {
	// `only` (array of question ids) trims the payload for live previews:
	// callers include a field question only when the message actually talks
	// about that field, so unmentioned plan fields keep their current value.
	const wants = (id) => !Array.isArray(only) || only.includes(id);
	const questions = {};

	if (wants('is_exam')) {
		questions.is_exam = {
			type: 'noul',
			instructions: INSTRUCTIONS.is_exam,
			criteria: {
				true: 'A specific exam paper, exam preparation, or a mock test in an exam pattern',
				false: 'A general topic quiz, coding practice, interview prep, language learning, or hobby test',
			},
		};
	}
	if (wants('exam_id')) {
		questions.exam_id = {
			type: 'choice',
			instructions: INSTRUCTIONS.exam_id,
			criteria: buildExamCriteria(),
		};
	}
	if (wants('test_type')) {
		questions.test_type = {
			type: 'choice',
			instructions: INSTRUCTIONS.test_type,
			criteria: {
				'multiple-choice': 'Classic multiple-choice questions with four options',
				'true-false': 'True or false / binary yes-no statements',
				coding: 'Programming problems with code answers',
				'speed-challenge': 'A rapid-fire quick test against the clock',
				matching: 'Match the columns / match the following questions',
				'assertion-reasoning': 'Assertion and reason statement questions',
			},
		};
	}
	if (wants('difficulty')) {
		questions.difficulty = {
			type: 'choice',
			instructions: INSTRUCTIONS.difficulty,
			criteria: {
				beginner: 'First exposure to the topic, very approachable',
				intermediate: 'Some familiarity, standard practice level',
				advanced: 'Strong command, challenging questions',
				expert: 'Top-difficulty questions, exam-topper level',
			},
		};
	}
	if (wants('language')) {
		questions.language = {
			type: 'choice',
			instructions: INSTRUCTIONS.language,
			criteria: {
				english: 'The test should be in English',
				hindi: 'The test should be in Hindi (Devanagari)',
			},
		};
	}

	const topicCandidates = candidates.slice(0, maxCandidates);
	if (topicCandidates.length > 0) {
		const criteria = { none: 'No subject is stated, or none of these phrases names it' };
		for (const candidate of topicCandidates) {
			criteria[candidate] = null;
		}
		questions.topic_span = {
			type: 'choice',
			instructions: INSTRUCTIONS.topic_span,
			criteria,
		};
	}

	return questions;
}

// ---------------------------------------------------------------------------
// Answer readers
// ---------------------------------------------------------------------------

function readChoice(judgments, id) {
	const answer = judgments?.[id];
	if (!answer || answer.type !== 'choice' || typeof answer.choice !== 'string') {
		return null;
	}
	const probability = Number(answer.probabilities?.[answer.choice]);
	return {
		choice: answer.choice,
		confidence: Number.isFinite(Number(answer.confidence)) ? Number(answer.confidence) : 0,
		probability: Number.isFinite(probability) ? probability : 0,
		probabilities:
			answer.probabilities && typeof answer.probabilities === 'object'
				? answer.probabilities
				: {},
	};
}

function readNoul(judgments, id) {
	const answer = judgments?.[id];
	if (!answer || answer.type !== 'noul') {
		return null;
	}
	return Number.isFinite(Number(answer.noul)) ? Number(answer.noul) : null;
}

// ---------------------------------------------------------------------------
// Clarification policy
// ---------------------------------------------------------------------------

/**
 * Chooses at most one clarification question. Deterministic. Priority:
 * exam ambiguity (a wrong exam is expensive) -> unidentified topic ->
 * contradictory difficulty. Capped by rounds, asked fields, skipped fields,
 * and explicit user choices.
 */
export function selectClarification({
	intent = '',
	plan = DEFAULT_PLAN,
	judgments = {},
	explicit = {},
	askedFields = [],
	skippedFields = [],
	answeredFields = [],
	round = 0,
	candidates = [],
	topicConfident = false,
}) {
	if (round >= MAX_CLARIFY_ROUNDS) {
		return null;
	}
	const asked = new Set(askedFields);
	const skipped = new Set(skippedFields);
	// A field the user already answered is settled and must not be re-asked.
	for (const field of answeredFields) {
		asked.add(field);
	}

	const examChoice = readChoice(judgments, 'exam_id');
	const examAccepted = Boolean(
		examChoice &&
		examChoice.choice !== 'none' &&
		examChoice.confidence >= EXAM_MIN_CONFIDENCE &&
		examChoice.probability >= EXAM_MIN_PROBABILITY
	);

	const topicChoice = readChoice(judgments, 'topic_span');
	const topicAccepted = Boolean(
		topicChoice &&
		topicChoice.choice !== 'none' &&
		topicChoice.probability >= TOPIC_MIN_PROBABILITY
	);

	if (
		examChoice &&
		examChoice.choice !== 'none' &&
		examChoice.probability >= EXAM_ASK_PROBABILITY &&
		examChoice.probability < EXAM_MIN_PROBABILITY &&
		!plan.examId &&
		!topicAccepted &&
		!explicit.examId &&
		!skipped.has('examId') &&
		!asked.has('examId')
	) {
		const ranked = Object.entries(examChoice.probabilities)
			.filter(([id]) => id !== 'none')
			.map(([id, probability]) => ({ id, probability: Number(probability) || 0 }))
			.sort((left, right) => right.probability - left.probability)
			.slice(0, MAX_TOPIC_OPTIONS);
		return {
			id: 'examId',
			promptKey: 'plannerClarifyExam',
			params: {},
			options: [
				...ranked.map((entry) => {
					const exam = getIndianExamById(entry.id);
					return { value: entry.id, label: exam ? exam.name : entry.id };
				}),
				{ value: 'none', labelKey: 'plannerGeneralQuiz' },
			],
			allowSkip: true,
		};
	}

	if (
		!plan.examId &&
		!examAccepted &&
		!topicAccepted &&
		!topicConfident &&
		!explicit.topic &&
		!skipped.has('topic') &&
		!asked.has('topic')
	) {
		return {
			id: 'topic',
			promptKey: 'plannerClarifyTopic',
			params: {},
			options: candidates.slice(0, MAX_TOPIC_OPTIONS).map((span) => ({
				value: span,
				label: span,
			})),
			allowSkip: true,
		};
	}

	if (
		hasDifficultyContradiction(intent) &&
		!explicit.difficulty &&
		!skipped.has('difficulty') &&
		!asked.has('difficulty')
	) {
		return {
			id: 'difficulty',
			promptKey: 'plannerClarifyDifficulty',
			params: {},
			options: [
				{ value: 'beginner', labelKey: 'beginner' },
				{ value: 'intermediate', labelKey: 'intermediate' },
				{ value: 'advanced', labelKey: 'advanced' },
				{ value: 'expert', labelKey: 'expert' },
			],
			allowSkip: true,
		};
	}

	return null;
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

export function classifyConfidence(value) {
	if (value === null || value === undefined || value === '') {
		return 'medium';
	}
	const score = Number(value);
	if (!Number.isFinite(score)) {
		return 'medium';
	}
	if (score >= CONFIDENCE_HIGH) {
		return 'high';
	}
	if (score >= CONFIDENCE_MEDIUM) {
		return 'medium';
	}
	return 'low';
}

function minDefined(values) {
	const defined = values.filter((value) => Number.isFinite(value));
	if (defined.length === 0) {
		return null;
	}
	return Math.min(...defined);
}

// ---------------------------------------------------------------------------
// Main derivation
// ---------------------------------------------------------------------------

function hasOwn(object, key) {
	return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Turns one Jev response into the planner's next state: the merged plan, the
 * per-field confidences, the user-visible assistant message key, and at most
 * one clarification question.
 *
 * @param {object} args
 * @param {string} args.intent           Latest user message.
 * @param {object} args.judgments        Raw Jev answers keyed by question id.
 * @param {object} args.answers          User clarification answers keyed by plan field.
 * @param {object|null} args.previousPlan
 * @param {object} args.explicit         Fields the user set by hand.
 * @param {string[]} args.askedFields    Clarity questions already asked.
 * @param {string[]} args.skippedFields
 * @param {number} args.round
 * @param {string|null} args.preferredLanguage  Profile language, if any.
 */
export function deriveIntentParams({
	intent = '',
	judgments = {},
	answers = {},
	previousPlan = null,
	explicit = {},
	askedFields = [],
	skippedFields = [],
	round = 0,
	preferredLanguage = null,
} = {}) {
	const base = normalizePlan(previousPlan);
	const mentioned = extractMentionedFields(intent);
	const candidates = buildTopicCandidates(intent);

	const examChoice = readChoice(judgments, 'exam_id');
	const examAccepted = Boolean(
		examChoice &&
		examChoice.choice !== 'none' &&
		examChoice.confidence >= EXAM_MIN_CONFIDENCE &&
		examChoice.probability >= EXAM_MIN_PROBABILITY
	);

	const topicChoice = readChoice(judgments, 'topic_span');
	const topicAccepted = Boolean(
		topicChoice &&
		topicChoice.choice !== 'none' &&
		topicChoice.probability >= TOPIC_MIN_PROBABILITY
	);

	const isExamSignal = readNoul(judgments, 'is_exam');

	// --- examId -------------------------------------------------------------
	let examId;
	if (hasOwn(answers, 'examId')) {
		examId =
			typeof answers.examId === 'string' && getIndianExamById(answers.examId)
				? answers.examId
				: null;
	} else if (examAccepted) {
		examId = examChoice.choice;
	} else if (mentioned.exam) {
		// The user talked about exams but no specific one was clear enough.
		examId = null;
	} else {
		examId = base.examId;
	}

	const isFullExam = Boolean(examId) || (isExamSignal !== null && isExamSignal >= 0.5);

	// --- enum fields --------------------------------------------------------
	const resolveChoice = (field, answerKey, validValues, fallback) => {
		if (hasOwn(answers, field)) {
			return validValues.includes(answers[field]) ? answers[field] : fallback;
		}
		if (explicit[field] && !mentioned[field]) {
			return base[field] || fallback;
		}
		const choice = readChoice(judgments, answerKey);
		if (choice && validValues.includes(choice.choice)) {
			return choice.choice;
		}
		return base[field] || fallback;
	};

	const testType = resolveChoice(
		'testType',
		'test_type',
		VALID_TEST_TYPES,
		DEFAULT_PLAN.testType
	);
	const difficulty = resolveChoice(
		'difficulty',
		'difficulty',
		VALID_DIFFICULTIES,
		DEFAULT_PLAN.difficulty
	);

	// Language: the profile preference is the default on a fresh plan; after
	// that the plan language persists unless a message talks about language.
	const languageFallback = VALID_LANGUAGES.includes(preferredLanguage)
		? preferredLanguage
		: DEFAULT_PLAN.language;
	let language;
	if (hasOwn(answers, 'language')) {
		language = VALID_LANGUAGES.includes(answers.language) ? answers.language : languageFallback;
	} else if (explicit.language && !mentioned.language) {
		language = base.language || languageFallback;
	} else {
		const choice = readChoice(judgments, 'language');
		if (choice && VALID_LANGUAGES.includes(choice.choice)) {
			language = choice.choice;
		} else {
			language = previousPlan ? base.language : languageFallback;
		}
	}

	// --- numQuestions -------------------------------------------------------
	let numQuestions;
	if (hasOwn(answers, 'numQuestions')) {
		numQuestions = clampQuestions(answers.numQuestions);
	} else {
		const count = extractQuestionCount(intent);
		if (count.explicit) {
			numQuestions = clampQuestions(count.count);
		} else {
			numQuestions = clampQuestions(base.numQuestions);
			if (!explicit.numQuestions && examId && numQuestions === DEFAULT_QUIZ_QUESTIONS) {
				numQuestions = DEFAULT_EXAM_QUESTIONS;
			}
		}
	}

	// --- topic --------------------------------------------------------------
	let topic;
	let topicSource;
	if (typeof answers.topic === 'string' && answers.topic.trim()) {
		topic = answers.topic.trim().slice(0, 500);
		topicSource = 'answer';
	} else if (explicit.topic && !topicAccepted) {
		topic = base.topic || intent.trim();
		topicSource = base.topic ? 'previous' : 'raw';
	} else if (topicAccepted) {
		const exam = examId ? getIndianExamById(examId) : null;
		const repaired = repairTopicSpan(intent, topicChoice.choice);
		topic = exam ? `${repaired} (${exam.name})` : repaired;
		topicSource = 'span';
	} else if (examId) {
		const exam = getIndianExamById(examId);
		topic = exam ? `${exam.name} objective exam paper` : base.topic || intent.trim();
		topicSource = 'exam';
	} else {
		topic = base.topic || intent.trim();
		topicSource = base.topic ? 'previous' : 'raw';
	}

	const plan = normalizePlan({
		topic,
		testType,
		difficulty,
		numQuestions,
		examId,
		isFullExam,
		language,
	});

	const fieldConfidence = {
		topic: hasOwn(answers, 'topic') ? 1 : topicAccepted ? topicChoice.probability : null,
		exam: hasOwn(answers, 'examId') ? 1 : examChoice ? examChoice.probability : null,
		isExam: isExamSignal,
		testType: hasOwn(answers, 'testType')
			? 1
			: (readChoice(judgments, 'test_type')?.confidence ?? null),
		difficulty: hasOwn(answers, 'difficulty')
			? 1
			: (readChoice(judgments, 'difficulty')?.confidence ?? null),
		language: hasOwn(answers, 'language')
			? 1
			: (readChoice(judgments, 'language')?.confidence ?? null),
	};

	const confidenceValue = minDefined([
		examAccepted ? examChoice.confidence : null,
		hasOwn(answers, 'examId') ? 1 : null,
		topicAccepted ? topicChoice.confidence : null,
		hasOwn(answers, 'topic') ? 1 : null,
		fieldConfidence.testType,
		fieldConfidence.difficulty,
		fieldConfidence.language,
	]);

	const clarify = selectClarification({
		intent,
		plan,
		judgments,
		explicit,
		askedFields,
		skippedFields,
		answeredFields: Object.keys(answers),
		round,
		candidates,
		topicConfident:
			topicAccepted ||
			hasOwn(answers, 'topic') ||
			Boolean(examId) ||
			Boolean(previousPlan?.topic),
	});

	return {
		plan,
		fieldConfidence,
		confidence: classifyConfidence(confidenceValue),
		clarify,
		topicSource,
		messageKey: clarify
			? 'plannerNeedOneThing'
			: previousPlan
				? 'plannerPlanUpdated'
				: 'plannerPlanReady',
		messageParams: {
			topic: plan.topic,
			numQuestions: plan.numQuestions,
			examName: plan.examId ? getIndianExamById(plan.examId)?.name || '' : '',
		},
	};
}
