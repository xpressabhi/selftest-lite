import { json } from '@sveltejs/kit';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import { DEFAULT_RATE_LIMIT, rateLimiter } from '$lib/server/rateLimiter';
import { generateExplanationPrompt } from '$lib/server/prompt';
import { getClientKey, logApiEvent } from '$lib/server/storage';
import { parseRequestBody } from '$lib/server/quizValidation';
import {
	MAX_ANSWER_TEXT_LENGTH,
	MAX_QUESTION_TEXT_LENGTH,
	MAX_TOPIC_LENGTH,
	VALID_LANGUAGES,
} from '$lib/server/quizConfig';
import {
	API_LIMIT_ERROR_CODE,
	API_TIMEOUT_ERROR_CODE,
	isApiLimitExceededError,
	isApiTimeoutError,
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

export async function POST({ request }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);

	try {
		// Check rate limit
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
				},
			);
		}

		const { topic, question, answer, language } = await parseRequestBody(request);
		const apiKey = env.GEMINI_API_KEY;

		if (!topic || !question || !answer) {
			return json(
				{
					error: 'Topic, question, and answer are required',
					code: 'EXPLAIN_FIELDS_REQUIRED',
				},
				{ status: 400 },
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
				{ status: 400 },
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
				{ status: 400 },
			);
		}

		if (!apiKey) {
			return json(
				{ error: 'Gemini API key is not configured' },
				{ status: 500 },
			);
		}

		const ai = new GoogleGenAI({ apiKey });

		const prompt = generateExplanationPrompt({
			topic,
			question,
			answer,
			language,
		});

		let timeoutHandle;
		const response = await Promise.race([
			ai.models.generateContent({
				model: EXPLANATION_MODEL,
				contents: prompt,
				config: { responseMimeType: 'application/json' },
			}),
			new Promise((_, reject) => {
				timeoutHandle = setTimeout(() => {
					reject(new ExplanationTimeoutError());
				}, EXPLANATION_TIMEOUT_MS);
			}),
		]).finally(() => {
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
		});
		const parsed = JSON.parse(response.text.trim());
		if (!parsed?.explanation || typeof parsed.explanation !== 'string') {
			throw new Error('Invalid explanation response from model');
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
				language: language || 'english',
			},
		});

		return json(parsed);
	} catch (error) {
		console.error(error);
		if (error?.code === 'REQUEST_TOO_LARGE') {
			return json(
				{ error: 'Request is too large', code: 'REQUEST_TOO_LARGE' },
				{ status: 413 },
			);
		}
		if (error?.code === 'INVALID_REQUEST_BODY') {
			return json(
				{ error: 'Request body must be valid JSON', code: 'INVALID_REQUEST_BODY' },
				{ status: 400 },
			);
		}
		const isLimitError = isApiLimitExceededError(error);
		const isTimeoutError = isApiTimeoutError(error);
		const statusCode = isLimitError ? 429 : isTimeoutError ? 408 : 500;
		const errorMessage = isLimitError
			? 'API limit exceeded. Please retry manually after some time.'
			: isTimeoutError
				? 'Explanation timed out. Please retry.'
				: 'An unexpected error occurred';

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
				error: errorMessage,
				code: isLimitError
					? API_LIMIT_ERROR_CODE
					: isTimeoutError
						? 'EXPLANATION_TIMEOUT'
						: 'EXPLANATION_FAILED',
			},
			{ status: statusCode },
		);
	}
}
