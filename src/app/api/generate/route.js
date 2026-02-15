import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { rateLimiter } from '../utils/rateLimiter';
import { generatePrompt } from '../utils/prompt';
import * as z from 'zod';
import { createTestRecord, getClientKey, logApiEvent } from '../utils/storage';

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

		if (!topic && selectedTopics.length === 0) {
			return NextResponse.json(
				{ error: 'Topic or selected topics are required' },
				{ status: 400 },
			);
		}

		// Validate language
		const validLanguages = ['english', 'hindi', 'spanish'];
		if (!validLanguages.includes(language.toLowerCase())) {
			return NextResponse.json(
				{ error: 'Invalid language selection' },
				{ status: 400 },
			);
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

		// Validate test type
		const validTestTypes = [
			'multiple-choice',
			'true-false',
			'coding',
			'mixed',
			'speed-challenge',
		];
		if (!validTestTypes.includes(testType)) {
			return NextResponse.json({ error: 'Invalid test type' }, { status: 400 });
		}

		// Validate number of questions
		if (numQuestions < 1 || numQuestions > 30) {
			return NextResponse.json(
				{ error: 'Number of questions must be between 1 and 30' },
				{ status: 400 },
			);
		}

		// Validate difficulty
		const validDifficulties = [
			'beginner',
			'intermediate',
			'advanced',
			'expert',
		];
		if (!validDifficulties.includes(difficulty)) {
			return NextResponse.json(
				{ error: 'Invalid difficulty level' },
				{ status: 400 },
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

		const questionSchema = z.object({
			question: z.string().describe('The question text with formatting'),
			options: z
				.array(z.string())
				.describe('The answer options for the question'),
			answer: z
				.string()
				.describe(
					'The correct answer to the question, Must match exactly one of the options',
				),
			explanation: z
				.string()
				.describe('The explanation for the answer in details with examples if needed.'),
		});

		const paperSchema = z.object({
			topic: z.string().describe('The topic of the test'),
			questions: z
				.array(questionSchema)
				.describe('An array of questions in the test'),
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

			// Validate the structure
			if (!questionPaper.topic || !Array.isArray(questionPaper.questions)) {
				throw new Error('Invalid response structure');
			}

			// Validate each question
			questionPaper.questions.forEach((q, index) => {
				if (!q.question || !Array.isArray(q.options) || !q.answer) {
					throw new Error(`Invalid question structure at index ${index}`);
				}

				// Validate options and answer
				if (
					(testType === 'multiple-choice' || testType === 'speed-challenge') &&
					q.options.length !== 4
				) {
					throw new Error(`Question ${index + 1} must have exactly 4 options`);
				}

				if (
					testType === 'true-false' &&
					(!Array.isArray(q.options) || q.options.length !== 2)
				) {
					throw new Error(
						`Question ${index + 1} must have exactly 2 options for true/false format`,
					);
				}

				if (!q.options.includes(q.answer)) {
					throw new Error(
						`Question ${index + 1} answer must match one of the options`,
					);
				}
			});

			// Validate number of questions
			if (questionPaper.questions.length !== numQuestions) {
				throw new Error(
					`Expected ${numQuestions} questions but got ${questionPaper.questions.length}`,
				);
			}
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
