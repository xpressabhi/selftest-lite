import { describe, expect, it } from 'vitest';
import { API_LIMIT_ERROR_CODE } from '$lib/shared/apiLimitError';
import { rateLimited } from './apiResponse';

// Fixed instant: no clock reads, so the body is byte-for-byte predictable.
const RESET_TIME = Date.UTC(2026, 0, 15, 6, 30, 45);

describe('rateLimited', () => {
	it('returns the canonical 429 JSON body for a rate-limit snapshot', async () => {
		const response = rateLimited({ resetTime: RESET_TIME, remaining: 3 });
		expect(response.status).toBe(429);
		expect(response.headers.get('content-type')).toMatch(/^application\/json/);

		const body = await response.json();
		expect(body).toEqual({
			error: 'Rate limit exceeded. Please try again later.',
			code: API_LIMIT_ERROR_CODE,
			resetTime: new Date(RESET_TIME).toISOString(),
			remaining: 3,
		});
		expect(Object.keys(body).sort()).toEqual(['code', 'error', 'remaining', 'resetTime']);
	});

	it('emits an ISO-8601 resetTime that parses back to the source instant', async () => {
		const body = await rateLimited({ resetTime: RESET_TIME, remaining: 0 }).json();
		expect(body.resetTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
		expect(Date.parse(body.resetTime)).toBe(RESET_TIME);
	});

	it('preserves a zero remaining count instead of dropping it', async () => {
		const body = await rateLimited({ resetTime: RESET_TIME, remaining: 0 }).json();
		expect('remaining' in body).toBe(true);
		expect(body.remaining).toBe(0);
	});
});
