import { describe, expect, it } from 'vitest';
import {
	InvalidRequestBodyError,
	RequestBodyTooLargeError,
	parseRequestBody,
	readJsonBody,
} from './requestBody';

function jsonRequest(body) {
	return { text: () => Promise.resolve(body) };
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
		const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
		await expect(parseRequestBody(jsonRequest(oversized))).rejects.toBeInstanceOf(
			RequestBodyTooLargeError
		);
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
		const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
		await expect(readJsonBody(jsonRequest(oversized))).resolves.toEqual({});
	});

	it('accepts a value or factory fallback', async () => {
		await expect(readJsonBody(jsonRequest(''), null)).resolves.toBeNull();
		await expect(readJsonBody(jsonRequest(''), () => ({ ok: true }))).resolves.toEqual({
			ok: true,
		});
	});
});
