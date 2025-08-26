import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { rateLimiter } from '../utils/rateLimiter';
import { generatePrompt } from '../utils/prompt';

const cache = new Map();

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
			id,
		} = await request.json();

		if (id && cache.has(id)) {
			console.log('Cache hit for id:', id);
			return NextResponse.json(cache.get(id));
		}
		if (!topic && selectedTopics.length === 0) {
			return NextResponse.json(
				{ error: 'Topic or selected topics are required' },
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
		});

		const response = await ai.models.generateContent({
			model: 'gemini-2.5-flash-lite',
			contents: prompt,
			config: { responseMimeType: 'application/json' },
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
			// Cache the result
			if (id) {
				cache.set(id, questionPaper);
			}
			return NextResponse.json(questionPaper);
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
