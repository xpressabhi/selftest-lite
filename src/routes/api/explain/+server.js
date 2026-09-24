import { json } from '@sveltejs/kit';
import { GoogleGenAI } from '@google/genai';
import * as z from 'zod';
import { env } from '$env/dynamic/private';
import { DEFAULT_RATE_LIMIT, rateLimiter } from '$lib/server/rateLimiter';
import { generateExplanationPrompt } from '$lib/server/prompt';
import { getClientKey, logApiEvent } from '$lib/server/storage';
import {
	buildExplanationCacheKey,
	getCachedExplanation,
	saveExplanation,
	touchExplanation,
} from '$lib/server/explanationCache';
import { parseRequestBody } from '$lib/server/quizValidation';
import { explanationSchema } from '$lib/server/quizSchema';
import { parseJsonResponse } from '$lib/server/jsonResponse';
import {
	MAX_ANSWER_TEXT_LENGTH,
	MAX_QUESTION_TEXT_LENGTH,
	MAX_TOPIC_LENGTH,
	VALID_LANGUAGES,
} from '$lib/server/quizConfig';
import {
	API_LIMIT_ERROR_CODE,
	API_TIMEOUT_ERROR_CODE,
	classifyApiError,
} from '$lib/shared/apiLimitError';

const EXPLANATION_MODEL = 'gemini-flash-lite-latest';
const EXPLANATION_TIMEOUT_MS = 45000;

class ExplanationTimeoutError extends Error {
	constructor() {
		super('Explanation timed out after 45 seconds. Please retry.');
		this.name = 'ExplanationTimeoutError';
		this.code = API_TIMEOUT_ERROR_CODE;
	}
}

async function requestExplanationText(ai, prompt, deadlineMs) {
	const remainingMs = deadlineMs - Date.now();
	if (remainingMs <= 0) {
		throw new ExplanationTimeoutError();
	}
	let timeoutHandle;
	try {
		const response = await Promise.race([
			ai.models.generateContent({
				model: EXPLANATION_MODEL,
				contents: prompt,
				config: {
					responseMimeType: 'application/json',
					responseJsonSchema: z.toJSONSchema(explanationSchema),
				},
			}),
			new Promise((_, reject) => {
				timeoutHandle = setTimeout(() => {
					reject(new ExplanationTimeoutError());
				}, remainingMs);
			}),
		]);
		return response.text;
	} finally {
		if (timeoutHandle) {
			clearTimeout(timeoutHandle);
		}
	}
}

export async function POST({ request }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);

	try {
		const { topic, question, answer, language } = await parseRequestBody(request);

		if (!topic || !question || !answer) {
			return json(
				{
					error: 'Topic, question, and answer are required',
					code: 'EXPLAIN_FIELDS_REQUIRED',
				},
				{ status: 400 }
			);
		}

		if (
			String(topic).length > MAX_TOPIC_LENGTH ||
			String(question).length > MAX_QUESTION_TEXT_LENGTH ||
			String(answer).length > MAX_ANSWER_TEXT_LENGTH
		) {
			return json(
				{
					error: 'The question or answer is too long',
					code: 'EXPLAIN_FIELDS_TOO_LONG',
				},
				{ status: 400 }
			);
		}

		if (
			language &&
			typeof language === 'string' &&
			!VALID_LANGUAGES.includes(language.toLowerCase())
		) {
			return json(
				{
					error: 'Invalid language selection',
					code: 'INVALID_LANGUAGE',
				},
				{ status: 400 }
			);
		}

		const effectiveLanguage =
			typeof language === 'string' && VALID_LANGUAGES.includes(language.toLowerCase())
				? language.toLowerCase()
				: 'english';
		const cacheKey = buildExplanationCacheKey({ question, answer, language: effectiveLanguage });

		// Cache hits are served before the rate limiter: they only cost a hash
		// and an indexed read, so repeat explanations stay instant and free.
		let cached = null;
		try {
			cached = await getCachedExplanation(cacheKey);
		} catch (error) {
			// A cache read failure must never block generation.
			console.error('Explanation cache read failed', error);
		}

		if (cached) {
			try {
				await touchExplanation(cacheKey);
			} catch (error) {
				console.error('Explanation cache touch failed', error);
			}
			await logApiEvent({
				route: '/api/explain',
				action: 'explain_answer',
				clientKey,
				request,
				statusCode: 200,
				durationMs: Date.now() - startedAt,
				metadata: {
					topic,
					language: effectiveLanguage,
					explanationCached: true,
				},
			});
			return json({ ...cached.explanation, cached: true });
		}

		// Only generation requests consume rate-limit quota.
		const rateLimit = await rateLimiter(request, { bucket: '/api/explain' });
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/explain',
				action: 'explain_answer',
				clientKey,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
			});

			return json(
				{
					error: 'Rate limit exceeded. Please try again later.',
					code: API_LIMIT_ERROR_CODE,
					resetTime: new Date(rateLimit.resetTime).toISOString(),
					remaining: rateLimit.remaining,
				},
				{
					status: 429,
					headers: {
						'X-RateLimit-Limit': String(DEFAULT_RATE_LIMIT),
						'X-RateLimit-Remaining': rateLimit.remaining.toString(),
						'X-RateLimit-Reset': rateLimit.resetTime.toString(),
					},
				}
			);
		}

		const apiKey = env.GEMINI_API_KEY;

		if (!apiKey) {
			return json({ error: 'Gemini API key is not configured' }, { status: 500 });
		}

		const ai = new GoogleGenAI({ apiKey });

		const prompt = generateExplanationPrompt({
			topic,
			question,
			answer,
			language: effectiveLanguage,
		});

		const deadlineMs = startedAt + EXPLANATION_TIMEOUT_MS;
		let parsed = null;
		let lastError = null;

		// One retry covers the rare case where the model still emits malformed
		// JSON despite the response schema (these used to surface as 500s).
		for (let attempt = 1; attempt <= 2; attempt += 1) {
			try {
				const text = await requestExplanationText(ai, prompt, deadlineMs);
				const validated = explanationSchema.safeParse(parseJsonResponse(text));
				if (validated.success) {
					parsed = validated.data;
					break;
				}
				lastError = new Error('Invalid explanation response from model');
			} catch (error) {
				lastError = error;
				if (error instanceof ExplanationTimeoutError) {
					throw error;
				}
			}
		}

		if (!parsed) {
			throw lastError || new Error('Invalid explanation response from model');
		}

		try {
			await saveExplanation({
				cacheKey,
				language: effectiveLanguage,
				explanation: parsed,
				model: EXPLANATION_MODEL,
			});
		} catch (error) {
			// Storage must never fail a good explanation; the next request
			// regenerates and tries to save again.
			console.error('Explanation cache save failed', error);
		}

		await logApiEvent({
			route: '/api/explain',
			action: 'explain_answer',
			clientKey,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			metadata: {
				topic,
				language: effectiveLanguage,
				explanationCached: false,
			},
		});

		return json({ ...parsed, cached: false });
	} catch (error) {
		console.error(error);
		if (error?.code === 'REQUEST_TOO_LARGE') {
			return json(
				{ error: 'Request is too large', code: 'REQUEST_TOO_LARGE' },
				{ status: 413 }
			);
		}
		if (error?.code === 'INVALID_REQUEST_BODY') {
			return json(
				{ error: 'Request body must be valid JSON', code: 'INVALID_REQUEST_BODY' },
				{ status: 400 }
			);
		}
		const { statusCode, code, message } = classifyApiError(error, {
			fallbackCode: 'EXPLANATION_FAILED',
			timeoutMessage: 'Explanation timed out. Please retry.',
		});

		await logApiEvent({
			route: '/api/explain',
			action: 'explain_answer',
			clientKey,
			request,
			statusCode,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});

		return json(
			{
				error: message,
				code,
			},
			{ status: statusCode }
		);
	}
}
