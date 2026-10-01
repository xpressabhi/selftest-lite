import { describe, expect, it } from 'vitest';
import {
	CLIENT_GENERATION_TIMEOUT_MS,
	CLIENT_TIMEOUT_SLACK_MS,
	GENERATION_BUDGET_MS,
	MAX_GENERATION_ATTEMPTS,
	SERVER_GENERATION_TIMEOUT_MS,
	GENERATION_OUTCOMES,
	createTerminalEventGuard,
	isRetryableGenerationStatus,
	nextAttemptAllowed,
} from './generationBudget.js';

describe('generation retry budget', () => {
	it('lets the client outlast the server deadline', () => {
		// Otherwise the abort races the server's own 408 and the user sees a
		// bare client timeout instead of the reason the request failed.
		expect(CLIENT_GENERATION_TIMEOUT_MS).toBeGreaterThan(SERVER_GENERATION_TIMEOUT_MS);
		expect(CLIENT_TIMEOUT_SLACK_MS).toBeGreaterThan(0);
	});

	it('keeps the worst case bounded', () => {
		// Three full client timeouts was nine minutes of spinner.
		expect(MAX_GENERATION_ATTEMPTS * CLIENT_GENERATION_TIMEOUT_MS).toBeGreaterThan(
			GENERATION_BUDGET_MS
		);
		expect(GENERATION_BUDGET_MS).toBeLessThanOrEqual(5 * 60 * 1000);
	});
});

describe('nextAttemptAllowed', () => {
	const base = { maxAttempts: 3, budgetMs: 300000 };

	it('always allows the first attempt, however long it took to get here', () => {
		expect(nextAttemptAllowed({ ...base, attempt: 1, elapsedMs: 999999 })).toEqual({
			allowed: true,
			reason: null,
		});
	});

	it('stops on attempts and says so', () => {
		expect(nextAttemptAllowed({ ...base, attempt: 3, elapsedMs: 0 })).toEqual({
			allowed: false,
			reason: 'attempts',
		});
	});

	it('stops on budget and says so, before the attempts run out', () => {
		expect(nextAttemptAllowed({ ...base, attempt: 2, elapsedMs: 300000 })).toEqual({
			allowed: false,
			reason: 'budget',
		});
	});

	it('allows a retry that still has room', () => {
		expect(nextAttemptAllowed({ ...base, attempt: 2, elapsedMs: 120000 })).toEqual({
			allowed: true,
			reason: null,
		});
	});
});

describe('createTerminalEventGuard', () => {
	it('grants the claim once and refuses every later outcome', () => {
		const guard = createTerminalEventGuard();
		expect(guard.claim('fail')).toBe(true);
		// The page can still tear down mid-generation; that must not double-count.
		expect(guard.claim('fail')).toBe(false);
		expect(guard.claim('cancel')).toBe(false);
		expect(guard.claim('success')).toBe(false);

		expect(guard.pending()).toBe(false);
		expect(guard.outcome).toBe('fail');
	});

	it('leaves the generation open when nothing terminal has happened', () => {
		const guard = createTerminalEventGuard();
		expect(guard.pending()).toBe(true);
		expect(guard.claim('fail')).toBe(true);
		expect(guard.outcome).toBe('fail');
	});

	it('claims each outcome once', () => {
		for (const outcome of GENERATION_OUTCOMES) {
			const guard = createTerminalEventGuard();
			expect(guard.claim(outcome)).toBe(true);
		}
	});

	it('refuses an unknown outcome and stays open', () => {
		const guard = createTerminalEventGuard();
		expect(guard.claim('exploded')).toBe(false);
		expect(guard.pending()).toBe(true);
		// The generation is still open, so a real outcome can still land.
		expect(guard.claim('success')).toBe(true);
	});

	it('reopens for the next generation on reset', () => {
		const guard = createTerminalEventGuard();
		expect(guard.claim('fail')).toBe(true);
		guard.reset();
		expect(guard.pending()).toBe(true);
		expect(guard.outcome).toBeNull();
		expect(guard.claim('success')).toBe(true);
	});
});

describe('isRetryableGenerationStatus', () => {
	it('retries transient provider and rate-limit failures', () => {
		expect(isRetryableGenerationStatus(429)).toBe(true);
		expect(isRetryableGenerationStatus(500)).toBe(true);
		expect(isRetryableGenerationStatus(503)).toBe(true);
		// A network-level failure with no status.
		expect(isRetryableGenerationStatus(0)).toBe(true);
	});

	it('does not retry a server timeout: the server already spent its budget', () => {
		expect(isRetryableGenerationStatus(408)).toBe(false);
	});

	it('does not retry a request the server will reject identically', () => {
		expect(isRetryableGenerationStatus(400)).toBe(false);
		expect(isRetryableGenerationStatus(403)).toBe(false);
		expect(isRetryableGenerationStatus(413)).toBe(false);
	});
});
