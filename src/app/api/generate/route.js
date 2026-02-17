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
import {
	API_LIMIT_ERROR_CODE,
	isApiLimitExceededError,
	API_TIMEOUT_ERROR_CODE,
	isApiTimeoutError,
} from '../../utils/apiLimitError';

const MODEL_NAME = 'gemini-3-flash-preview';
const BATCH_SIZE = 25;
const GENERATION_TIMEOUT_MS = 180000;

class GenerationTimeoutError extends Error {
	constructor() {
		super('Generation timed out after 180 seconds. Please retry.');
		this.name = 'GenerationTimeoutError';
		this.code = API_TIMEOUT_ERROR_CODE;
	}
}

function getRemainingTimeMs(deadlineMs) {
	return deadlineMs - Date.now();
}

function assertWithinDeadline(deadlineMs) {
	if (getRemainingTimeMs(deadlineMs) <= 0) {
		throw new GenerationTimeoutError();
	}
}

function sanitizeQuestion(question) {
	return {
		question: question.question,
		options: question.options,
		answer: question.answer,
	};
}

async function generateQuestionBatch({
	ai,
	topic,
	numQuestions,
	difficulty,
	testType,
	topicContext,
	examName,
	syllabusFocus,
	previousQuestions,
	language,
	testMode,
	objectiveOnly,
	deadlineMs,
}) {
	assertWithinDeadline(deadlineMs);

	const prompt = generatePrompt({
		topic,
		numQuestions,
		difficulty,
		testType,
		topicContext,
		examName,
		syllabusFocus,
		previousQuestions,
		language,
		testMode,
		objectiveOnly,
	});

	const remainingTimeMs = getRemainingTimeMs(deadlineMs);
	if (remainingTimeMs <= 0) {
		throw new GenerationTimeoutError();
	}

	let timeoutHandle;
	try {
		const response = await Promise.race([
			ai.models.generateContent({
				model: MODEL_NAME,
				contents: prompt,
				config: {
					responseMimeType: 'application/json',
					responseJsonSchema: z.toJSONSchema(paperSchema),
					thinkingConfig: {
						thinkingLevel: 'minimal',
					},
				},
			}),
			new Promise((_, reject) => {
				timeoutHandle = setTimeout(() => {
					reject(new GenerationTimeoutError());
				}, remainingTimeMs);
			}),
		]);

		const cleanedText = response.text.trim();
		return JSON.parse(cleanedText);
	} finally {
		if (timeoutHandle) {
			clearTimeout(timeoutHandle);
		}
	}
}

async function generatePaper({
	ai,
	resolvedTopic,
	numQuestions,
	difficulty,
	testType,
	topicContext,
	examName,
	syllabusFocus,
	previousQuestions,
	language,
	testMode,
	objectiveOnly,
	deadlineMs,
}) {
	const totalBatches = Math.ceil(numQuestions / BATCH_SIZE);
	const generatedQuestions = [];
	let resolvedPaperTopic = resolvedTopic;

	for (let index = 0; index < totalBatches; index += 1) {
		assertWithinDeadline(deadlineMs);

		const batchQuestions = Math.min(
			BATCH_SIZE,
			numQuestions - generatedQuestions.length,
		);
		const batchContext = [
			topicContext,
			totalBatches > 1
				? `Batch ${index + 1} of ${totalBatches}: Generate exactly ${batchQuestions} new questions and avoid overlap with earlier batches.`
				: null,
		]
			.filter(Boolean)
			.join('\n');
		const cumulativePrevious = [
			...previousQuestions,
			...generatedQuestions.map((question) => ({
				question: question.question,
				answer: question.answer,
			})),
		];

		const batchPaper = await generateQuestionBatch({
			ai,
			topic: resolvedTopic,
			numQuestions: batchQuestions,
			difficulty,
			testType,
			topicContext: batchContext,
			examName,
			syllabusFocus,
			previousQuestions: cumulativePrevious,
			language,
			testMode,
			objectiveOnly,
			deadlineMs,
		});

		validateGeneratedPaper({
			questionPaper: batchPaper,
			testType,
			numQuestions: batchQuestions,
		});
		if (!resolvedPaperTopic && batchPaper.topic) {
			resolvedPaperTopic = batchPaper.topic;
		}
		generatedQuestions.push(...batchPaper.questions.map(sanitizeQuestion));
	}

	if (generatedQuestions.length !== numQuestions) {
		throw new Error(
			`Expected ${numQuestions} questions but generated ${generatedQuestions.length}`,
		);
	}

	return {
		topic: resolvedPaperTopic || resolvedTopic || 'Generated Test',
		questions: generatedQuestions,
	};
}

export async function POST(request) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);

	try {
		const {
			topic,
			category,
			selectedTopics = [],
			testMode = 'quiz-practice',
			examId = null,
			examName = null,
			examStream = null,
			syllabusFocus = [],
			previousTests = [],
			testType = 'multiple-choice',
			numQuestions = 10,
			difficulty = 'intermediate',
			language = 'english',
			objectiveOnly = false,
			durationMinutes = null,
		} = await request.json();

		const validationError = validateGenerateRequest({
			topic,
			selectedTopics,
			syllabusFocus,
			testMode,
			examName,
			objectiveOnly,
			language,
			testType,
			numQuestions,
			difficulty,
		});
		if (validationError) {
			return NextResponse.json({ error: validationError }, { status: 400 });
		}

		const resolvedTopic =
			topic || (examName ? `${examName} mock paper` : '');

		const rateLimit = await rateLimiter(request, { bucket: '/api/generate' });
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/generate',
				action: 'generate_quiz',
				clientKey,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
				metadata: {
					topic: resolvedTopic || null,
					testMode,
					examName,
					testType,
					numQuestions,
					difficulty,
					language,
				},
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

		const topicContext = [
			testMode === 'full-exam'
				? 'Full-length exam mode enabled. Generate objective-style questions.'
				: 'Quiz practice mode enabled.',
			examName ? `Indian exam paper mode: ${examName}` : null,
			examStream ? `Exam stream: ${examStream}` : null,
			category ? `Category: ${category}` : null,
			syllabusFocus.length > 0
				? `Selected syllabus focus: ${syllabusFocus.join(', ')}`
				: null,
			selectedTopics.length > 0
				? `Selected topics: ${selectedTopics.join(', ')}`
				: null,
			resolvedTopic ? `Additional context: ${resolvedTopic}` : null,
		]
			.filter(Boolean)
			.join('\n');

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
		let questionPaper;

		try {
			questionPaper = await generatePaper({
				ai,
				resolvedTopic,
				numQuestions,
				difficulty,
				testType,
				topicContext,
				examName,
				syllabusFocus,
				previousQuestions,
				language,
				testMode,
				objectiveOnly,
				deadlineMs: startedAt + GENERATION_TIMEOUT_MS,
			});

			const storedPaper = {
				...questionPaper,
				requestParams: {
					topic: resolvedTopic,
					testMode,
					examId,
					examName,
					examStream,
					category: category || null,
					selectedTopics,
					syllabusFocus,
					testType,
					numQuestions,
					difficulty,
					language,
					objectiveOnly,
					durationMinutes,
				},
			};

			const testId = await createTestRecord(storedPaper, {
				topic: resolvedTopic,
				examName,
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
					testMode,
					examName,
					testType,
					numQuestions,
					difficulty,
					language,
					questionCount: questionPaper.questions.length,
					testId,
				},
			});

			return NextResponse.json({
				...storedPaper,
				id: testId,
			});
		} catch (parseError) {
			console.error('Failed to parse or validate response:', parseError);
			const isLimitError = isApiLimitExceededError(parseError);
			const isTimeoutError = isApiTimeoutError(parseError);
			const statusCode = isLimitError ? 429 : isTimeoutError ? 408 : 500;
			const errorCode = isLimitError
				? API_LIMIT_ERROR_CODE
				: isTimeoutError
					? API_TIMEOUT_ERROR_CODE
					: 'GENERATION_FAILED';
			const errorMessage = isLimitError
				? 'API limit exceeded. Please retry manually after some time.'
				: isTimeoutError
					? 'Generation timed out after 180 seconds. Please retry.'
					: 'Failed to generate valid quiz questions. Please try again.';

			await logApiEvent({
				route: '/api/generate',
				action: 'generate_quiz',
				clientKey,
				statusCode,
				durationMs: Date.now() - startedAt,
				errorMessage: parseError.message,
				metadata: {
					topic: resolvedTopic || null,
					testMode,
					examName,
					testType,
					numQuestions,
					difficulty,
					language,
				},
			});

			return NextResponse.json(
				{
					error: errorMessage,
					code: errorCode,
					details: parseError.message,
				},
				{ status: statusCode },
			);
		}
	} catch (error) {
		console.error(error);
		const isLimitError = isApiLimitExceededError(error);
		const isTimeoutError = isApiTimeoutError(error);
		const statusCode = isLimitError ? 429 : isTimeoutError ? 408 : 500;
		const errorCode = isLimitError
			? API_LIMIT_ERROR_CODE
			: isTimeoutError
				? API_TIMEOUT_ERROR_CODE
				: 'GENERATION_UNEXPECTED';
		const errorMessage = isLimitError
			? 'API limit exceeded. Please retry manually after some time.'
			: isTimeoutError
				? 'Generation timed out after 180 seconds. Please retry.'
				: 'An unexpected error occurred';

		await logApiEvent({
			route: '/api/generate',
			action: 'generate_quiz',
			clientKey,
			statusCode,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});

		return NextResponse.json(
			{
				error: errorMessage,
				code: errorCode,
			},
			{ status: statusCode },
		);
	}
}
