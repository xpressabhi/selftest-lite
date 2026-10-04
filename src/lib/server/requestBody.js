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
 * Reads the body, refusing anything over the cap, and returns null when it is.
 *
 * Two things were wrong with `await request.text()` followed by a length check.
 * The cap was applied after the whole body had been buffered, so the allocation
 * it exists to prevent still happened — concurrent large requests were a memory
 * DoS. And the cap is named in bytes but was compared against UTF-16 code units,
 * so a body of 3-byte characters passed at roughly 1.5x the intended size.
 *
 * A declared Content-Length is rejected up front, and the body is then streamed
 * and abandoned the moment it crosses the cap, so an oversized upload is never
 * fully materialised. Returns null for "too large".
 */
async function readCappedBody(request) {
	// Trust the declared length only to reject early; it is attacker-supplied, so
	// the streaming check below is what actually enforces the cap.
	const declared = Number(request.headers?.get?.('content-length'));
	if (Number.isFinite(declared) && declared > MAX_REQUEST_BODY_BYTES) {
		return null;
	}

	const body = request.body;
	if (!body || typeof body.getReader !== 'function') {
		// No stream to cap incrementally; fall back to the buffered read.
		const text = await request.text();
		return utf8Length(text) > MAX_REQUEST_BODY_BYTES ? null : text;
	}

	const reader = body.getReader();
	const decoder = new TextDecoder();
	let received = 0;
	let text = '';
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			received += value.byteLength;
			if (received > MAX_REQUEST_BODY_BYTES) {
				// Stop pulling: the rest of the upload is discarded rather than
				// buffered, then the connection is released.
				await reader.cancel().catch(() => {});
				return null;
			}
			text += decoder.decode(value, { stream: true });
		}
	} finally {
		reader.releaseLock?.();
	}
	return text + decoder.decode();
}

/** Byte length of a string once encoded as UTF-8. */
function utf8Length(value) {
	return new TextEncoder().encode(value).byteLength;
}
export async function parseRequestBody(request) {
	const rawBody = await readCappedBody(request);
	if (rawBody === null) {
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
	const rawBody = await readCappedBody(request);
	if (rawBody === null) {
		return typeof fallback === 'function' ? fallback() : fallback;
	}
	try {
		return JSON.parse(rawBody);
	} catch {
		return typeof fallback === 'function' ? fallback() : fallback;
	}
}
