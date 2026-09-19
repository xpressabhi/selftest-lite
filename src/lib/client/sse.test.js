import { describe, expect, it } from 'vitest';
import { parseSseBuffer, streamErrorToError } from './sse.js';

describe('parseSseBuffer', () => {
	it('parses multiple frames in one chunk', () => {
		const { events, rest } = parseSseBuffer(
			'event: progress\ndata: {"approved":1}\n\nevent: done\ndata: {"id":42}\n\n'
		);
		expect(rest).toBe('');
		expect(events).toEqual([
			{ event: 'progress', data: { approved: 1 } },
			{ event: 'done', data: { id: 42 } },
		]);
	});

	it('keeps a partial frame for the next chunk', () => {
		const first = parseSseBuffer('event: progress\ndata: {"approved":');
		expect(first.events).toEqual([]);
		expect(first.rest).toContain('"approved"');
		const second = parseSseBuffer(`${first.rest}2}\n\n`);
		expect(second.events).toEqual([{ event: 'progress', data: { approved: 2 } }]);
		expect(second.rest).toBe('');
	});

	it('handles CRLF, comments and multi-line data', () => {
		const { events } = parseSseBuffer(': keep-alive\r\nevent: done\r\ndata: line1\r\ndata: line2\r\n\r\n');
		expect(events).toEqual([{ event: 'done', data: 'line1\nline2' }]);
	});

	it('defaults the event name to message', () => {
		const { events } = parseSseBuffer('data: {"ok":true}\n\n');
		expect(events).toEqual([{ event: 'message', data: { ok: true } }]);
	});

	it('ignores frames without data', () => {
		const { events } = parseSseBuffer('event: progress\n\n');
		expect(events).toEqual([]);
	});
});

describe('streamErrorToError', () => {
	it('maps the payload to an Error with retry hints', () => {
		const error = streamErrorToError({ error: 'Rate limited', code: 'RATE_LIMIT', status: 429 });
		expect(error.message).toBe('Rate limited');
		expect(error.code).toBe('RATE_LIMIT');
		expect(error.status).toBe(429);
		expect(error.retryable).toBe(true);
	});

	it('treats unknown failures as retryable', () => {
		expect(streamErrorToError(null).retryable).toBe(true);
	});
});
