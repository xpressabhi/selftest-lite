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

export function isApiLimitExceededResponse(status, errorPayload) {
	if (status === 429) return true;
	if (errorPayload?.code === API_LIMIT_ERROR_CODE) return true;
	return isApiLimitExceededError(errorPayload);
}

