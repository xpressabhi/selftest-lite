import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { rateLimiter } from '../utils/rateLimiter';
import { generateExplanationPrompt } from '../utils/prompt';
import { getClientKey, logApiEvent } from '../utils/storage';
import {
	API_LIMIT_ERROR_CODE,
	API_TIMEOUT_ERROR_CODE,
	isApiLimitExceededError,
	isApiTimeoutError,
} from '../../utils/apiLimitError';

const EXPLANATION_MODEL = 'gemini-3.1-flash-lite-preview';
const EXPLANATION_TIMEOUT_MS = 45000;

class ExplanationTimeoutError extends Error {
	constructor() {
		super('Explanation timed out after 45 seconds. Please retry.');
		this.name = 'ExplanationTimeoutError';
		this.code = API_TIMEOUT_ERROR_CODE;
	}
}

export async function POST(request) {
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
				statusCode: 429,
				durationMs: Date.now() - startedAt,
			});

			return NextResponse.json(
				{
					error: 'Rate limit exceeded. Please try again later.',
					code: API_LIMIT_ERROR_CODE,
					resetTime: new Date(rateLimit.resetTime).toISOString(),
					remaining: rateLimit.remaining,
				},
				{
					status: 429,
					headers: {
						'X-RateLimit-Limit': '10',
						'X-RateLimit-Remaining': rateLimit.remaining.toString(),
						'X-RateLimit-Reset': rateLimit.resetTime.toString(),
					},
				},
			);
		}

		const { topic, question, answer, language } = await request.json();
		const apiKey = process.env.GEMINI_API_KEY;

		if (!topic || !question || !answer) {
			return NextResponse.json(
				{ error: 'Topic, question, and answer are required' },
				{ status: 400 },
			);
		}

		if (!apiKey) {
			return NextResponse.json(
				{ error: 'Gemini API key is not configured' },
				{ status: 500 },
			);
		}

		const ai = new GoogleGenAI(apiKey);

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
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			metadata: {
				topic,
				language: language || 'english',
			},
		});

		return NextResponse.json(parsed);
	} catch (error) {
		console.error(error);
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
			statusCode,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});

		return NextResponse.json(
			{
				error: errorMessage,
				code: isLimitError
					? API_LIMIT_ERROR_CODE
					: isTimeoutError
						? API_TIMEOUT_ERROR_CODE
						: 'EXPLANATION_FAILED',
			},
			{ status: statusCode },
		);
	}
}
