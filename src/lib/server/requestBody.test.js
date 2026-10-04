import { describe, expect, it } from 'vitest';
import {
	InvalidRequestBodyError,
	RequestBodyTooLargeError,
	parseRequestBody,
	readJsonBody,
} from './requestBody';

const MB = 1024 * 1024;

/** A request whose body streams in `chunkBytes`-sized chunks, like a real upload. */
function streamingRequest(text, { chunkBytes = 64 * 1024, contentLength } = {}) {
	const bytes = new TextEncoder().encode(text);
	let offset = 0;
	let cancelled = false;
	return {
		cancelled: () => cancelled,
		bytesRead: () => offset,
		headers: new Headers(
			contentLength === undefined ? {} : { 'content-length': String(contentLength) }
		),
		text: () => Promise.resolve(text),
		body: {
			getReader: () => ({
				read: () => {
					if (offset >= bytes.length) {
						return Promise.resolve({ done: true, value: undefined });
					}
					const end = Math.min(offset + chunkBytes, bytes.length);
					const value = bytes.slice(offset, end);
					offset = end;
					return Promise.resolve({ done: false, value });
				},
				cancel: () => {
					cancelled = true;
					return Promise.resolve();
				},
				releaseLock: () => {},
			}),
		},
	};
}

function jsonRequest(body) {
	return { headers: new Headers(), text: () => Promise.resolve(body) };
}

describe('parseRequestBody', () => {
	it('parses a valid JSON body', async () => {
		await expect(parseRequestBody(jsonRequest('{"a":1}'))).resolves.toEqual({
			a: 1,
		});
	});

	it('rejects invalid JSON', async () => {
		await expect(parseRequestBody(jsonRequest('{not json'))).rejects.toBeInstanceOf(
			InvalidRequestBodyError
		);
	});

	it('rejects bodies over 2MB', async () => {
		const oversized = 'x'.repeat(2 * MB + 1);
		await expect(parseRequestBody(jsonRequest(oversized))).rejects.toBeInstanceOf(
			RequestBodyTooLargeError
		);
	});

	// The cap is in bytes but was compared against UTF-16 code units, so a body
	// of 3-byte characters slipped through at ~1.5x the intended size.
	it('measures the cap in bytes, not UTF-16 code units', async () => {
		// 800k characters, ~2.4MB of UTF-8, under 2M code units.
		const multibyte = 'अ'.repeat(800_000);
		expect(multibyte.length).toBeLessThan(2 * MB);
		await expect(parseRequestBody(jsonRequest(multibyte))).rejects.toBeInstanceOf(
			RequestBodyTooLargeError
		);
	});

	it('rejects a streamed body that crosses the cap', async () => {
		// One byte over the cap, so the boundary case is covered too.
		const request = streamingRequest('x'.repeat(2 * MB + 1));
		await expect(parseRequestBody(request)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
		// The point of streaming: the read stops at the cap instead of consuming
		// the whole body. The chunk that revealed the overflow is counted, the
		// remainder is not.
		expect(request.cancelled()).toBe(true);
		expect(request.bytesRead()).toBeLessThanOrEqual(2 * MB + 64 * 1024);
	});

	it('stops reading well before the end of a large upload', async () => {
		// The memory-DoS case: a body many times the cap must not be buffered.
		const request = streamingRequest('x'.repeat(40 * MB));
		await expect(parseRequestBody(request)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
		expect(request.bytesRead()).toBeLessThan(3 * MB);
	});

	it('rejects on a declared content-length without reading the body', async () => {
		const request = streamingRequest('{"a":1}', { contentLength: 50 * MB });
		await expect(parseRequestBody(request)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
		expect(request.bytesRead()).toBe(0);
	});

	it('accepts a streamed body under the cap, split across chunks', async () => {
		const payload = JSON.stringify({ a: 'x'.repeat(300 * 1024) });
		await expect(parseRequestBody(streamingRequest(payload))).resolves.toEqual({
			a: 'x'.repeat(300 * 1024),
		});
	});

	it('reassembles a multibyte character split across a chunk boundary', async () => {
		const payload = JSON.stringify({ a: 'अ'.repeat(50_000) });
		// A chunk size that lands mid-character is the case a naive
		// per-chunk TextDecoder would corrupt.
		const request = streamingRequest(payload, { chunkBytes: 1021 });
		await expect(parseRequestBody(request)).resolves.toEqual({ a: 'अ'.repeat(50_000) });
	});

	it('falls back to a buffered read when there is no stream', async () => {
		const request = { headers: new Headers(), text: () => Promise.resolve('{"a":1}') };
		await expect(parseRequestBody(request)).resolves.toEqual({ a: 1 });
	});
});

describe('readJsonBody', () => {
	it('parses a valid JSON body', async () => {
		await expect(readJsonBody(jsonRequest('{"a":1}'))).resolves.toEqual({ a: 1 });
	});

	it('falls back to an empty object for invalid JSON', async () => {
		await expect(readJsonBody(jsonRequest('{not json'))).resolves.toEqual({});
	});

	it('falls back for oversized bodies instead of parsing them', async () => {
		const oversized = 'x'.repeat(2 * MB + 1);
		await expect(readJsonBody(jsonRequest(oversized))).resolves.toEqual({});
	});

	it('falls back for a streamed oversized body', async () => {
		const request = streamingRequest('x'.repeat(2 * MB + 1));
		await expect(readJsonBody(request, { ok: true })).resolves.toEqual({ ok: true });
		expect(request.cancelled()).toBe(true);
	});

	it('accepts a value or factory fallback', async () => {
		await expect(readJsonBody(jsonRequest(''), null)).resolves.toBeNull();
		await expect(readJsonBody(jsonRequest(''), () => ({ ok: true }))).resolves.toEqual({
			ok: true,
		});
	});
});
