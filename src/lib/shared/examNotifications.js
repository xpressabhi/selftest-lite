// Pure rules for the exam notification tracker: normalization, dedupe,
// URL/date validation and status derivation. No I/O and no SvelteKit imports,
// so the sync script, the server store and vitest all share one definition.
//
// Failure modes deliberately refused here (see examNotifications.test.js):
// empty/HTML titles, colliding dedupe keys, lifecycle notices in scope,
// tracking/credential/off-host URLs, impossible dates, status flapping at the
// IST day boundary, and exam ids the practice registry does not know.

import { createHash } from 'node:crypto';
import { HUB_CATEGORIES, OBJECTIVE_ONLY_EXAMS } from '../data/indianExams.js';
import { addDays, parseIsoDate } from './examNotificationStatus.js';

export {
	CLOSING_SOON_DAYS,
	NOTIFICATION_STATUS,
	addDays,
	deriveNotificationStatus,
	parseIsoDate,
	todayInIst
} from './examNotificationStatus.js';

export const KNOWN_EXAM_IDS = new Set(OBJECTIVE_ONLY_EXAMS.map((exam) => exam.id));
export const KNOWN_CATEGORY_IDS = new Set(HUB_CATEGORIES.map((category) => category.id));

export const NEAR_DUPLICATE_THRESHOLD = 0.85;
export const MIN_EXTRACTION_CONFIDENCE = 0.5;
export const TITLE_MAX_CHARS = 240;
export const STATE_MAX_CHARS = 60;

// Not recruitment notifications: tracked separately by the source sites, out
// of scope for this feature, and prone to confusing the "apply by" story.
const EXCLUDED_TITLE_PATTERNS = [
	/\bresults?\b/i,
	/\badmit\s*cards?\b/i,
	/\banswer\s*keys?\b/i,
	/\bcut[\s-]?offs?\b/i,
	/\bmerit\s*list/i,
	/\bscore\s*cards?\b/i
];

const TRACKING_PARAMS = new Set([
	'utm_source',
	'utm_medium',
	'utm_campaign',
	'utm_term',
	'utm_content',
	'fbclid',
	'gclid',
	'igshid',
	'mc_cid',
	'mc_eid'
]);

const PUBLISHED_MAX_AGE_DAYS = 730;
const DATE_MAX_FUTURE_DAYS = 1095;
const DATE_ORDER_GRACE_DAYS = 30;

function decodeNumericEntity(raw, radix) {
	const code = Number.parseInt(raw, radix);
	if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
		return '';
	}
	try {
		return String.fromCodePoint(code);
	} catch {
		return '';
	}
}

function decodeEntities(value) {
	return value
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#0*39;/g, "'")
		.replace(/&#x0*27;/gi, "'")
		.replace(/&#x([0-9a-f]+);/gi, (_, hex) => decodeNumericEntity(hex, 16))
		.replace(/&#(\d+);/g, (_, decimal) => decodeNumericEntity(decimal, 10));
}

/** Decoded, tag-free, whitespace-collapsed text; '' for non-strings. */
function plainText(value) {
	if (typeof value !== 'string') {
		return '';
	}
	return decodeEntities(value)
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** A display title, or null when nothing usable survives. */
export function sanitizeExtractedTitle(value) {
	const text = plainText(value);
	if (!text) {
		return null;
	}
	return text.slice(0, TITLE_MAX_CHARS);
}

/**
 * Comparison key: lowercase, punctuation-free, whitespace-collapsed, unicode
 * letters/digits kept (Hindi titles must survive).
 */
export function titleKey(value) {
	return plainText(value)
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Stable identity for a notification. The source is part of the key so the
 * same headline on two different sites never merges; title-only so a moved
 * PDF URL updates the same row instead of duplicating it.
 */
export function dedupeKeyFor(sourceId, title) {
	const source = typeof sourceId === 'string' ? sourceId.trim() : '';
	const key = titleKey(title);
	if (!source || !key) {
		return null;
	}
	return createHash('sha256').update(`${source}|${key}`).digest('hex');
}

function tokensOf(value) {
	const key = titleKey(value);
	return key ? new Set(key.split(' ')) : new Set();
}

/** Jaccard overlap of title tokens in [0, 1]; 0 for empty input. */
export function tokenSetSimilarity(left, right) {
	const leftTokens = tokensOf(left);
	const rightTokens = tokensOf(right);
	if (leftTokens.size === 0 || rightTokens.size === 0) {
		return 0;
	}
	let intersection = 0;
	for (const token of leftTokens) {
		if (rightTokens.has(token)) {
			intersection += 1;
		}
	}
	return intersection / (leftTokens.size + rightTokens.size - intersection);
}

export function isExcludedScopeTitle(title) {
	const text = plainText(title);
	return EXCLUDED_TITLE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Returns the URL without tracking parameters, or null when it cannot be a
 * link we would ever show (junk, non-http, credentials embedded).
 */
export function stripTrackingParams(rawUrl) {
	if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
		return null;
	}
	let url;
	try {
		url = new URL(rawUrl.trim());
	} catch {
		return null;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		return null;
	}
	if (url.username || url.password) {
		return null;
	}
	for (const key of [...url.searchParams.keys()]) {
		if (TRACKING_PARAMS.has(key.toLowerCase())) {
			url.searchParams.delete(key);
		}
	}
	url.hash = '';
	return url.toString();
}

/**
 * The URL's host must be one of the source's allowed hosts or a subdomain of
 * one. Checked on the final URL after redirects, so an allowed link cannot
 * bounce users to an unrelated host through an open redirect.
 */
export function isUrlOnAllowedHosts(rawUrl, allowedHosts) {
	const cleaned = stripTrackingParams(rawUrl);
	if (!cleaned || !Array.isArray(allowedHosts) || allowedHosts.length === 0) {
		return false;
	}
	const host = new URL(cleaned).hostname.toLowerCase();
	return allowedHosts.some((allowed) => {
		const normalized = String(allowed || '')
			.trim()
			.toLowerCase();
		return normalized.length > 0 && (host === normalized || host.endsWith(`.${normalized}`));
	});
}

/** Official Indian government domains, used to gate AI-discovered sources. */
export function isOfficialHost(host) {
	const normalized = String(host || '')
		.trim()
		.toLowerCase();
	if (!normalized) {
		return false;
	}
	return (
		normalized === 'gov.in' ||
		normalized.endsWith('.gov.in') ||
		normalized === 'nic.in' ||
		normalized.endsWith('.nic.in')
	);
}

/**
 * Parses and sanity-checks the four dates. Invalid values become null with a
 * problem code recorded, so one bad date can never poison the whole row.
 */
export function validateNotificationDates(input, todayIso) {
	const problems = [];
	const result = {
		publishedAt: null,
		applyStart: null,
		applyEnd: null,
		examDate: null,
		problems
	};

	const fields = [
		['publishedAt', 'published_at'],
		['applyStart', 'apply_start'],
		['applyEnd', 'apply_end'],
		['examDate', 'exam_date']
	];
	for (const [field, code] of fields) {
		const raw = input?.[field] ?? null;
		if (raw === null) {
			continue;
		}
		const parsed = parseIsoDate(raw);
		if (!parsed) {
			problems.push(`${code}_format`);
			continue;
		}
		result[field] = parsed;
	}

	if (result.publishedAt) {
		const oldest = addDays(todayIso, -PUBLISHED_MAX_AGE_DAYS);
		const newest = addDays(todayIso, 1);
		if (result.publishedAt < oldest || result.publishedAt > newest) {
			problems.push('published_at_range');
			result.publishedAt = null;
		}
	}

	if (result.applyStart && result.applyEnd && result.applyStart > result.applyEnd) {
		problems.push('apply_window_order');
		result.applyStart = null;
	}

	if (result.applyEnd) {
		const latest = addDays(todayIso, DATE_MAX_FUTURE_DAYS);
		if (result.applyEnd > latest) {
			problems.push('apply_end_range');
			result.applyEnd = null;
		} else if (
			result.publishedAt &&
			result.applyEnd < addDays(result.publishedAt, -DATE_ORDER_GRACE_DAYS)
		) {
			problems.push('apply_end_order');
			result.applyEnd = null;
		}
	}

	if (result.examDate) {
		const latest = addDays(todayIso, DATE_MAX_FUTURE_DAYS);
		if (result.examDate > latest) {
			problems.push('exam_date_range');
			result.examDate = null;
		} else if (
			result.publishedAt &&
			result.examDate < addDays(result.publishedAt, -DATE_ORDER_GRACE_DAYS)
		) {
			problems.push('exam_date_order');
			result.examDate = null;
		}
	}

	return result;
}

/** Model-suggested exam id, accepted only when the registry knows it. */
export function sanitizeExamId(value, knownIds = KNOWN_EXAM_IDS) {
	const candidate = typeof value === 'string' ? value.trim() : '';
	return candidate && knownIds.has(candidate) ? candidate : null;
}

export function sanitizeCategory(value, knownIds = KNOWN_CATEGORY_IDS, fallback = null) {
	const candidate = typeof value === 'string' ? value.trim() : '';
	return candidate && knownIds.has(candidate) ? candidate : fallback;
}

export function sanitizeState(value) {
	const text = plainText(value);
	return text ? text.slice(0, STATE_MAX_CHARS) : null;
}

/** Absent confidence passes; present confidence must clear the floor. */
export function meetsConfidence(value) {
	if (value === null || value === undefined) {
		return true;
	}
	return typeof value === 'number' && Number.isFinite(value) && value >= MIN_EXTRACTION_CONFIDENCE;
}
