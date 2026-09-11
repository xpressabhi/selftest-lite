import { describe, expect, it } from 'vitest';
import { parseJsonResponse } from './jsonResponse';

describe('parseJsonResponse', () => {
	it('parses plain JSON', () => {
		expect(parseJsonResponse('{"explanation":"ok"}')).toEqual({ explanation: 'ok' });
	});

	it('parses JSON wrapped in markdown fences', () => {
		expect(parseJsonResponse('```json\n{"explanation":"fenced"}\n```')).toEqual({
			explanation: 'fenced',
		});
	});

	it('extracts JSON from surrounding prose', () => {
		expect(
			parseJsonResponse('Sure! Here is the result:\n{"explanation":"prose"}\nHope that helps.')
		).toEqual({ explanation: 'prose' });
	});

	it('escapes raw control characters inside strings', () => {
		expect(parseJsonResponse('{"explanation":"line one\nline two\tend"}')).toEqual({
			explanation: 'line one\nline two\tend',
		});
	});

	it('recovers from a lone backslash', () => {
		expect(parseJsonResponse('{"explanation":"a \\ b"}')).toEqual({ explanation: 'a \\ b' });
	});

	it('throws on empty responses and non-JSON text', () => {
		expect(() => parseJsonResponse('')).toThrow();
		expect(() => parseJsonResponse('   ')).toThrow();
		expect(() => parseJsonResponse('not json at all')).toThrow();
	});
});
