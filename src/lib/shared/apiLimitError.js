const API_LIMIT_PATTERNS = [
	/resource[_\s-]?exhausted/i,
	/\bquota\b/i,
	/rate[\s-]?limit/i,
	/too many requests/i,
	/limit exceeded/i,
	/exceeded your current quota/i,
	/insufficient\s+quota/i,
	/billing/i,
];

export const API_LIMIT_ERROR_CODE = 'API_LIMIT_EXCEEDED';
export const API_TIMEOUT_ERROR_CODE = 'GENERATION_TIMEOUT';

const API_TIMEOUT_PATTERNS = [
	/\btimeout\b/i,
	/timed out/i,
	/deadline exceeded/i,
	/request timeout/i,
	/generation timed out/i,
	/aborted/i,
];

function collectErrorText(errorLike) {
	if (!errorLike) return '';
	if (typeof errorLike === 'string') return errorLike;

	const fields = [
		errorLike.message,
		errorLike.error,
		errorLike.details,
		errorLike.code,
		errorLike.statusText,
	];

	return fields.filter((field) => typeof field === 'string').join(' | ');
}

export function isApiLimitExceededError(errorLike) {
	const details = collectErrorText(errorLike).toLowerCase();
	if (!details) return false;
	return API_LIMIT_PATTERNS.some((pattern) => pattern.test(details));
}

export function isApiTimeoutError(errorLike) {
	const details = collectErrorText(errorLike).toLowerCase();
	if (!details) return false;
	return API_TIMEOUT_PATTERNS.some((pattern) => pattern.test(details));
}

export function classifyApiError(error, fallbackArgs = {}) {
	const {
		fallbackCode = 'UNEXPECTED_ERROR',
		fallbackMessage = 'An unexpected error occurred',
		limitMessage = 'API limit exceeded. Please retry manually after some time.',
		timeoutMessage = 'The request timed out. Please retry.',
	} = fallbackArgs;

	if (isApiLimitExceededError(error)) {
		return {
			statusCode: 429,
			code: API_LIMIT_ERROR_CODE,
			message: limitMessage,
		};
	}
	if (isApiTimeoutError(error)) {
		return {
			statusCode: 408,
			code: API_TIMEOUT_ERROR_CODE,
			message: timeoutMessage,
		};
	}
	return {
		statusCode: 500,
		code: fallbackCode,
		message: fallbackMessage,
	};
}
