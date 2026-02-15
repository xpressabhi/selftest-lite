import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { rateLimiter } from '../utils/rateLimiter';
import { generateExplanationPrompt } from '../utils/prompt';
import { getClientKey, logApiEvent } from '../utils/storage';

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

		const response = await ai.models.generateContent({
			model: 'gemini-3-flash-preview',
			contents: prompt,
			config: { responseMimeType: 'application/json' },
		});
		const questionPaper = JSON.parse(response.text);

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

		return NextResponse.json(questionPaper);
	} catch (error) {
		console.error(error);

		await logApiEvent({
			route: '/api/explain',
			action: 'explain_answer',
			clientKey,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});

		return NextResponse.json(
			{ error: 'An unexpected error occurred' },
			{ status: 500 },
		);
	}
}
