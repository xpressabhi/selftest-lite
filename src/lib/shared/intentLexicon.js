// Framework-neutral intent lexicon.
//
// Pure: no network, no Svelte, no database. Shared by the server intent
// engine (src/lib/server/intentParse.js) and the client live preview
// (src/lib/client/livePreview.js) so the parsing rules live in one place.

import { OBJECTIVE_ONLY_EXAMS } from '$lib/data/indianExams';

export const MIN_QUESTIONS = 5;
// Matches the server cap (quizConfig MAX_QUESTIONS = 200) so planner-typed
// counts like "100 questions" survive instead of being clamped to 50.
export const MAX_QUESTIONS = 200;
export const DEFAULT_QUIZ_QUESTIONS = 10;
export const DEFAULT_EXAM_QUESTIONS = 20;
export const MAX_TOPIC_CANDIDATES = 200;
export const MAX_TOPIC_OPTIONS = 3;

export function clampQuestions(value) {
	const numeric = Number(value);
	const rounded = Number.isFinite(numeric) ? Math.round(numeric) : DEFAULT_QUIZ_QUESTIONS;
	return Math.max(MIN_QUESTIONS, Math.min(MAX_QUESTIONS, rounded));
}

// ---------------------------------------------------------------------------
// Question count extraction (code does exact numbers, not the model)
// ---------------------------------------------------------------------------

const NUMBER_WORDS = {
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12,
	fifteen: 15,
	twenty: 20,
	thirty: 30,
	forty: 40,
	fifty: 50,
	hundred: 100,
	dozen: 12,
	एक: 1,
	दो: 2,
	तीन: 3,
	चार: 4,
	पांच: 5,
	पाँच: 5,
	छह: 6,
	सात: 7,
	आठ: 8,
	नौ: 9,
	दस: 10,
	बारह: 12,
	पंद्रह: 15,
	बीस: 20,
	तीस: 30,
	चालीस: 40,
	पचास: 50,
	सौ: 100,
};

const QUESTION_WORDS = 'questions?|ques|qs?|mcqs?|problems?|प्रश्न(?:ों)?';
const NUMBER_WORD_KEYS = Object.keys(NUMBER_WORDS).join('|');
const WORD_START = `(?:^|\\s)`;

// "20 questions", "20 hard coding questions", "questions: 15"
const COUNT_AFTER_DIGITS = new RegExp(`(\\d{1,3})\\s*(?:${QUESTION_WORDS})`, 'iu');
const COUNT_DIGITS_THEN_WORDS = new RegExp(
	`(\\d{1,3})(?:\\s+[^\\s\\d]+){1,4}\\s+(?:${QUESTION_WORDS})`,
	'iu'
);
const COUNT_BEFORE_DIGITS = new RegExp(`(?:${QUESTION_WORDS})\\s*[:=-]?\\s*(\\d{1,3})`, 'iu');
// "twenty questions", "questions: twenty"
const COUNT_WORD_AFTER = new RegExp(
	`${WORD_START}(${NUMBER_WORD_KEYS})\\s+(?:${QUESTION_WORDS})`,
	'iu'
);
const COUNT_WORD_BEFORE = new RegExp(
	`(?:${QUESTION_WORDS})\\s*[:=-]?\\s*(${NUMBER_WORD_KEYS})(?![\\p{L}\\p{M}])`,
	'iu'
);
const BARE_NUMBER = /^\s*(\d{1,3})\s*$/u;

function countFromMatch(match, groupIndex) {
	if (!match) {
		return null;
	}
	const raw = match[groupIndex];
	if (/^\d+$/u.test(raw)) {
		return Number(raw);
	}
	return NUMBER_WORDS[raw.toLowerCase()] ?? null;
}

/**
 * Extracts an explicitly stated question count from the message.
 * Returns `{ count: number|null, explicit: boolean }`.
 */
export function extractQuestionCount(intent) {
	const text = typeof intent === 'string' ? intent : '';
	if (!text.trim()) {
		return { count: null, explicit: false };
	}

	for (const pattern of [COUNT_AFTER_DIGITS, COUNT_DIGITS_THEN_WORDS, COUNT_BEFORE_DIGITS]) {
		const count = countFromMatch(text.match(pattern), 1);
		if (count !== null) {
			return { count, explicit: true };
		}
	}

	const bare = text.match(BARE_NUMBER);
	if (bare) {
		return { count: Number(bare[1]), explicit: true };
	}

	for (const pattern of [COUNT_WORD_AFTER, COUNT_WORD_BEFORE]) {
		const count = countFromMatch(text.match(pattern), 1);
		if (count !== null) {
			return { count, explicit: true };
		}
	}

	return { count: null, explicit: false };
}

// ---------------------------------------------------------------------------
// Mention detection (which fields the latest message talks about)
// ---------------------------------------------------------------------------

const DIFFICULTY_PATTERN =
	/\b(beginner|intermediate|advanced|expert|easy|simple|basic|hard|tough|difficult|kids)\b|आसान|कठिन|मुश्किल|शुरुआती|उन्नत/iu;
const LANGUAGE_PATTERN =
	/\b(english|hindi|hinglish|devanagari|translate)\b|हिंदी|हिन्दी|इंग्लिश|अंग्रेजी|देवनागरी/iu;
const TEST_TYPE_PATTERN =
	/\b(coding|programming|code|true\s?-?\s?false|binary|yes\s?-?\s?no|speed|rapid|quick|mcq|multiple\s?-?\s?choice|objective)\b/iu;
const EXAM_PATTERN =
	/\b(upsc|ssc|neet|jee|cat|gate|ibps|sbi|rrb|ntpc|nda|cds|uppsc|bpsc|mpps?c|rpsc|capf|ifos)\b/iu;

/**
 * Which plan fields the latest user message appears to talk about. Fields not
 * mentioned keep their explicit (user-edited) value; mentioned fields may be
 * replaced by a fresh inference.
 */
export function extractMentionedFields(intent) {
	const text = typeof intent === 'string' ? intent : '';
	return {
		numQuestions: extractQuestionCount(text).explicit,
		difficulty: DIFFICULTY_PATTERN.test(text),
		language: LANGUAGE_PATTERN.test(text),
		testType: TEST_TYPE_PATTERN.test(text),
		exam: EXAM_PATTERN.test(text) || examNameMentioned(text),
	};
}

function examNameMentioned(text) {
	const normalized = text.toLowerCase();
	return OBJECTIVE_ONLY_EXAMS.some((exam) => {
		const name = exam.name.toLowerCase();
		const idWords = exam.id.replace(/-/gu, ' ');
		return normalized.includes(name) || normalized.includes(idWords);
	});
}

const TOPIC_STOPWORDS = new Set([
	'a',
	'an',
	'the',
	'for',
	'of',
	'on',
	'about',
	'regarding',
	'me',
	'my',
	'i',
	'we',
	'us',
	'please',
	'make',
	'create',
	'give',
	'generate',
	'build',
	'want',
	'need',
	'prefer',
	'test',
	'tests',
	'quiz',
	'quizzes',
	'paper',
	'exam',
	'mock',
	'question',
	'questions',
	'q',
	'qs',
	'mcq',
	'mcqs',
	'problem',
	'problems',
	'with',
	'without',
	'in',
	'to',
	'and',
	'or',
	'is',
	'are',
	'be',
	'as',
	'at',
	'by',
	'from',
	'this',
	'that',
	'it',
	'can',
	'you',
	'your',
	'hard',
	'easy',
	'simple',
	'basic',
	'advanced',
	'beginner',
	'intermediate',
	'expert',
	'coding',
	'code',
	'true',
	'false',
	'multiple',
	'choice',
	'speed',
	'challenge',
	'hindi',
	'english',
	'language',
	'class',
	'std',
	'level',
	'competitive',
	'practice',
	'prep',
	'preparation',
	'कक्षा',
	'के',
	'की',
	'का',
	'को',
	'में',
	'पर',
	'से',
	'और',
	'या',
	'लिए',
	'हिंदी',
	'हिन्दी',
	'अंग्रेजी',
	'इंग्लिश',
	'भाषा',
	'टेस्ट',
	'प्रश्न',
	'सवाल',
	'बनाओ',
	'चाहिए',
	'मुझे',
]);

// Level markers such as "class 10" cannot open a topic span on their own, but
// they may lead one ("class 10 physics"), so multi-token spans may start with
// them while single-token spans may not.
const LEVEL_MARKERS = new Set(['class', 'grade', 'std', 'standard', 'कक्षा', 'क्लास']);

function isLevelMarker(token) {
	return LEVEL_MARKERS.has(token.toLowerCase());
}

// Mid-word typing such as "questio" (a prefix of the stopword "questions")
// must not open a topic span; only the completed config word is recognized,
// and that is already filtered by TOPIC_STOPWORDS.
function isStopwordPrefix(token) {
	const lower = token.toLowerCase();
	for (const stopword of TOPIC_STOPWORDS) {
		if (stopword.length > lower.length && stopword.startsWith(lower)) {
			return true;
		}
	}
	return false;
}

function isContentToken(token) {
	const lower = token.toLowerCase();
	return (
		!TOPIC_STOPWORDS.has(lower) && !/^\d+$/u.test(token) && !isStopwordPrefix(token)
	);
}

// Devanagari and other Indic scripts use combining marks (Unicode M category)
// inside words, so tokens must accept \p{M} alongside \p{L} and \p{N}.
// Hyphens and apostrophes stay inside a token so compounds such as
// "built-in" survive as one word instead of splitting into "built" + "in".
const TOKEN_PATTERN = /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu;

function tokenize(text) {
	const tokens = [];
	for (const match of text.matchAll(TOKEN_PATTERN)) {
		tokens.push({
			value: match[0],
			start: match.index,
			end: match.index + match[0].length,
			content: isContentToken(match[0]),
		});
	}
	return tokens;
}

/**
 * Builds candidate subject spans from the message (verbatim slices, so the
 * chosen topic keeps the user's own spelling, including Devanagari).
 */
export function buildTopicCandidates(intent) {
	const text = typeof intent === 'string' ? intent : '';
	if (!text.trim()) {
		return [];
	}

	const tokens = tokenize(text);

	const seen = new Set();
	const candidates = [];
	for (let size = 1; size <= 5; size += 1) {
		for (let index = 0; index + size <= tokens.length; index += 1) {
			const first = tokens[index];
			const last = tokens[index + size - 1];
			const firstAllowed = first.content || (size > 1 && isLevelMarker(first.value));
			if (!firstAllowed || !last.content) {
				continue;
			}
			const span = text.slice(first.start, last.end).replace(/\s+/gu, ' ').trim();
			const key = span.toLowerCase();
			if (!span || seen.has(key)) {
				continue;
			}
			seen.add(key);
			candidates.push({
				span,
				contentOnly: tokens
					.slice(index, index + size)
					.every((token, tokenIndex) =>
						tokenIndex === 0
							? token.content || isLevelMarker(token.value)
							: token.content
					),
				words: size,
			});
		}
	}

	candidates.sort((left, right) => {
		if (left.contentOnly !== right.contentOnly) {
			return left.contentOnly ? -1 : 1;
		}
		if (left.words !== right.words) {
			return right.words - left.words;
		}
		return left.span.localeCompare(right.span);
	});

	return candidates.slice(0, MAX_TOPIC_CANDIDATES).map((candidate) => candidate.span);
}

// ---------------------------------------------------------------------------
// Topic span repair
// ---------------------------------------------------------------------------

const REPAIR_MAX_TOKENS = 8;
const REPAIR_MAX_CHARS = 120;

// Exam names and ids double as topic boundaries: "jee main python data
// structures" must not absorb "jee main" into the subject phrase.
const EXAM_BOUNDARY_WORDS = new Set();
for (const exam of OBJECTIVE_ONLY_EXAMS) {
	const words = `${exam.name} ${exam.id.replace(/-/gu, ' ')}`.toLowerCase().split(/\s+/u);
	for (const word of words) {
		if (word.length >= 3) {
			EXAM_BOUNDARY_WORDS.add(word);
		}
	}
}

function isExamBoundaryToken(token) {
	return EXAM_BOUNDARY_WORDS.has(token.toLowerCase());
}

function isCrossableStopword(token) {
	if (isExamBoundaryToken(token.value) || /^\d+$/u.test(token.value)) {
		return false;
	}
	return TOPIC_STOPWORDS.has(token.value.toLowerCase());
}

/**
 * Expands a model-chosen topic span so adjacent content tokens it dropped are
 * recovered ("data structures" -> "python built-in data structures"). The
 * expansion crosses a single stopword only when the token beyond it is
 * content, stops at punctuation/newlines, config words, numbers, and exam
 * names, and falls back to the chosen span when it would exceed the cap.
 */
export function repairTopicSpan(intent, span) {
	const text = typeof intent === 'string' ? intent : '';
	const chosen = typeof span === 'string' ? span.trim() : '';
	if (!text.trim() || !chosen) {
		return chosen;
	}

	const tokens = tokenize(text);
	let start = -1;
	let end = -1;
	for (let index = 0; index < tokens.length && start === -1; index += 1) {
		for (let last = index; last < tokens.length; last += 1) {
			const slice = text
				.slice(tokens[index].start, tokens[last].end)
				.replace(/\s+/gu, ' ')
				.trim();
			if (slice === chosen) {
				start = index;
				end = last;
				break;
			}
		}
	}
	if (start === -1) {
		return chosen;
	}

	const gapBefore = (tokenIndex) => text.slice(tokens[tokenIndex].end, tokens[from].start);
	const gapAfter = (tokenIndex) => text.slice(tokens[to].end, tokens[tokenIndex].start);
	let from = start;
	let to = end;

	for (;;) {
		const previous = from - 1;
		if (previous < 0 || gapBefore(previous) !== ' ') {
			break;
		}
		const token = tokens[previous];
		if (token.content && !isExamBoundaryToken(token.value)) {
			from = previous;
			continue;
		}
		const beyond = previous - 1;
		if (
			beyond >= 0 &&
			isCrossableStopword(token) &&
			tokens[beyond].content &&
			!isExamBoundaryToken(tokens[beyond].value) &&
			text.slice(tokens[beyond].end, token.start) === ' '
		) {
			from = previous;
			continue;
		}
		break;
	}

	for (;;) {
		const next = to + 1;
		if (next >= tokens.length || gapAfter(next) !== ' ') {
			break;
		}
		const token = tokens[next];
		if (token.content && !isExamBoundaryToken(token.value)) {
			to = next;
			continue;
		}
		const beyond = next + 1;
		if (
			beyond < tokens.length &&
			isCrossableStopword(token) &&
			tokens[beyond].content &&
			!isExamBoundaryToken(tokens[beyond].value) &&
			text.slice(token.end, tokens[beyond].start) === ' '
		) {
			to = next;
			continue;
		}
		break;
	}

	const repaired = text.slice(tokens[from].start, tokens[to].end).replace(/\s+/gu, ' ').trim();
	if (
		to - from + 1 > REPAIR_MAX_TOKENS ||
		repaired.length > REPAIR_MAX_CHARS ||
		!repaired
	) {
		return chosen;
	}
	return repaired;
}

const HARD_DIFFICULTY_PATTERN =
	/\b(hard|tough|difficult|advanced|expert|challenging)\b|कठिन|मुश्किल|उन्नत/iu;
const EASY_DIFFICULTY_PATTERN =
	/\b(easy|simple|basic|beginner|kids|children|starter|introductory)\b|आसान|शुरुआती|बच्चों/iu;

export function hasDifficultyContradiction(intent) {
	const text = typeof intent === 'string' ? intent : '';
	return HARD_DIFFICULTY_PATTERN.test(text) && EASY_DIFFICULTY_PATTERN.test(text);
}

// ---------------------------------------------------------------------------
// Value detectors for the client live preview
// ---------------------------------------------------------------------------
//
// The Jev engine resolves values from confirmed text; these deterministic
// detectors let the card show the same fields instantly (0 tokens) whenever
// the message is unambiguous. They are intentionally conservative: an
// unmapped mention returns null so the caller can ask Jev instead.

/** Best-effort exam id from an exact name or id-words mention. */
export function detectExamId(intent) {
	const text = String(intent || '').toLowerCase();
	if (!text) return null;
	for (const exam of OBJECTIVE_ONLY_EXAMS) {
		const name = exam.name.toLowerCase();
		const idWords = exam.id.replace(/-/gu, ' ');
		if (text.includes(name) || text.includes(idWords)) {
			return exam.id;
		}
	}
	return null;
}

const DIFFICULTY_VALUE_PATTERNS = [
	{ value: 'expert', pattern: /\bexpert\b|एक्सपर्ट/iu },
	{
		value: 'advanced',
		pattern: /\b(advanced|hard|tough|difficult|challenging)\b|कठिन|मुश्किल|उन्नत/iu,
	},
	{
		value: 'beginner',
		pattern:
			/\b(beginner|easy|simple|basic|kids|children|starter|introductory)\b|आसान|शुरुआती|बच्चों/iu,
	},
	{ value: 'intermediate', pattern: /\b(intermediate|medium)\b|मध्यम/iu },
];

export function detectDifficulty(intent) {
	const text = typeof intent === 'string' ? intent : '';
	for (const entry of DIFFICULTY_VALUE_PATTERNS) {
		if (entry.pattern.test(text)) {
			return entry.value;
		}
	}
	return null;
}

export function detectLanguage(intent) {
	const text = typeof intent === 'string' ? intent : '';
	if (/\b(hindi|hinglish)\b|हिंदी|हिन्दी|देवनागरी/iu.test(text)) {
		return 'hindi';
	}
	if (/\benglish\b|इंग्लिश|अंग्रेजी/iu.test(text)) {
		return 'english';
	}
	return null;
}

const TEST_TYPE_VALUE_PATTERNS = [
	{ value: 'coding', pattern: /\b(coding|programming|code)\b|प्रोग्रामिंग/iu },
	{
		value: 'true-false',
		pattern: /\btrue\s?-?\s?false\b|\bbinary\b|\byes\s?-?\s?no\b|सही\s*\/?\s*गलत/iu,
	},
	{ value: 'speed-challenge', pattern: /\b(speed|rapid|timer|timed)\b|तेज़/iu },
	{ value: 'multiple-choice', pattern: /\b(mcq|mcqs|multiple\s?-?\s?choice|objective)\b/iu },
];

export function detectTestType(intent) {
	const text = typeof intent === 'string' ? intent : '';
	for (const entry of TEST_TYPE_VALUE_PATTERNS) {
		if (entry.pattern.test(text)) {
			return entry.value;
		}
	}
	return null;
}
