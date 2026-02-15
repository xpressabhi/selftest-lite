import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { rateLimiter } from '../utils/rateLimiter';
import { generatePrompt } from '../utils/prompt';
import * as z from 'zod';
import { createTestRecord, getClientKey, logApiEvent } from '../utils/storage';
import { paperSchema } from '../utils/quizSchema';
import {
	validateGenerateRequest,
	validateGeneratedPaper,
} from '../utils/quizValidation';

export async function POST(request) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);

	try {
		const {
			topic,
			category,
			selectedTopics = [],
			previousTests = [],
			testType = 'multiple-choice',
			numQuestions = 10,
			difficulty = 'intermediate',
			language = 'english',
		} = await request.json();

		const validationError = validateGenerateRequest({
			topic,
			selectedTopics,
			language,
			testType,
			numQuestions,
			difficulty,
		});
		if (validationError) {
			return NextResponse.json({ error: validationError }, { status: 400 });
		}

		// Check rate limit

		const rateLimit = await rateLimiter(request, { bucket: '/api/generate' });
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/generate',
				action: 'generate_quiz',
				clientKey,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
				metadata: {
					topic: topic || null,
					testType,
					numQuestions,
					difficulty,
					language,
				},
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

		// Construct the topic context
		const topicContext = [
			category ? `Category: ${category}` : null,
			selectedTopics.length > 0
				? `Selected topics: ${selectedTopics.join(', ')}`
				: null,
			topic ? `Additional context: ${topic}` : null,
		]
			.filter(Boolean)
			.join('\n');

		// Extract all previous questions to help AI avoid duplicates
		const previousQuestions = previousTests.flatMap(
			(test) =>
				test.questions?.map((q) => ({
					question: q.question,
					answer: q.answer,
				})) || [],
		);
		const apiKey = process.env.GEMINI_API_KEY;
		if (!apiKey) {
			return NextResponse.json(
				{ error: 'Gemini API key is not configured' },
				{ status: 500 },
			);
		}

		const ai = new GoogleGenAI(apiKey);

		const prompt = generatePrompt({
			topic,
			numQuestions,
			difficulty,
			testType,
			topicContext,
			previousQuestions,
			language,
		});

		const response = await ai.models.generateContent({
			model: 'gemini-3-flash-preview',
			contents: prompt,
			config: {
				responseMimeType: 'application/json',
				responseJsonSchema: z.toJSONSchema(paperSchema),
				thinkingConfig: {
					thinkingLevel: 'minimal',
				}
			},
		});

		let questionPaper;
		try {
			// Try to parse the response as JSON
			const cleanedText = response.text.trim();
			questionPaper = JSON.parse(cleanedText);

			validateGeneratedPaper({ questionPaper, testType, numQuestions });
			const storedPaper = {
				...questionPaper,
				requestParams: {
					category: category || null,
					selectedTopics,
					testType,
					numQuestions,
					difficulty,
					language,
				},
			};

			const testId = await createTestRecord(storedPaper, {
				topic,
				testType,
				numQuestions,
				difficulty,
				language,
			});

			await logApiEvent({
				route: '/api/generate',
				action: 'generate_quiz',
				clientKey,
				statusCode: 200,
				durationMs: Date.now() - startedAt,
				metadata: {
					topic: questionPaper.topic,
					testType,
					numQuestions,
					difficulty,
					language,
					questionCount: questionPaper.questions.length,
					testId,
				},
			});

			// Return the question paper with the database ID
			return NextResponse.json({
				...storedPaper,
				id: testId,
			});
		} catch (parseError) {
			console.error('Failed to parse or validate response:', parseError);
			console.error('Raw response:', response.text);

			await logApiEvent({
				route: '/api/generate',
				action: 'generate_quiz',
				clientKey,
				statusCode: 500,
				durationMs: Date.now() - startedAt,
				errorMessage: parseError.message,
				metadata: {
					topic: topic || null,
					testType,
					numQuestions,
					difficulty,
					language,
				},
			});

			return NextResponse.json(
				{
					error: 'Failed to generate valid quiz questions. Please try again.',
					details: parseError.message,
				},
				{ status: 500 },
			);
		}
	} catch (error) {
		console.error(error);

		await logApiEvent({
			route: '/api/generate',
			action: 'generate_quiz',
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
