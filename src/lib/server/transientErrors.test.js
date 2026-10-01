import { describe, expect, it, vi } from 'vitest';
import { backoffBeforeRetry, isTransientProviderError } from './transientErrors.js';

describe('isTransientProviderError', () => {
	it('treats Gemini capacity spikes as retryable', () => {
		// The exact message that produced 20 hard 500s on /api/explain.
		expect(
			isTransientProviderError({ message: '{"error":{"code":503,"message":"unavailable"}}' })
		).toBe(true);
		expect(isTransientProviderError({ message: 'This model is currently experiencing high demand' })).toBe(
			true
		);
		expect(isTransientProviderError({ status: 429, message: 'Resource exhausted' })).toBe(true);
		expect(isTransientProviderError({ status: 503, message: '' })).toBe(true);
		expect(isTransientProviderError({ status: 500, message: 'Internal error' })).toBe(true);
	});

	it('does not retry a timeout: the deadline is already spent', () => {
		expect(isTransientProviderError({ status: 408, message: 'Request timeout' })).toBe(false);
		expect(isTransientProviderError({ message: 'Deadline exceeded' })).toBe(false);
		expect(isTransientProviderError({ message: 'The operation was aborted' })).toBe(false);
	});

	it('does not retry a permanent failure', () => {
		expect(isTransientProviderError({ status: 400, message: 'Invalid JSON payload' })).toBe(false);
		expect(isTransientProviderError(new Error('Invalid explanation response from model'))).toBe(false);
		expect(isTransientProviderError(null)).toBe(false);
		expect(isTransientProviderError({})).toBe(false);
	});
});

describe('backoffBeforeRetry', () => {
	it('waits a linearly growing delay', async () => {
		vi.useFakeTimers();
		try {
			const first = backoffBeforeRetry(1);
			await vi.advanceTimersByTimeAsync(750);
			expect(await first).toBe(true);

			const second = backoffBeforeRetry(2);
			await vi.advanceTimersByTimeAsync(1500);
			expect(await second).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('refuses to wait when it would overrun the deadline', async () => {
		// A retry that starts after the deadline only delays the error, so the
		// caller must surface the failure instead.
		expect(await backoffBeforeRetry(1, { deadlineMs: Date.now() + 100 })).toBe(false);
		expect(await backoffBeforeRetry(1, { deadlineMs: Date.now() - 1 })).toBe(false);
	});

	it('waits when there is room in the budget', async () => {
		expect(await backoffBeforeRetry(1, { deadlineMs: Date.now() + 30000 })).toBe(true);
	});
});
