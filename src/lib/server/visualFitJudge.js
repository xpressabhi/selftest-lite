// Orchestrates one visual-fit judgment: cache first, TypeSafe Jev second.
//
// The pure engine (visualFit.js) builds the question and reads the answer; the
// cache (visualFitCache.js) stores verdicts by content address. This module
// joins them behind one injectable call so the /api/visual-fit route and the
// playground generation gate share the same behavior and the same fail-open
// contract.
//
// Fail-open is the load-bearing rule: any judge failure (no client, upstream
// error, timeout, malformed output) yields a degraded verdict that suggests
// the visual and is NEVER persisted. A storage outage must never block a
// judgment either: a failed cache read is logged and the judge runs anyway.
//
// `client` is a TypeSafe client or null; `cache` defaults to the real cache
// module functions so callers only inject fakes in tests.

import {
	VISUAL_FIT_MIN_PROBABILITY,
	VISUAL_FIT_MODEL,
	VISUAL_FIT_TIMEOUT_MS,
	buildVisualFitQuestions,
	deriveVisualFit,
} from './visualFit.js';
import {
	buildVisualFitCacheKey,
	getCachedVisualFit,
	saveVisualFit,
	touchVisualFit,
} from './visualFitCache.js';

const DEFAULT_CACHE = { getCachedVisualFit, saveVisualFit, touchVisualFit };

/** The one shape every failure returns: suggest the visual, persist nothing. */
function degradedVerdict() {
	return {
		suggested: true,
		category: 'unknown',
		confidence: null,
		cached: false,
		degraded: true,
	};
}

// Module-local on purpose (R3): mirrors the helper in
// src/routes/api/personalize/+server.js rather than extracting a shared
// utility for two call sites with different error messages.
function withTimeout(promise, timeoutMs) {
	let timeoutId;
	const timeout = new Promise((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error('Visual-fit judgment timed out')), timeoutMs);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

/**
 * Judges whether an animated visual explanation would help with this content.
 *
 * @param {object} args
 * @param {string} args.topic
 * @param {string} [args.question]
 * @param {string} [args.answer]
 * @param {string} [args.language]
 * @param {object|null} args.client  System One client, or null when unconfigured.
 * @param {object} [args.cache]      Cache functions; injectable for tests.
 * @returns {Promise<{ suggested: boolean, category: string, confidence: number|null,
 *                     cached: boolean, degraded: boolean }>}
 */
export async function judgeVisualFit({
	topic,
	question,
	answer,
	language = 'english',
	client,
	cache = DEFAULT_CACHE,
}) {
	try {
		const cacheKey = buildVisualFitCacheKey({ topic, question, answer, language });

		let cached = null;
		try {
			cached = await cache.getCachedVisualFit(cacheKey);
		} catch (error) {
			// Storage must never block judgment: log and judge instead.
			console.error('Visual-fit cache read failed:', error?.message);
		}

		if (cached) {
			try {
				await cache.touchVisualFit(cacheKey);
			} catch (error) {
				// A hit only becomes slightly less inspectable; not worth failing.
				console.error('Visual-fit cache touch failed:', error?.message);
			}
			return {
				suggested:
					cached.category === 'worth_it' &&
					cached.confidence >= VISUAL_FIT_MIN_PROBABILITY,
				category: cached.category,
				confidence: cached.confidence,
				cached: true,
				degraded: false,
			};
		}

		if (!client) {
			return degradedVerdict();
		}

		const aiResponse = await withTimeout(
			client.systemOne({
				state: { topic, question, answer },
				questions: buildVisualFitQuestions({ topic, question, answer }),
				model: VISUAL_FIT_MODEL,
			}),
			VISUAL_FIT_TIMEOUT_MS
		);

		const verdict = deriveVisualFit(aiResponse?.answers);
		if (verdict.category === 'unknown') {
			// No usable verdict: fail open and leave the cache untouched, so a
			// later request re-judges instead of pinning the failure.
			return degradedVerdict();
		}

		try {
			await cache.saveVisualFit({
				cacheKey,
				language,
				category: verdict.category,
				confidence: verdict.confidence,
				model: VISUAL_FIT_MODEL,
			});
		} catch (error) {
			// A lost write costs one repeat judgment; it must not cost the verdict.
			console.error('Visual-fit cache write failed:', error?.message);
		}

		return {
			suggested: verdict.suggested,
			category: verdict.category,
			confidence: verdict.confidence,
			cached: false,
			degraded: false,
		};
	} catch (error) {
		console.error('Visual-fit judgment failed (fail-open):', error?.message);
		return degradedVerdict();
	}
}
