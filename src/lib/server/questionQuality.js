// Deterministic content-quality checks and repairs for generated questions.
//
// These run in code, not in the prompt: models do not reliably follow
// "silently verify yourself" instructions, and a shuffled option order plus a
// length/duplicate/script check removes entire classes of test defects
// (answer-position bias, longest-answer tells, repeated questions, language
// drift). Failures are returned so the caller can regenerate the batch.

const LAZY_OPTION_PATTERN = /^(all|none)\s+of\s+the\s+above\.?$/iu;
const DEVANAGARI_PATTERN = /[\u0900-\u097F]/gu;
const LATIN_PATTERN = /[a-z]/giu;

export const NEAR_DUPLICATE_THRESHOLD = 0.8;
export const LENGTH_RATIO_LIMIT = 1.25;
export const HINDI_SCRIPT_RATIO_MIN = 0.25;

/** Lowercases, strips markdown/LaTeX/punctuation and collapses whitespace. */
export function normalizeQuestionText(text) {
	return String(text || '')
		.toLowerCase()
		.replace(/```[\s\S]*?```/gu, ' ')
		.replace(/\$[^$]*\$/gu, ' ')
		.replace(/[*_`#>\\]/gu, '')
		.replace(/[^\p{L}\p{N}\s]/gu, ' ')
		.replace(/\s+/gu, ' ')
		.trim();
}

function trigrams(text) {
	const padded = ` ${text} `;
	const grams = new Set();
	for (let index = 0; index < padded.length - 2; index += 1) {
		grams.add(padded.slice(index, index + 3));
	}
	return grams;
}

/** Jaccard similarity over character trigrams; 0..1. */
export function trigramSimilarity(textA, textB) {
	const normalizedA = normalizeQuestionText(textA);
	const normalizedB = normalizeQuestionText(textB);
	if (!normalizedA || !normalizedB) {
		return 0;
	}
	const gramsA = trigrams(normalizedA);
	const gramsB = trigrams(normalizedB);
	let intersection = 0;
	for (const gram of gramsA) {
		if (gramsB.has(gram)) {
			intersection += 1;
		}
	}
	const union = gramsA.size + gramsB.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

function hasUnbalancedLatex(text) {
	const source = String(text || '');
	let dollars = 0;
	for (let index = 0; index < source.length; index += 1) {
		if (source[index] === '\\') {
			index += 1;
			continue;
		}
		if (source[index] === '$') {
			dollars += 1;
		}
	}
	const leftCount = (source.match(/\\left\b/gu) || []).length;
	const rightCount = (source.match(/\\right\b/gu) || []).length;
	return dollars % 2 !== 0 || leftCount !== rightCount;
}

function hindiScriptRatio(text) {
	const source = String(text || '')
		.replace(/```[\s\S]*?```/gu, ' ')
		.replace(/\$[^$]*\$/gu, ' ');
	const devanagari = (source.match(DEVANAGARI_PATTERN) || []).length;
	const latin = (source.match(LATIN_PATTERN) || []).length;
	const total = devanagari + latin;
	return total === 0 ? 1 : devanagari / total;
}

function isUniquelyLongest(answer, options) {
	const lengths = options.map((option) => String(option).length);
	const answerLength = String(answer).length;
	const maxOther = Math.max(...lengths.filter((length) => length !== answerLength), 0);
	return answerLength > maxOther * LENGTH_RATIO_LIMIT;
}

/** Fisher-Yates shuffle using an injectable RNG for tests. */
export function shuffleOptions(question, random = Math.random) {
	const options = Array.isArray(question?.options) ? [...question.options] : [];
	for (let index = options.length - 1; index > 0; index -= 1) {
		const swapIndex = Math.floor(random() * (index + 1));
		[options[index], options[swapIndex]] = [options[swapIndex], options[index]];
	}
	return { ...question, options };
}

/**
 * Inspects one question and returns a list of issue codes. An empty list means
 * the question is acceptable. `previousQuestionTexts` enables near-duplicate
 * detection (within the paper and against recent papers for the topic).
 */
export function inspectQuestion(question, { previousQuestionTexts = [], language } = {}) {
	const issues = [];
	const options = Array.isArray(question?.options) ? question.options : [];
	const answer = typeof question?.answer === 'string' ? question.answer : '';
	const questionText = String(question?.question || '');

	if (options.length !== 2 && options.length !== 4) {
		issues.push('option-count');
	}
	const normalizedOptions = options.map((option) => String(option || '').trim().toLowerCase());
	if (normalizedOptions.some((option) => option.length === 0)) {
		issues.push('empty-option');
	}
	if (new Set(normalizedOptions).size !== normalizedOptions.length) {
		issues.push('duplicate-options');
	}
	if (!answer || !options.includes(answer)) {
		issues.push('answer-not-in-options');
	}
	if (options.some((option) => LAZY_OPTION_PATTERN.test(String(option).trim()))) {
		issues.push('lazy-option');
	}
	if (answer && options.includes(answer) && options.length > 2 && isUniquelyLongest(answer, options)) {
		issues.push('longest-answer-tell');
	}
	if (hasUnbalancedLatex(`${questionText} ${options.join(' ')}`)) {
		issues.push('latex-unbalanced');
	}
	if (
		language === 'hindi' &&
		questionText.length > 0 &&
		hindiScriptRatio(`${questionText} ${options.join(' ')}`) < HINDI_SCRIPT_RATIO_MIN
	) {
		issues.push('language-drift');
	}
	for (const previousText of previousQuestionTexts) {
		if (trigramSimilarity(questionText, previousText) >= NEAR_DUPLICATE_THRESHOLD) {
			issues.push('near-duplicate');
			break;
		}
	}
	return issues;
}

/**
 * Shuffles a question's options (fixing answer-position bias) and returns the
 * shuffled question plus any remaining issues.
 */
export function improveQuestion(question, options = {}) {
	const shuffled = shuffleOptions(question, options.random);
	return {
		question: shuffled,
		issues: inspectQuestion(shuffled, options),
	};
}

/** Runs inspectQuestion over a list, returning a flat list of `index: issue`. */
export function inspectQuestionBatch(questions, options = {}) {
	const issues = [];
	const seenTexts = [...(options.previousQuestionTexts || [])];
	questions.forEach((question, index) => {
		const found = inspectQuestion(question, { ...options, previousQuestionTexts: seenTexts });
		for (const issue of found) {
			issues.push({ index, issue });
		}
		seenTexts.push(String(question?.question || ''));
	});
	return issues;
}

/**
 * Shuffles every question (fixing answer-position bias) and reports the
 * remaining quality issues. Returns the improved questions either way.
 */
export function applyQualityFixes(questions, options = {}) {
	const fixed = [];
	const issues = [];
	const seenTexts = [...(options.previousQuestionTexts || [])];
	questions.forEach((question, index) => {
		const { question: improved, issues: found } = improveQuestion(question, {
			...options,
			previousQuestionTexts: seenTexts,
		});
		fixed.push(improved);
		for (const issue of found) {
			issues.push({ index, issue });
		}
		seenTexts.push(String(improved?.question || ''));
	});
	return { questions: fixed, issues };
}
