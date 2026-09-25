import { MAX_REQUEST_BODY_BYTES } from './quizConfig';

export class RequestBodyTooLargeError extends Error {
	constructor() {
		super('Request body exceeds the maximum allowed size');
		this.name = 'RequestBodyTooLargeError';
		this.code = 'REQUEST_TOO_LARGE';
	}
}

export class InvalidRequestBodyError extends Error {
	constructor() {
		super('Request body must be valid JSON');
		this.name = 'InvalidRequestBodyError';
		this.code = 'INVALID_REQUEST_BODY';
	}
}

/**
 * Reads and parses the JSON request body while enforcing a size cap on the
 * raw text before parsing, so callers cannot force a large parse on the
 * server.
 */
export async function parseRequestBody(request) {
	const rawBody = await request.text();
	if (rawBody.length > MAX_REQUEST_BODY_BYTES) {
		throw new RequestBodyTooLargeError();
	}
	try {
		return JSON.parse(rawBody);
	} catch {
		throw new InvalidRequestBodyError();
	}
}

/**
 * Tolerant variant for endpoints where an empty or malformed body is allowed.
 * Enforces the same size cap, then returns the fallback instead of throwing, so
 * a hostile large/malformed body can never force a parse or a 500.
 */
export async function readJsonBody(request, fallback = {}) {
	const rawBody = await request.text();
	if (rawBody.length > MAX_REQUEST_BODY_BYTES) {
		return typeof fallback === 'function' ? fallback() : fallback;
	}
	try {
		return JSON.parse(rawBody);
	} catch {
		return typeof fallback === 'function' ? fallback() : fallback;
	}
}
