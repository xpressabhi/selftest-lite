import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VISUAL_FIT_TIMEOUT_MS, buildVisualFitQuestions } from './visualFit.js';
import { judgeVisualFit } from './visualFitJudge.js';

// Every judge failure must land here, and nothing must be persisted.
const DEGRADED = {
	suggested: true,
	category: 'unknown',
	confidence: null,
	cached: false,
	degraded: true,
};

const CONTEXT = {
	topic: 'Projectile motion',
	question: 'Why is 45 degrees the optimal launch angle?',
	answer: 'It splits the launch speed evenly between the axes.',
	language: 'english',
};

/** A System One response the judge turns into a confident worth_it verdict. */
function worthItAnswers() {
	return {
		answers: {
			visual_fit: {
				type: 'choice',
				choice: 'worth_it',
				probabilities: { worth_it: 0.9, too_vague: 0.06, not_visual: 0.04 },
				confidence: 0.9,
			},
		},
	};
}

/** A System One response the judge turns into a confident not_visual verdict. */
function notVisualAnswers() {
	return {
		answers: {
			visual_fit: {
				type: 'choice',
				choice: 'not_visual',
				probabilities: { worth_it: 0.1, too_vague: 0.1, not_visual: 0.8 },
				confidence: 0.8,
			},
		},
	};
}

/** Fake verdict cache: no database, no network. */
function fakeCache(overrides = {}) {
	return {
		getCachedVisualFit: vi.fn(async () => null),
		saveVisualFit: vi.fn(async () => true),
		touchVisualFit: vi.fn(async () => {}),
		...overrides,
	};
}

describe('judgeVisualFit', () => {
	let consoleError;

	beforeEach(() => {
		consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('reuses a cached verdict, touches it, and never calls the client', async () => {
		const cache = fakeCache({
			getCachedVisualFit: vi.fn(async () => ({
				category: 'worth_it',
				confidence: 0.9,
				language: 'english',
				model: 'jev-latest',
			})),
		});
		const client = { systemOne: vi.fn() };

		expect(await judgeVisualFit({ ...CONTEXT, client, cache })).toEqual({
			suggested: true,
			category: 'worth_it',
			confidence: 0.9,
			cached: true,
			degraded: false,
		});
		expect(client.systemOne).not.toHaveBeenCalled();
		expect(cache.touchVisualFit).toHaveBeenCalledTimes(1);
		expect(cache.saveVisualFit).not.toHaveBeenCalled();
	});

	it('derives the cached suggestion from the stored category and confidence', async () => {
		const cache = fakeCache({
			getCachedVisualFit: vi.fn(async () => ({ category: 'worth_it', confidence: 0.5 })),
		});
		const client = { systemOne: vi.fn() };

		expect(await judgeVisualFit({ ...CONTEXT, client, cache })).toEqual({
			suggested: false,
			category: 'worth_it',
			confidence: 0.5,
			cached: true,
			degraded: false,
		});
		expect(client.systemOne).not.toHaveBeenCalled();
	});

	it('judges a cache miss and saves the fresh verdict', async () => {
		const cache = fakeCache();
		const client = { systemOne: vi.fn(async () => worthItAnswers()) };

		expect(await judgeVisualFit({ ...CONTEXT, client, cache })).toEqual({
			suggested: true,
			category: 'worth_it',
			confidence: 0.9,
			cached: false,
			degraded: false,
		});

		expect(client.systemOne).toHaveBeenCalledTimes(1);
		expect(client.systemOne).toHaveBeenCalledWith({
			state: {
				topic: CONTEXT.topic,
				question: CONTEXT.question,
				answer: CONTEXT.answer,
			},
			questions: buildVisualFitQuestions({
				topic: CONTEXT.topic,
				question: CONTEXT.question,
				answer: CONTEXT.answer,
			}),
			model: 'jev-latest',
		});

		expect(cache.saveVisualFit).toHaveBeenCalledTimes(1);
		expect(cache.saveVisualFit).toHaveBeenCalledWith(
			expect.objectContaining({ category: 'worth_it', cacheKey: expect.any(String) })
		);
		expect(cache.touchVisualFit).not.toHaveBeenCalled();
	});

	it('fails open in the exact degraded shape when the judge rejects', async () => {
		const cache = fakeCache();
		const client = {
			systemOne: vi.fn(async () => {
				throw new Error('judge unavailable');
			}),
		};

		expect(await judgeVisualFit({ ...CONTEXT, client, cache })).toEqual(DEGRADED);
		expect(client.systemOne).toHaveBeenCalledTimes(1);
		expect(cache.saveVisualFit).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalled();
	});

	it('fails open without a client and never saves', async () => {
		const cache = fakeCache();

		expect(await judgeVisualFit({ ...CONTEXT, client: null, cache })).toEqual(DEGRADED);
		expect(cache.getCachedVisualFit).toHaveBeenCalledTimes(1);
		expect(cache.saveVisualFit).not.toHaveBeenCalled();
	});

	it('fails open on malformed judge output and never saves', async () => {
		const cache = fakeCache();
		const client = { systemOne: vi.fn(async () => ({ answers: {} })) };

		expect(await judgeVisualFit({ ...CONTEXT, client, cache })).toEqual(DEGRADED);
		expect(client.systemOne).toHaveBeenCalledTimes(1);
		expect(cache.saveVisualFit).not.toHaveBeenCalled();
	});

	it('fails open when the judge never answers', async () => {
		vi.useFakeTimers();
		const cache = fakeCache();
		const client = { systemOne: vi.fn(() => new Promise(() => {})) };

		const pending = judgeVisualFit({ ...CONTEXT, client, cache });
		await vi.advanceTimersByTimeAsync(VISUAL_FIT_TIMEOUT_MS);

		expect(await pending).toEqual(DEGRADED);
		expect(client.systemOne).toHaveBeenCalledTimes(1);
		expect(cache.saveVisualFit).not.toHaveBeenCalled();
	});

	it('still judges when the cache read fails, logging the storage error', async () => {
		const cache = fakeCache({
			getCachedVisualFit: vi.fn(async () => {
				throw new Error('storage down');
			}),
		});
		const client = { systemOne: vi.fn(async () => notVisualAnswers()) };

		expect(await judgeVisualFit({ ...CONTEXT, client, cache })).toEqual({
			suggested: false,
			category: 'not_visual',
			confidence: 0.8,
			cached: false,
			degraded: false,
		});
		expect(client.systemOne).toHaveBeenCalledTimes(1);
		expect(cache.saveVisualFit).toHaveBeenCalledTimes(1);
		expect(consoleError).toHaveBeenCalled();
	});
});
