export const VALID_LANGUAGES = ['english', 'hindi'];

export const VALID_TEST_TYPES = [
	'multiple-choice',
	'true-false',
	'coding',
	'mixed',
	'speed-challenge',
	'matching',
	'assertion-reasoning',
];

/** Objective formats allowed in full-exam mode (plus the legacy MCQ default). */
export const FULL_EXAM_TEST_TYPES = ['multiple-choice', 'matching', 'assertion-reasoning'];

export const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'expert'];

export const MIN_QUESTIONS = 1;
export const MAX_QUESTIONS = 200;

export const MAX_TOPIC_LENGTH = 500;
export const MAX_TOPIC_LIST_ITEM_LENGTH = 200;
/** Every request field that is interpolated into a prompt. These were accepted
 *  at whatever length the request body allowed, so one request could become a
 *  multi-megabyte billed prompt. Generous next to the real values (an exam or
 *  board name is well under 100 chars) while bounding the cost. */
export const MAX_PROMPT_FIELD_LENGTH = 200;
export const MAX_SELECTED_TOPICS = 20;
export const MAX_SYLLABUS_FOCUS = 20;
export const MAX_PREVIOUS_TESTS = 10;
export const MAX_TEST_QUESTIONS = 200;
export const MAX_QUESTION_TEXT_LENGTH = 2000;
export const MAX_ANSWER_TEXT_LENGTH = 1000;
export const MAX_OPTION_TEXT_LENGTH = 1000;
export const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Per-call output ceilings. No model call set one, so a request could ask for
 * (and be billed for) the model's maximum output. Sized above a real response so
 * nothing truncates in practice — a 25-question batch runs ~4k tokens, an
 * explanation ~1k, a discovered pattern ~2k — while still bounding the worst case.
 */
export const MAX_GENERATION_OUTPUT_TOKENS = 8192;
export const MAX_EXPLANATION_OUTPUT_TOKENS = 2048;
export const MAX_PATTERN_OUTPUT_TOKENS = 4096;

/**
 * Concept playground artifact ceilings. The model writes a body fragment
 * (html/css/js); the composed document cap bounds what an iframe ever parses
 * on a low-end device, and the per-field caps bound what one billed call can
 * produce before validation and repair run. See
 * docs/superpowers/specs/2026-10-14-playground-explainer-design.md.
 */
export const MAX_ARTIFACT_HTML_BYTES = 96 * 1024;
export const MAX_ARTIFACT_CSS_BYTES = 32 * 1024;
export const MAX_ARTIFACT_JS_BYTES = 24 * 1024;
export const MAX_ARTIFACT_DOCUMENT_BYTES = 150 * 1024;

export const ARTIFACT_BRIEF_MODEL = 'gemini-flash-lite-latest';
/**
 * Artifact model. The value is settled by the `npm run eval:artifact` report
 * (validity ≥ 7/8, animation ≥ 6/8, zero external requests, size budget); a
 * stronger Flash alias replaces the lite default only with that evidence.
 */
export const ARTIFACT_MODEL = 'gemini-flash-lite-latest';
export const MAX_ARTIFACT_BRIEF_OUTPUT_TOKENS = 1024;
export const MAX_ARTIFACT_OUTPUT_TOKENS = 8192;
export const ARTIFACT_DEADLINE_MS = 90000;
export const ARTIFACT_RATE_LIMIT = 5;

/**
 * Prompt semantics version for the explainer cache key. Bump when the brief or
 * artifact prompts change in a way that should supersede cached artifacts.
 */
export const ARTIFACT_PROMPT_VERSION = 'prompt-v1';
