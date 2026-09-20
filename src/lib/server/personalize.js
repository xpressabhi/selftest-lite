// Pure personalization engine: Jev question builders + deterministic result
// derivation for the hybrid personalization router.
//
// No network, no Svelte, no database: the HTTP route in
// src/routes/api/personalize/+server.js owns I/O. Everything here is
// unit-testable and fail-open: low confidence returns applied:false so the
// caller keeps the current static UI.

export const PERSONALIZE_CONFIDENCE_HIGH = 0.8;
export const PERSONALIZE_CONFIDENCE_MEDIUM = 0.5;

export const PERSONALIZE_PAGES = [
	'home',
	'history',
	'results',
	'practice',
	'test-moment',
	'onboarding',
];

function choiceCriteria(options) {
	const criteria = {};
	for (const [id, description] of Object.entries(options)) {
		criteria[id] = description;
	}
	return criteria;
}

/**
 * Builds the System One `questions` map for a page. `context.ids` supplies
 * dynamic candidates (history ids / exam ids); everything else is static so
 * payloads stay small. PII-free by construction: ids and counts only.
 */
export function buildPersonalizeQuestions(page, context = {}) {
	switch (page) {
		case 'home':
			return {
				primary_action: {
					type: 'choice',
					instructions:
						'What single entry point should the home page promote for this learner right now?',
					criteria: choiceCriteria({
						resume_unfinished: 'An unfinished test is waiting; resuming beats starting over',
						review_due: 'Spaced-repetition reviews are due; revision beats novelty',
						daily_five: 'A light daily habit fits best; a 5-question warm-up',
						new_quiz: 'The learner wants something new; the composer is the priority',
						exam_mock: 'Exam pressure is high; a full mock is the priority',
						browse: 'The learner is exploring; topic/exam browsers first',
					}),
				},
				exam_pressure: {
					type: 'score',
					instructions: 'How much imminent exam pressure does this learner show?',
					criteria: [
						'No deadline signals; casual practice',
						'Some exam intent or regular cadence',
						'Cramming signals; exam is near',
					],
				},
				wants_revision: {
					type: 'noul',
					instructions: 'Does the learner state show revision/review intent?',
				},
				wants_new: {
					type: 'noul',
					instructions: 'Does the learner state show novelty/new-topic intent?',
				},
			};
		case 'history': {
			const ids = Array.isArray(context.ids) ? context.ids.slice(0, 8) : [];
			const criteria = { none: 'No single item stands out; keep chronological order' };
			for (const id of ids) {
				criteria[id] = null;
			}
			return {
				recommended: {
					type: 'choice',
					instructions:
						'Which single history item is most worth resuming or reviewing now? Choose none when nothing stands out.',
					criteria,
				},
				urgency: {
					type: 'score',
					instructions: 'How urgent is it to resurface one item vs browse all?',
					criteria: ['Browse all; nothing urgent', 'One item is timely', 'Resume now'],
				},
			};
		}
		case 'results':
			return {
				focus: {
					type: 'choice',
					instructions: 'Which single results panel deserves expansion first?',
					criteria: choiceCriteria({
						fix_mistakes: 'Wrong answers dominate; review them first',
						celebrate: 'Strong score; mastery and streaks first',
						plan_review: 'Mixed signals; the review queue plan first',
					}),
				},
				show_achievements: {
					type: 'noul',
					instructions: 'Is an achievements panel worth showing for this result?',
				},
				show_review_queue: {
					type: 'noul',
					instructions: 'Is a review-queue panel worth showing for this result?',
				},
				expand_wrong_only: {
					type: 'noul',
					instructions: 'Should the question list collapse to wrong answers only?',
				},
			};
		case 'practice': {
			const ids = Array.isArray(context.ids) ? context.ids.slice(0, 12) : [];
			const criteria = { none: 'No single exam stands out; keep the full grid' };
			for (const id of ids) {
				criteria[id] = null;
			}
			return {
				recommended_exam: {
					type: 'choice',
					instructions:
						'Which single exam should the practice hub promote for this learner? Choose none when the full grid is fine.',
					criteria,
				},
				time_pressure: {
					type: 'score',
					instructions: 'How time-pressed is this learner?',
					criteria: ['Exploring; no rush', 'Focused preparation', 'Exam is imminent'],
				},
			};
		}
		case 'test-moment':
			return {
				stuck: {
					type: 'noul',
					instructions:
						'Given `signals.dwellSec`, skips and flags, is the learner stuck on this question?',
				},
				hint_depth: {
					type: 'score',
					instructions: 'How much help fits this moment?',
					criteria: ['A small nudge suffices', 'A worked hint fits', 'A full reteach fits'],
				},
				fatigue: {
					type: 'score',
					instructions: 'How fatigued does the learner appear?',
					criteria: ['Fresh; full chrome is fine', 'Tiring; simplify chrome', 'Exhausted; minimal chrome'],
				},
			};
		case 'onboarding':
			return {
				class: {
					type: 'choice',
					instructions: 'Which learner level does this free-text line suggest?',
					criteria: choiceCriteria({
						'class-8': 'Class 8 level',
						'class-10': 'Class 10 level',
						'class-12': 'Class 12 level',
						college: 'College level',
						'working-professional': 'Working professional',
						none: 'No level stated',
					}),
				},
				language: {
					type: 'choice',
					instructions: 'Which test language does this line suggest?',
					criteria: choiceCriteria({
						english: 'The test should be in English',
						hindi: 'The test should be in Hindi (Devanagari)',
						none: 'No language stated',
					}),
				},
			};
		default:
			return {};
	}
}

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
	};
}

function readNoul(judgments, id) {
	const answer = judgments?.[id];
	if (!answer || answer.type !== 'noul') {
		return null;
	}
	return Number.isFinite(Number(answer.noul)) ? Number(answer.noul) : null;
}

function readScore(judgments, id) {
	const answer = judgments?.[id];
	if (!answer || answer.type !== 'score') {
		return null;
	}
	return Number.isFinite(Number(answer.score)) ? Number(answer.score) : null;
}

export function classifyPersonalizeConfidence(value) {
	const score = Number(value);
	if (!Number.isFinite(score)) {
		return 'low';
	}
	if (score >= PERSONALIZE_CONFIDENCE_HIGH) {
		return 'high';
	}
	if (score >= PERSONALIZE_CONFIDENCE_MEDIUM) {
		return 'medium';
	}
	return 'low';
}

function fallback(reason) {
	return { applied: false, action: null, confidence: 'low', hide: [], promote: [], reason };
}

const HOME_PROMOTE = {
	resume_unfinished: ['resume-card'],
	review_due: ['review-queue'],
	daily_five: ['daily-five'],
	new_quiz: ['composer'],
	exam_mock: ['exam-browser'],
	browse: ['manual-browsers'],
};

const HOME_HIDE = {
	resume_unfinished: ['manual-browsers'],
	review_due: ['manual-browsers', 'quickstart-secondary'],
	daily_five: ['manual-browsers'],
	new_quiz: [],
	exam_mock: ['quickstart-secondary'],
	browse: [],
};

/**
 * Turns one Jev response into a UI decision. Never throws for unknown
 * pages; returns applied:false so the caller keeps the current UI.
 */
export function derivePersonalize(page, judgments = {}) {
	if (!PERSONALIZE_PAGES.includes(page)) {
		return fallback('unknown-page');
	}

	if (page === 'home') {
		const primary = readChoice(judgments, 'primary_action');
		if (!primary || primary.confidence < PERSONALIZE_CONFIDENCE_MEDIUM) {
			return fallback('low-confidence');
		}
		if (!HOME_PROMOTE[primary.choice]) {
			return fallback('unknown-action');
		}
		return {
			applied: true,
			action: primary.choice,
			confidence: classifyPersonalizeConfidence(primary.confidence),
			hide: HOME_HIDE[primary.choice] || [],
			promote: HOME_PROMOTE[primary.choice] || [],
			reason: null,
		};
	}

	if (page === 'history') {
		const recommended = readChoice(judgments, 'recommended');
		if (!recommended || recommended.confidence < PERSONALIZE_CONFIDENCE_MEDIUM) {
			return fallback('low-confidence');
		}
		if (recommended.choice === 'none') {
			return { applied: false, action: 'none', confidence: 'medium', hide: [], promote: [], reason: null };
		}
		return {
			applied: true,
			action: recommended.choice,
			confidence: classifyPersonalizeConfidence(recommended.confidence),
			hide: [],
			promote: [recommended.choice],
			reason: null,
		};
	}

	if (page === 'results') {
		const focus = readChoice(judgments, 'focus');
		if (!focus || focus.confidence < PERSONALIZE_CONFIDENCE_MEDIUM) {
			return fallback('low-confidence');
		}
		const showReview = readNoul(judgments, 'show_review_queue');
		const showAchievements = readNoul(judgments, 'show_achievements');
		const hide = [];
		if (showReview !== null && showReview < 0.5) {
			hide.push('review-queue');
		}
		if (showAchievements !== null && showAchievements < 0.5) {
			hide.push('achievements');
		}
		return {
			applied: true,
			action: focus.choice,
			confidence: classifyPersonalizeConfidence(focus.confidence),
			hide,
			promote: [focus.choice],
			reason: null,
		};
	}

	if (page === 'practice') {
		const recommended = readChoice(judgments, 'recommended_exam');
		if (!recommended || recommended.confidence < PERSONALIZE_CONFIDENCE_MEDIUM) {
			return fallback('low-confidence');
		}
		if (recommended.choice === 'none') {
			return { applied: false, action: 'none', confidence: 'medium', hide: [], promote: [], reason: null };
		}
		return {
			applied: true,
			action: recommended.choice,
			confidence: classifyPersonalizeConfidence(recommended.confidence),
			hide: [],
			promote: [recommended.choice],
			reason: null,
		};
	}

	if (page === 'test-moment') {
		const stuck = readNoul(judgments, 'stuck');
		const fatigue = readScore(judgments, 'fatigue');
		if (stuck === null && fatigue === null) {
			return fallback('no-signal');
		}
		const promote = [];
		const hide = [];
		if (stuck !== null && stuck >= 0.7) {
			promote.push('hint');
		}
		if (fatigue !== null && fatigue >= 1.5) {
			hide.push('secondary-chrome');
		}
		if (promote.length === 0 && hide.length === 0) {
			return fallback('no-action');
		}
		return { applied: true, action: 'adapt-chrome', confidence: 'medium', hide, promote, reason: null };
	}

	if (page === 'onboarding') {
		const level = readChoice(judgments, 'class');
		const language = readChoice(judgments, 'language');
		const best = [level, language].filter(Boolean).sort((a, b) => b.confidence - a.confidence)[0];
		if (!best || best.confidence < PERSONALIZE_CONFIDENCE_MEDIUM || best.choice === 'none') {
			return fallback('low-confidence');
		}
		return {
			applied: true,
			action: best.choice,
			confidence: classifyPersonalizeConfidence(best.confidence),
			hide: [],
			promote: [],
			prefill: {
				...(level && level.choice !== 'none' ? { class: level.choice } : {}),
				...(language && language.choice !== 'none' ? { language: language.choice } : {}),
			},
			reason: null,
		};
	}

	return fallback('unhandled');
}
