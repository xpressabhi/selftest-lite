import { json } from '@sveltejs/kit';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import { DEFAULT_RATE_LIMIT, rateLimiter } from '$lib/server/rateLimiter';
import { generatePrompt } from '$lib/server/prompt';
import * as z from 'zod';
import {
	createTestRecord,
	findReusableFullExamRecord,
	getClientKey,
	getRecentQuestionsForTopic,
	getStateForIdentity,
	getTestRecordsByIds,
	logApiEvent,
} from '$lib/server/storage';
import { getAuthenticatedUser, getClientIdFromRequest } from '$lib/server/auth';
import { paperSchema } from '$lib/server/quizSchema';
import { parseJsonResponse } from '$lib/server/jsonResponse';
import { normalizeMathText } from '$lib/shared/latex';
import { PROFILE_STATE_KEY, isPersonalized, parseProfileStateValue } from '$lib/shared/userProfile';
import {
	buildProfileContext,
	buildTailoredSummary,
	computeLearnerSignals,
	resolveDifficulty,
	resolveWarmUpDifficulty,
} from '$lib/server/profile';
import {
	parseRequestBody,
	sanitizePreviousTestIds,
	validateGenerateRequest,
	repairGeneratedPaper,
	validateGeneratedPaper,
	comparableText,
	answerMatchesOption,
} from '$lib/server/quizValidation';
import { stripAnswerKey } from '$lib/server/paperRedaction';
import {
	applyQualityFixes,
	inspectQuestionBatch,
	summarizeQuestionLengths,
} from '$lib/server/questionQuality';
import {
	answerVerificationSchema,
	buildAnswerVerificationPrompt,
} from '$lib/server/answerVerifier';
import {
	API_LIMIT_ERROR_CODE,
	API_TIMEOUT_ERROR_CODE,
	isApiLimitExceededError,
	isApiTimeoutError,
	classifyApiError,
} from '$lib/shared/apiLimitError';

const MODEL_NAME = 'gemini-flash-lite-latest';
const MODEL_ATTEMPTS = 2;
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

/**
 * Carries structured diagnostics for telemetry. Never includes question or
 * option text - only issue codes, indexes, counts and length ratios.
 */
class GenerationFailureError extends Error {
	constructor(message, failure = {}) {
		super(message);
		this.name = 'GenerationFailureError';
		this.failure = failure;
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

function isModelUnavailableError(error) {
	return /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|overloaded/iu.test(String(error?.message || ''));
}

/**
 * Generates with Flash Lite (the only generation model). One bounded retry
 * covers transient 503/429 overloads; anything longer is classified and
 * surfaced to the client. `runState.model` records the model for diagnostics.
 */
async function generateWithModel({ ai, contents, config, runState }) {
	let lastError = null;
	for (let attempt = 1; attempt <= MODEL_ATTEMPTS; attempt += 1) {
		try {
			const response = await ai.models.generateContent({
				model: MODEL_NAME,
				contents,
				config: {
					...config,
					thinkingConfig: {
						thinkingLevel: 'minimal',
					},
				},
			});
			if (runState) {
				runState.model = MODEL_NAME;
			}
			return response;
		} catch (error) {
			lastError = error;
			error.model = MODEL_NAME;
			if (attempt >= MODEL_ATTEMPTS || !isModelUnavailableError(error)) {
				throw error;
			}
			console.warn(`Model ${MODEL_NAME} unavailable; retrying once.`);
		}
	}
	throw lastError;
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
						(option) => comparableText(option) === comparableText(normalizedAnswer)
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
	return parseJsonResponse(text);
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
	userContext,
	warmUpDifficulty,
	deadlineMs,
	runState,
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
		userContext,
		warmUpDifficulty,
	});

	const remainingTimeMs = getRemainingTimeMs(deadlineMs);
	if (remainingTimeMs <= 0) {
		throw new GenerationTimeoutError();
	}

	let timeoutHandle;
	try {
		const response = await Promise.race([
			generateWithModel({
				ai,
				contents: prompt,
				config: {
					responseMimeType: 'application/json',
					responseJsonSchema: z.toJSONSchema(paperSchema),
				},
				runState,
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

async function verifyQuestionBatch({ ai, questions, language, deadlineMs, runState }) {
	const remainingMs = getRemainingTimeMs(deadlineMs);
	if (remainingMs <= 5000 || questions.length === 0) {
		return [];
	}
	let timeoutHandle;
	try {
		const response = await Promise.race([
			generateWithModel({
				ai,
				contents: buildAnswerVerificationPrompt({ questions, language }),
				config: {
					responseMimeType: 'application/json',
					responseJsonSchema: z.toJSONSchema(answerVerificationSchema),
				},
				runState,
			}),
			new Promise((_, reject) => {
				timeoutHandle = setTimeout(() => {
					reject(new GenerationTimeoutError());
				}, remainingMs);
			}),
		]);
		const validated = answerVerificationSchema.safeParse(parseJsonResponse(response.text));
		if (!validated.success || validated.data.answers.length !== questions.length) {
			return [];
		}
		return validated.data.answers
			.map((answer, index) => ({
				index,
				matches: answerMatchesOption(
					questions[index]?.options,
					questions[index]?.answer,
					answer
				),
			}))
			.filter((entry) => !entry.matches)
			.map((entry) => entry.index);
	} catch (error) {
		// Verification is best-effort: an API hiccup must not fail generation.
		console.error('Answer verification skipped:', error?.message);
		return [];
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
	recentQuestions = [],
	language,
	testMode,
	objectiveOnly,
	userContext,
	warmUpDifficulty,
	deadlineMs,
	runState,
}) {
	const totalBatches = Math.ceil(numQuestions / BATCH_SIZE);
	const generatedQuestions = [];
	let resolvedPaperTopic = resolvedTopic;

	for (let index = 0; index < totalBatches; index += 1) {
		assertWithinDeadline(deadlineMs);

		const batchQuestions = Math.min(BATCH_SIZE, numQuestions - generatedQuestions.length);
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
			...recentQuestions,
			...generatedQuestions.map((question) => ({
				question: question.question,
				answer: question.answer,
			})),
		];

		let batchPaper;
		let lastValidationError;
		for (let attempt = 0; attempt < MAX_BATCH_VALIDATION_ATTEMPTS; attempt += 1) {
			const retryContext =
				attempt > 0
					? `The previous draft failed validation (${lastValidationError?.message || 'quality checks'}). Regenerate every question. Keep all four options within about 20% of each other in character length and never make the correct option the longest. For every question, solve it independently, copy the answer exactly from one complete option string, verify it is the only correct option, remove duplicates, and ensure every LaTeX expression is valid KaTeX before returning JSON.`
					: null;
			try {
				const candidatePaper = normalizeGeneratedPaper(
					await generateQuestionBatch({
						ai,
						topic: resolvedTopic,
						numQuestions: batchQuestions,
						difficulty,
						testType,
						topicContext: [batchContext, retryContext].filter(Boolean).join('\n'),
						examName,
						syllabusFocus,
						previousQuestions: cumulativePrevious,
						language,
						testMode,
						objectiveOnly,
						userContext,
						warmUpDifficulty,
						deadlineMs,
						runState,
					})
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

				// Deterministic quality pass: shuffle options (fixes the
				// answer-position bias) and reject length/duplicate/language
				// defects that prompt-level checks miss.
				const qualityResult = applyQualityFixes(repairedPaper.questions, {
					previousQuestionTexts: [
						...previousQuestions.map((question) => question.question),
						...recentQuestions.map((question) => question.question),
						...generatedQuestions.map((question) => question.question),
					],
					language,
				});
				if (qualityResult.issues.length > 0) {
					const sample = qualityResult.issues
						.slice(0, 3)
						.map((entry) => `${entry.issue}@Q${entry.index + 1}`)
						.join(', ');
					throw new GenerationFailureError(`Content quality checks failed (${sample})`, {
						stage: 'quality',
						issues: qualityResult.issues.slice(0, 50),
						questionStats: summarizeQuestionLengths(qualityResult.questions),
						batchIndex: index,
						batchTotal: totalBatches,
						validationAttempt: attempt + 1,
					});
				}

				// Independent verification: a second call solves the questions
				// without the key; disagreements are regenerated.
				const mismatchedAnswers = await verifyQuestionBatch({
					ai,
					questions: qualityResult.questions,
					language,
					deadlineMs,
					runState,
				});
				if (mismatchedAnswers.length > 0) {
					throw new GenerationFailureError(
						`Answer verification disagreed on question(s) ${mismatchedAnswers
							.map((index) => index + 1)
							.join(', ')}`,
						{
							stage: 'verification',
							issues: mismatchedAnswers.map((index) => ({
								index,
								issue: 'verification-disagreement',
							})),
							batchIndex: index,
							batchTotal: totalBatches,
							validationAttempt: attempt + 1,
						}
					);
				}

				batchPaper = { ...repairedPaper, questions: qualityResult.questions };
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
					if (validationError instanceof GenerationFailureError) {
						throw validationError;
					}
					throw new GenerationFailureError(validationError.message, {
						stage: 'batch-validation',
						batchIndex: index,
						batchTotal: totalBatches,
						validationAttempt: attempt + 1,
					});
				}
			}
		}

		if (!batchPaper) {
			throw lastValidationError || new Error('Failed to validate generated batch');
		}
		if (!resolvedPaperTopic && batchPaper.topic) {
			resolvedPaperTopic = batchPaper.topic;
		}
		generatedQuestions.push(...batchPaper.questions.map(sanitizeQuestion));
	}

	if (generatedQuestions.length !== numQuestions) {
		throw new GenerationFailureError(
			`Expected ${numQuestions} questions but generated ${generatedQuestions.length}`,
			{
				stage: 'count',
				generatedCount: generatedQuestions.length,
				requestedCount: numQuestions,
			}
		);
	}

	return {
		topic: normalizeMathText(resolvedPaperTopic || resolvedTopic || 'Generated Test'),
		questions: generatedQuestions,
	};
}

export async function POST({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);
	const user = await getAuthenticatedUser(cookies);
	const clientId = getClientIdFromRequest(request);

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
			previousTestIds = [],
			attemptedTestIds = [],
			testType = 'multiple-choice',
			numQuestions = 10,
			difficulty = 'intermediate',
			difficultyExplicit = false,
			language = 'english',
			objectiveOnly = false,
			durationMinutes = null,
		} = await parseRequestBody(request);

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
			return json(
				{ error: validationError.message, code: validationError.code },
				{ status: 400 }
			);
		}

		const resolvedTopic = topic || (examName ? `${examName} mock paper` : '');
		const normalizedPreviousTestIds = sanitizePreviousTestIds(previousTestIds);
		const normalizedAttemptedTestIds = new Set(sanitizePreviousTestIds(attemptedTestIds));

		const rateLimit = await rateLimiter(request, { bucket: '/api/generate' });
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/generate',
				action: 'generate_quiz',
				clientKey,
				request,
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
						'X-RateLimit-Limit': String(DEFAULT_RATE_LIMIT),
						'X-RateLimit-Remaining': rateLimit.remaining.toString(),
						'X-RateLimit-Reset': rateLimit.resetTime.toString(),
					},
				}
			);
		}

		const previousTestRecords = await getTestRecordsByIds(normalizedPreviousTestIds);

		let personalized = false;
		let tailoredSummary = null;
		let resolvedDifficulty = difficulty;
		let userContext = null;
		let warmUpDifficulty = null;
		if (user?.id || clientId) {
			try {
				const storage = await getStateForIdentity({ userId: user?.id, clientId });
				const profile = parseProfileStateValue(storage?.[PROFILE_STATE_KEY]);
				if (isPersonalized(profile)) {
					personalized = true;
					const signals = await computeLearnerSignals({ userId: user?.id, clientId });
					const topicKeywords = [
						resolvedTopic,
						examName,
						...(Array.isArray(selectedTopics) ? selectedTopics : []),
						...(Array.isArray(syllabusFocus) ? syllabusFocus : []),
					];
					if (testMode === 'quiz-practice') {
						resolvedDifficulty = resolveDifficulty({
							profile,
							signals,
							requestDifficulty: difficulty,
							difficultyExplicit: difficultyExplicit === true,
							topicKeywords,
						});
						warmUpDifficulty = resolveWarmUpDifficulty(resolvedDifficulty);
					}
					userContext = buildProfileContext({
						profile,
						signals,
						resolvedDifficulty,
						warmUpDifficulty,
						topicKeywords,
					});
					tailoredSummary = buildTailoredSummary({
						profile,
						signals,
						resolvedDifficulty:
							testMode === 'quiz-practice' ? resolvedDifficulty : difficulty,
					});
				}
			} catch (profileError) {
				console.error('Failed to apply user profile:', profileError);
			}
		}

		if (testMode === 'full-exam' && examId) {
			const locallyAttemptedTestIds = previousTestRecords
				.filter((record) => {
					if (!normalizedAttemptedTestIds.has(Number(record.id))) {
						return false;
					}
					const requestParams = record.test?.requestParams || {};
					const sameExam = String(requestParams.examId || '') === String(examId);
					const isFullExam = requestParams.testMode === 'full-exam';
					return sameExam && isFullExam;
				})
				.map((record) => Number(record.id));

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
				// Never reuse a defective paper: structural issues force a
				// fresh generation instead.
				const reusableIssues = inspectQuestionBatch(
					Array.isArray(reusablePaper.questions) ? reusablePaper.questions : [],
					{ language }
				);
				if (reusableIssues.length > 0) {
					await logApiEvent({
						route: '/api/generate',
						action: 'reuse_exam_paper_rejected',
						clientKey,
						request,
						statusCode: 200,
						durationMs: Date.now() - startedAt,
						metadata: {
							reusedTestId: reusableRecord.id,
							issues: reusableIssues.slice(0, 5),
						},
					});
				} else {
					await logApiEvent({
						route: '/api/generate',
						action: 'reuse_exam_paper',
						clientKey,
						request,
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
						...stripAnswerKey(reusablePaper),
						id: reusableRecord.id,
						reusedExisting: true,
					});
				}
			}
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
			selectedTopics.length > 0 ? `Selected topics: ${selectedTopics.join(', ')}` : null,
			resolvedTopic ? `Additional context: ${resolvedTopic}` : null,
		]
			.filter(Boolean)
			.join('\n');

		// Keep the "previous questions to avoid" context bounded: every past
		// test can hold 100+ questions and 10 tests of that would balloon the
		// prompt into tens of thousands of tokens, slowing every generation.
		const MAX_PREVIOUS_QUESTIONS = 60;
		const previousQuestions = [];
		const seenQuestionKeys = new Set();
		for (const record of previousTestRecords) {
			for (const q of record.test?.questions || []) {
				const key = comparableText(q.question);
				if (!key || seenQuestionKeys.has(key)) {
					continue;
				}
				seenQuestionKeys.add(key);
				previousQuestions.push({ question: q.question, answer: q.answer });
				if (previousQuestions.length >= MAX_PREVIOUS_QUESTIONS) {
					break;
				}
			}
			if (previousQuestions.length >= MAX_PREVIOUS_QUESTIONS) {
				break;
			}
		}

		const recentTopicQuestions = await getRecentQuestionsForTopic({
			topic: resolvedTopic,
			language,
		}).catch(() => []);

		const apiKey = env.GEMINI_API_KEY;
		if (!apiKey) {
			return json({ error: 'Gemini API key is not configured' }, { status: 500 });
		}

		const ai = new GoogleGenAI({ apiKey });
		const generationRun = { model: null };
		let questionPaper;

		try {
			questionPaper = await generatePaper({
				ai,
				resolvedTopic,
				numQuestions,
				difficulty: resolvedDifficulty,
				testType,
				topicContext,
				examName,
				syllabusFocus,
				previousQuestions,
				recentQuestions: recentTopicQuestions,
				language,
				testMode,
				objectiveOnly,
				userContext,
				warmUpDifficulty,
				deadlineMs: startedAt + GENERATION_TIMEOUT_MS,
				runState: generationRun,
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
					difficulty: resolvedDifficulty,
					requestedDifficulty: difficulty,
					language,
					objectiveOnly,
					durationMinutes,
					clientId,
				},
			};

			const testId = await createTestRecord(storedPaper, {
				topic: resolvedTopic,
				examName,
				testType,
				numQuestions,
				difficulty: resolvedDifficulty,
				language,
				testMode,
				examId,
				objectiveOnly,
				durationMinutes,
				createdByUserId: user?.id || null,
			});

			await logApiEvent({
				route: '/api/generate',
				action: 'generate_quiz',
				clientKey,
				request,
				statusCode: 200,
				durationMs: Date.now() - startedAt,
				metadata: {
					topic: questionPaper.topic,
					testMode,
					examName,
					testType,
					numQuestions,
					difficulty: resolvedDifficulty,
					requestedDifficulty: difficulty,
					language,
					personalized,
					questionCount: questionPaper.questions.length,
					testId,
				},
			});

			return json({
				...stripAnswerKey(storedPaper),
				id: testId,
				personalized,
				tailoredSummary,
			});
		} catch (parseError) {
			console.error('Failed to parse or validate response:', parseError);
			const { statusCode, code, message } = classifyApiError(parseError, {
				fallbackCode: 'GENERATION_FAILED',
				fallbackMessage: 'Failed to generate valid quiz questions. Please try again.',
				timeoutMessage: 'Generation timed out after 180 seconds. Please retry.',
			});
			const failure = parseError.failure || {};
			const failureStage =
				failure.stage ||
				(isApiLimitExceededError(parseError)
					? 'api-limit'
					: isApiTimeoutError(parseError)
						? 'timeout'
						: 'internal');

			await logApiEvent({
				route: '/api/generate',
				action: 'generate_quiz',
				clientKey,
				request,
				statusCode,
				durationMs: Date.now() - startedAt,
				errorMessage: String(parseError.message || '').slice(0, 500),
				metadata: {
					topic: resolvedTopic || null,
					testMode,
					examName,
					testType,
					numQuestions,
					difficulty,
					language,
					generationFailure: {
						code,
						stage: failureStage,
						message: String(parseError.message || '').slice(0, 300),
						model: failure.model || parseError.model || generationRun.model || null,
						...failure,
					},
				},
			});

			return json(
				{
					error: message,
					code,
					details: parseError.message,
				},
				{ status: statusCode }
			);
		}
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
			fallbackCode: 'GENERATION_UNEXPECTED',
			timeoutMessage: 'Generation timed out after 180 seconds. Please retry.',
		});

		await logApiEvent({
			route: '/api/generate',
			action: 'generate_quiz',
			clientKey,
			request,
			statusCode,
			durationMs: Date.now() - startedAt,
			errorMessage: String(error.message || '').slice(0, 500),
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
