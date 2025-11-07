import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { rateLimiter } from '../utils/rateLimiter';
import { generatePrompt } from '../utils/prompt';
import * as z from 'zod';

export async function POST(request) {
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

		const rateLimit = await rateLimiter(request);
		if (rateLimit.limited) {
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
		const validTestTypes = ['multiple-choice', 'true-false', 'coding', 'mixed'];
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
		});

		const paperSchema = z.object({
			topic: z.string().describe('The topic of the test'),
			questions: z
				.array(questionSchema)
				.describe('An array of questions in the test'),
		});

		const response = await ai.models.generateContent({
			model: 'gemini-flash-latest',
			contents: prompt,
			config: {
				responseMimeType: 'application/json',
				responseJsonSchema: z.toJSONSchema(paperSchema),
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
				if (testType === 'multiple-choice' && q.options.length !== 4) {
					throw new Error(`Question ${index + 1} must have exactly 4 options`);
				}

				if (
					testType === 'true-false' &&
					(!q.options.includes('True') || !q.options.includes('False'))
				) {
					throw new Error(`Question ${index + 1} must have True/False options`);
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
			// Store the test in the database
			const storeResponse = await fetch(
				`${request.headers.get('origin')}/api/test`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ test: questionPaper }),
				},
			);

			if (!storeResponse.ok) {
				throw new Error('Failed to store test in database');
			}

			const { id: testId } = await storeResponse.json();

			// Return the question paper with the database ID
			return NextResponse.json({
				...questionPaper,
				id: testId,
			});
		} catch (parseError) {
			console.error('Failed to parse or validate response:', parseError);
			console.error('Raw response:', response.text);
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
		return NextResponse.json(
			{ error: 'An unexpected error occurred' },
			{ status: 500 },
		);
	}
}
