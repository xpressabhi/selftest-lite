// Bounded, server-side sanitizing for the planner input that travels with a
// generation request (`intentCapture`). Pure and deterministic: the API route
// calls sanitizeIntentCapture() before anything touches storage or the prompt,
// so a hostile client cannot smuggle unbounded text or unknown keys into
// ai_test_intent or the model prompt.
//
// Shape: { thread: [{ role: 'user', text }], plan, provenance }.

import { normalizePlan } from '$lib/server/intentParse';
import { MAX_INTENT_CHARS, sanitizeInputText } from '$lib/shared/inputLimits';

export const MAX_THREAD_MESSAGES = 8;
export const MAX_THREAD_CHARS = 4000;
export const MAX_ORIGINAL_REQUEST_CHARS = 1000;
const MAX_PROVENANCE_KEYS = 24;
const MAX_PROVENANCE_VALUE_CHARS = 64;
const MAX_FIELD_LIST = 8;
const MAX_ROUND = 10;

const PARSE_MODES = new Set(['preview', 'turn']);

function asRecord(value) {
	return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function boundedString(value, maxChars) {
	if (typeof value !== 'string') {
		return null;
	}
	const cleaned = sanitizeInputText(value, maxChars).trim();
	return cleaned || null;
}

function sanitizeFieldConfidence(value) {
	const entries = Object.entries(asRecord(value)).slice(0, MAX_PROVENANCE_KEYS);
	const result = {};
	for (const [key, raw] of entries) {
		if (key.length > 32) continue;
		const number = Number(raw);
		if (Number.isFinite(number) && number >= 0 && number <= 1) {
			result[key] = number;
		}
	}
	return result;
}

function sanitizeExplicit(value) {
	const entries = Object.entries(asRecord(value)).slice(0, MAX_PROVENANCE_KEYS);
	const result = {};
	for (const [key, raw] of entries) {
		if (key.length <= 32 && raw === true) {
			result[key] = true;
		}
	}
	return result;
}

function sanitizeAnswers(value) {
	const entries = Object.entries(asRecord(value)).slice(0, MAX_PROVENANCE_KEYS);
	const result = {};
	for (const [key, raw] of entries) {
		if (key.length > 32) continue;
		const cleaned = boundedString(raw, MAX_PROVENANCE_VALUE_CHARS);
		if (cleaned) {
			result[key] = cleaned;
		}
	}
	return result;
}

function sanitizeFieldList(value) {
	if (!Array.isArray(value)) {
		return [];
	}
	const result = [];
	for (const raw of value.slice(0, MAX_FIELD_LIST)) {
		const cleaned = boundedString(raw, MAX_PROVENANCE_VALUE_CHARS);
		if (cleaned && !result.includes(cleaned)) {
			result.push(cleaned);
		}
	}
	return result;
}

function sanitizeProvenance(raw) {
	const source = asRecord(raw);
	return {
		topicSource: boundedString(source.topicSource, 32),
		parseMode: PARSE_MODES.has(source.parseMode) ? source.parseMode : null,
		fieldConfidence: sanitizeFieldConfidence(source.fieldConfidence),
		explicit: sanitizeExplicit(source.explicit),
		answers: sanitizeAnswers(source.answers),
		askedFields: sanitizeFieldList(source.askedFields),
		skippedFields: sanitizeFieldList(source.skippedFields),
		round:
			Number.isInteger(source.round) && source.round >= 0 && source.round <= MAX_ROUND
				? source.round
				: 0,
	};
}

/**
 * Returns the bounded capture or null when there is nothing worth storing
 * (missing input, or no usable user message).
 */
export function sanitizeIntentCapture(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return null;
	}

	const texts = [];
	for (const entry of Array.isArray(raw.thread) ? raw.thread : []) {
		const value = typeof entry === 'string' ? entry : asRecord(entry).text;
		const cleaned = boundedString(value, MAX_INTENT_CHARS);
		if (cleaned) {
			texts.push(cleaned);
		}
	}

	let thread = texts
		.slice(-MAX_THREAD_MESSAGES)
		.map((text) => ({ role: 'user', text }));
	let total = thread.reduce((sum, message) => sum + message.text.length, 0);
	while (thread.length > 1 && total > MAX_THREAD_CHARS) {
		total -= thread[0].text.length;
		thread = thread.slice(1);
	}
	if (thread.length === 0) {
		return null;
	}

	return {
		thread,
		plan: normalizePlan(raw.plan),
		provenance: sanitizeProvenance(raw.provenance),
	};
}

/** Joins the sanitized thread for the generation prompt, bounded. */
export function buildOriginalRequest(thread, maxChars = MAX_ORIGINAL_REQUEST_CHARS) {
	const joined = (Array.isArray(thread) ? thread : [])
		.map((message) => (typeof message === 'string' ? message : message?.text))
		.filter((text) => typeof text === 'string' && text.trim())
		.map((text) => text.trim())
		.join(' | ');
	const cap = Number.isFinite(maxChars) && maxChars > 0 ? maxChars : MAX_ORIGINAL_REQUEST_CHARS;
	return joined.slice(0, cap);
}
