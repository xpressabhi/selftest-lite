// Transient provider failures: capacity spikes and rate limits that succeed on
// a second attempt.
//
// Gemini returns 503 "This model is currently experiencing high demand" under
// load, and 429 when a quota window is exhausted. Both are worth retrying, and
// both are indistinguishable from a hard failure if you only look at the final
// status code.

const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

const TRANSIENT_PATTERNS = [
	/\b(429|500|502|503|504)\b/,
	/unavailable/i,
	/high demand/i,
	/overloaded/i,
	/rate limit/i,
	/resource[_\s-]?exhausted/i,
	/internal error/i,
];

const TIMEOUT_PATTERNS = /\btimeout|timed out|deadline exceeded|aborted/i;

function errorText(errorLike) {
	if (!errorLike) return '';
	if (typeof errorLike === 'string') return errorLike;
	return [errorLike.message, errorLike.error, errorLike.details, errorLike.statusText]
		.filter((field) => typeof field === 'string')
		.join(' | ');
}

/**
 * True when the failure is worth another attempt. Timeouts are excluded:
 * they have already consumed the caller's deadline, so a retry cannot finish
 * and only delays the error the user is waiting on.
 */
export function isTransientProviderError(errorLike) {
	if (!errorLike) return false;
	const status = Number(errorLike?.status ?? errorLike?.statusCode);
	if (status === 408) {
		return false;
	}
	// A bare status code is enough: providers routinely reject with a status and
	// no message body, and treating that as permanent loses a recoverable call.
	if (TRANSIENT_STATUS_CODES.has(status)) {
		return true;
	}
	const text = errorText(errorLike);
	if (!text || TIMEOUT_PATTERNS.test(text)) {
		return false;
	}
	return TRANSIENT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Linear backoff that respects a deadline: returns false when there is no time
 * left to wait, so the caller surfaces the failure instead of sleeping past its
 * own budget.
 */
export async function backoffBeforeRetry(attempt, { baseDelayMs = 750, deadlineMs } = {}) {
	const delayMs = baseDelayMs * attempt;
	if (Number.isFinite(deadlineMs) && Date.now() + delayMs >= deadlineMs) {
		return false;
	}
	await new Promise((resolve) => setTimeout(resolve, delayMs));
	return true;
}
