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
