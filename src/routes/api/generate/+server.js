import { json } from '@sveltejs/kit';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import { rateLimiter } from '$lib/server/rateLimiter';
import { generatePrompt } from '$lib/server/prompt';
import * as z from 'zod';
import {
	createTestRecord,
	findReusableFullExamRecord,
	getClientKey,
	logApiEvent,
} from '$lib/server/storage';
import { paperSchema } from '$lib/server/quizSchema';
import { normalizeMathText } from '$lib/shared/latex';
import {
	validateGenerateRequest,
	repairGeneratedPaper,
	validateGeneratedPaper,
} from '$lib/server/quizValidation';
import {
	API_LIMIT_ERROR_CODE,
	isApiLimitExceededError,
	API_TIMEOUT_ERROR_CODE,
	isApiTimeoutError,
} from '$lib/shared/apiLimitError';

const MODEL_NAME = 'gemini-flash-lite-latest';
const BATCH_SIZE = 25;
const MAX_BATCH_VALIDATION_ATTEMPTS = 3;
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

function canonicalizeText(value) {
	return normalizeMathText(value).replace(/\s+/gu, ' ').trim();
}

function normalizeGeneratedPaper(questionPaper) {
	if (!questionPaper || !Array.isArray(questionPaper.questions)) {
		return questionPaper;
	}

	return {
		...questionPaper,
		topic: normalizeMathText(questionPaper.topic).trim(),
		questions: questionPaper.questions.map((question) => {
			if (!question || typeof question !== 'object') {
				return question;
			}

			const options = Array.isArray(question.options)
				? question.options.map((option) => normalizeMathText(option).trim())
				: question.options;
			const normalizedAnswer = normalizeMathText(question.answer).trim();
			const matchingOption = Array.isArray(options)
				? options.find(
						(option) =>
							canonicalizeText(option) === canonicalizeText(normalizedAnswer),
					)
				: null;

			return {
				...question,
				question: normalizeMathText(question.question).trim(),
				options,
				answer: matchingOption || normalizedAnswer,
			};
		}),
	};
}

function sanitizeQuestion(question) {
	return {
		question: normalizeMathText(question.question).trim(),
		options: question.options.map((option) => normalizeMathText(option).trim()),
		answer: normalizeMathText(question.answer).trim(),
	};
}

function parseGeneratedJson(text) {
	const trimmedText = text.trim();
	const fencedJson = trimmedText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
	return JSON.parse(fencedJson ? fencedJson[1] : trimmedText);
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

		return parseGeneratedJson(response.text);
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

		let batchPaper;
		let lastValidationError;
		for (
			let attempt = 0;
			attempt < MAX_BATCH_VALIDATION_ATTEMPTS;
			attempt += 1
		) {
			const retryContext =
				attempt > 0
					? `The previous draft failed validation (${lastValidationError?.message || 'quality checks'}). Regenerate any affected questions. For every question, solve it independently, copy the answer exactly from one complete option string, verify it is the only correct option, remove duplicates, and ensure every LaTeX expression is valid KaTeX before returning JSON.`
					: null;
			try {
				const candidatePaper = normalizeGeneratedPaper(
					await generateQuestionBatch({
						ai,
						topic: resolvedTopic,
						numQuestions: batchQuestions,
						difficulty,
						testType,
						topicContext: [batchContext, retryContext]
							.filter(Boolean)
							.join('\n'),
						examName,
						syllabusFocus,
						previousQuestions: cumulativePrevious,
						language,
						testMode,
						objectiveOnly,
						deadlineMs,
					}),
				);
				const repairedPaper = repairGeneratedPaper({
					questionPaper: candidatePaper,
					fallbackTopic: resolvedTopic,
				});

				validateGeneratedPaper({
					questionPaper: repairedPaper,
					testType,
					numQuestions: batchQuestions,
				});
				batchPaper = repairedPaper;
				break;
			} catch (validationError) {
				if (
					isApiLimitExceededError(validationError) ||
					isApiTimeoutError(validationError)
				) {
					throw validationError;
				}
				lastValidationError = validationError;
				if (attempt === MAX_BATCH_VALIDATION_ATTEMPTS - 1) {
					throw validationError;
				}
			}
		}

		if (!batchPaper) {
			throw (
				lastValidationError || new Error('Failed to validate generated batch')
			);
		}
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
		topic: normalizeMathText(
			resolvedPaperTopic || resolvedTopic || 'Generated Test',
		),
		questions: generatedQuestions,
	};
}

export async function POST({ request }) {
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
			return json({ error: validationError }, { status: 400 });
		}

		const resolvedTopic = topic || (examName ? `${examName} mock paper` : '');

		if (testMode === 'full-exam' && examId) {
			const locallyAttemptedTestIds = previousTests
				.filter((test) => {
					if (!test || typeof test !== 'object') {
						return false;
					}
					const normalizedTestId = Number(test.id);
					if (!Number.isInteger(normalizedTestId) || normalizedTestId <= 0) {
						return false;
					}
					const requestParams = test.requestParams || {};
					const sameExam =
						String(requestParams.examId || '') === String(examId);
					const isFullExam = requestParams.testMode === 'full-exam';
					const isSubmitted = Object.prototype.hasOwnProperty.call(
						test,
						'userAnswers',
					);
					return sameExam && isFullExam && isSubmitted;
				})
				.map((test) => Number(test.id));

			const reusableRecord = await findReusableFullExamRecord({
				examId,
				language,
				excludedTestIds: locallyAttemptedTestIds,
			});
			const reusablePaper =
				reusableRecord?.test &&
				typeof reusableRecord.test === 'object' &&
				!Array.isArray(reusableRecord.test)
					? reusableRecord.test
					: null;

			if (reusableRecord?.id && reusablePaper) {
				await logApiEvent({
					route: '/api/generate',
					action: 'reuse_exam_paper',
					clientKey,
					statusCode: 200,
					durationMs: Date.now() - startedAt,
					metadata: {
						testMode,
						examId,
						examName,
						language,
						reusedTestId: reusableRecord.id,
						userId: null,
					},
				});

				return json({
					...reusablePaper,
					id: reusableRecord.id,
					reusedExisting: true,
				});
			}
		}

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

		const apiKey = env.GEMINI_API_KEY;
		if (!apiKey) {
			return json(
				{ error: 'Gemini API key is not configured' },
				{ status: 500 },
			);
		}

		const ai = new GoogleGenAI({ apiKey });
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

			return json({
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

			return json(
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

		return json(
			{
				error: errorMessage,
				code: errorCode,
			},
			{ status: statusCode },
		);
	}
}
