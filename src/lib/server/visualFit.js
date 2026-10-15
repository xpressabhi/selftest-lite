// Pure visual-fit judge engine for inline visual explanations.
//
// No network, no Svelte, no database: src/lib/server/visualFitJudge.js owns the
// TypeSafe Jev call, the verdict cache, and fail-open semantics. Here we only
// build the one Choice question the judge answers and read that answer back,
// so everything in this module is deterministic and unit-testable.
//
// The judge decides whether an animated visual explanation would teach a topic
// or question answer faster than text. Three categories, in this order:
// worth_it, too_vague, not_visual. The order is meaningful: it breaks
// probability ties so a verdict never depends on property iteration order.

// Stamped into the content-addressed verdict cache key (visualFitCache.js).
// Bump it whenever the criteria or instructions below change, so no cached
// verdict outlives the wording that produced it.
export const VISUAL_FIT_KEY_VERSION = 'vf-v1';

export const VISUAL_FIT_MODEL = 'jev-latest';

// A worth_it verdict only suggests a visual at or above this probability.
export const VISUAL_FIT_MIN_PROBABILITY = 0.6;

// Judge calls are capped at this budget by visualFitJudge.js (fail-open).
export const VISUAL_FIT_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Jev question payload
// ---------------------------------------------------------------------------

const VISUAL_FIT_INSTRUCTIONS =
	'Would an animated visual explanation meaningfully help someone understand this topic, question, and answer, compared with text alone? Judge the content that is present in the state.';

// Final wording, pinned by VISUAL_FIT_KEY_VERSION. Frozen so no caller can
// drift the criteria in memory.
const VISUAL_FIT_CRITERIA = Object.freeze({
	worth_it:
		'the answer turns on a process, mechanism, spatial arrangement, motion, change over time, or a quantity/geometry relationship that an animation would teach faster than prose',
	too_vague: 'the question and context are too thin or generic to visualize anything specific',
	not_visual:
		'the topic is conceptual, definitional, factual, verbal, or list-like, where text is the right medium',
});

const VISUAL_FIT_CATEGORIES = Object.freeze(['worth_it', 'too_vague', 'not_visual']);

/**
 * Builds the System One `questions` map: one Choice question, id `visual_fit`.
 *
 * The topic/question/answer context travels in the Jev `state` (see
 * visualFitJudge.js), so this payload is content-independent on purpose: the
 * same version always builds the same payload, and the cache key is the single
 * place content enters. The documented call shape
 * `buildVisualFitQuestions({ topic, question, answer })` is kept by callers,
 * but the arguments are ignored here rather than mirrored into the payload.
 */
export function buildVisualFitQuestions() {
	return {
		visual_fit: {
			type: 'choice',
			instructions: VISUAL_FIT_INSTRUCTIONS,
			criteria: { ...VISUAL_FIT_CRITERIA },
		},
	};
}

// ---------------------------------------------------------------------------
// Answer reader
// ---------------------------------------------------------------------------

function unknownVerdict() {
	return { category: 'unknown', confidence: null, suggested: false };
}

/**
 * Derives the verdict from a System One response's `answers` map:
 * `{ category, confidence, suggested }`.
 *
 * `unknown` means "no usable verdict" (missing answer, wrong type, a choice
 * outside the three criteria, or no finite probability anywhere); callers fail
 * open on it and never cache it. Otherwise the category is the first
 * strictly-highest probability in criteria order, so a tie falls to worth_it
 * over too_vague over not_visual. `answer.choice` only guards the schema: a
 * valid choice whose distribution disagrees still scores by the distribution.
 */
export function deriveVisualFit(answers) {
	const answer = answers?.visual_fit;
	if (!answer || answer.type !== 'choice' || !VISUAL_FIT_CATEGORIES.includes(answer.choice)) {
		return unknownVerdict();
	}

	const probabilities = answer.probabilities ?? {};
	let category = VISUAL_FIT_CATEGORIES[0];
	let confidence = Number(probabilities[category]);
	for (const candidate of VISUAL_FIT_CATEGORIES.slice(1)) {
		const probability = Number(probabilities[candidate]);
		// Strict ">" keeps the earlier category when probabilities tie.
		if (
			Number.isFinite(probability) &&
			(!Number.isFinite(confidence) || probability > confidence)
		) {
			category = candidate;
			confidence = probability;
		}
	}
	if (!Number.isFinite(confidence)) {
		// A valid choice with no readable probabilities is still no verdict.
		return unknownVerdict();
	}

	return {
		category,
		confidence,
		suggested: category === 'worth_it' && confidence >= VISUAL_FIT_MIN_PROBABILITY,
	};
}
