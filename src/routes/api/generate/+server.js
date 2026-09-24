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
	saveTestIntentRecord,
} from '$lib/server/storage';
import { getAuthenticatedUser, getClientIdFromRequest } from '$lib/server/auth';
import { paperSchemaFor } from '$lib/server/quizSchema';
import { parseJsonResponse } from '$lib/server/jsonResponse';
import { normalizeMathText } from '$lib/shared/latex';
import { questionTextFor } from '$lib/shared/questionText';
import { buildMatchingQuestion } from '$lib/server/matchingBuilder';
import { buildAssertionReasoningQuestion } from '$lib/server/assertionReasoning';
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
	inspectGeneratedPaper,
	comparableText,
	answerMatchesOption,
} from '$lib/server/quizValidation';
import { stripAnswerKey } from '$lib/server/paperRedaction';
import {
	assignSectionsToPaper,
	buildPatternConstraint,
	getExamPattern,
} from '$lib/server/examPattern';
import { hasPremiumAccess } from '$lib/server/premium';
import { resolveGenerationParams } from '$lib/server/generationParams';
import { buildOriginalRequest, sanitizeIntentCapture } from '$lib/server/intentCapture';
import {
	applyQualityFixes,
	inspectQuestionBatch,
} from '$lib/server/questionQuality';
import {
	BATCH_SIZE,
	GENERATION_RESERVE_MS,
	MAX_GENERATION_ROUNDS,
	buildTopUpInstruction,
	partitionRound,
	salvageSummary,
	shouldReturnTrimmed,
	topUpBatchSize,
} from '$lib/server/generationSalvage';
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

			// Structured formats keep their content in dedicated fields; the
			// model output has no `format` yet, so detect by shape.
			const structured = {};
			if (Array.isArray(question.columnA) && Array.isArray(question.columnB)) {
				structured.columnA = question.columnA.map((item) =>
					normalizeMathText(item).trim()
				);
				structured.columnB = question.columnB.map((item) =>
					normalizeMathText(item).trim()
				);
			}
			if (typeof question.assertion === 'string' || typeof question.reason === 'string') {
				structured.assertion = normalizeMathText(question.assertion).trim();
				structured.reason = normalizeMathText(question.reason).trim();
			}

			return {
				...question,
				question: normalizeMathText(question.question).trim(),
				options,
				answer: matchingOption || normalizedAnswer,
				...structured,
			};
		}),
	};
}

/**
 * Converts matching / assertion-reasoning drafts into their final stored
 * shape, where the server owns options and the answer. Builder failures are
 * returned as structural issues for the index so the salvage path regenerates
 * only those questions.
 */
function buildStructuredQuestions(questionPaper, { testType, language }) {
	if (testType !== 'matching' && testType !== 'assertion-reasoning') {
		return { paper: questionPaper, issues: [] };
	}

	const issues = [];
	const questions = questionPaper.questions.map((raw, index) => {
		const result =
			testType === 'matching'
				? buildMatchingQuestion(raw)
				: buildAssertionReasoningQuestion(raw, { language });
		if (result.ok) {
			return result.question;
		}
		for (const issue of result.issues) {
			issues.push({
				index,
				issue,
				message: `Question ${index + 1} failed ${issue}`,
			});
		}
		return raw;
	});

	return { paper: { ...questionPaper, questions }, issues };
}

function sanitizeQuestion(question) {
	const sanitized = {
		question: normalizeMathText(question.question).trim(),
		options: question.options.map((option) => normalizeMathText(option).trim()),
		answer: normalizeMathText(question.answer).trim(),
	};
	if (question.format === 'matching') {
		sanitized.format = 'matching';
		sanitized.columnA = question.columnA.map((item) => normalizeMathText(item).trim());
		sanitized.columnB = question.columnB.map((item) => normalizeMathText(item).trim());
	}
	if (question.format === 'assertion-reasoning') {
		sanitized.format = 'assertion-reasoning';
		sanitized.assertion = normalizeMathText(question.assertion).trim();
		sanitized.reason = normalizeMathText(question.reason).trim();
	}
	return sanitized;
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
	originalRequest = null,
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
		originalRequest,
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
					responseJsonSchema: z.toJSONSchema(paperSchemaFor(testType)),
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
	originalRequest = null,
	deadlineMs,
	runState,
	onProgress,
}) {
	const totalBatches = Math.ceil(numQuestions / BATCH_SIZE);
	const generatedQuestions = [];
	const salvage = { rounds: 0, rejected: 0, issueCounts: {}, trimmed: false };
	const crossPaperTexts = [
		...previousQuestions.map((question) => questionTextFor(question)),
		...recentQuestions.map((question) => questionTextFor(question)),
	];
	let resolvedPaperTopic = resolvedTopic;

	for (let index = 0; index < totalBatches; index += 1) {
		assertWithinDeadline(deadlineMs);

		const batchTarget = Math.min(BATCH_SIZE, numQuestions - generatedQuestions.length);
		if (batchTarget <= 0) {
			break;
		}

		// Announce the batch before its rounds run so the client can show
		// "batch i/n" while it is being drafted, not only after it lands.
		onProgress?.({
			stage: 'generating',
			approved: generatedQuestions.length,
			requested: numQuestions,
			round: 0,
			batchIndex: index + 1,
			batchTotal: totalBatches,
		});

		const approvedInBatch = [];
		let rejected = [];
		let lastError = null;
		let round = 0;

		// Round 0 generates the whole batch; later rounds replace only the
		// rejected drafts (plus a buffer) instead of regenerating everything.
		while (approvedInBatch.length < batchTarget && round < MAX_GENERATION_ROUNDS) {
			assertWithinDeadline(deadlineMs);
			if (getRemainingTimeMs(deadlineMs) <= GENERATION_RESERVE_MS) {
				break;
			}

			const missing = batchTarget - approvedInBatch.length;
			const ask = round === 0 ? missing : topUpBatchSize(missing);
			const approvedSoFar = [...generatedQuestions, ...approvedInBatch];
			const roundContext = [
				topicContext,
				totalBatches > 1
					? `Batch ${index + 1} of ${totalBatches}: Generate exactly ${ask} new questions and avoid overlap with earlier batches.`
					: null,
				round > 0
					? buildTopUpInstruction({
							rejected,
							approvedTexts: approvedSoFar.map((question) => questionTextFor(question)),
							round,
							ask,
						})
					: null,
			]
				.filter(Boolean)
				.join('\n');

			try {
				const candidatePaper = normalizeGeneratedPaper(
					await generateQuestionBatch({
						ai,
						topic: resolvedTopic,
						numQuestions: ask,
						difficulty,
						testType,
						topicContext: roundContext,
						examName,
						syllabusFocus,
						previousQuestions: [
							...previousQuestions,
							...recentQuestions,
							...approvedSoFar.map((question) => ({
								question: questionTextFor(question),
								answer: question.answer,
							})),
						],
						language,
						testMode,
						objectiveOnly,
						userContext,
						warmUpDifficulty,
						originalRequest,
						deadlineMs,
						runState,
					})
				);
				const repairedPaper = repairGeneratedPaper({
					questionPaper: candidatePaper,
					fallbackTopic: resolvedTopic,
				});
				// Matching / assertion-reasoning: turn content drafts into final
				// questions (server-owned options and answer). Builder failures
				// become structural issues so only those drafts regenerate.
				const built = buildStructuredQuestions(repairedPaper, { testType, language });
				const structuralIssues = [
					...built.issues,
					...inspectGeneratedPaper({
						questionPaper: built.paper,
						testType,
						numQuestions: ask,
						language,
					}),
				];
				const fatalStructureIssue = structuralIssues.find(
					(issue) => issue.index < 0 && issue.issue === 'invalid-structure'
				);
				if (fatalStructureIssue) {
					throw new GenerationFailureError(fatalStructureIssue.message, {
						stage: 'structure',
						issues: structuralIssues.slice(0, 5),
						batchIndex: index,
						batchTotal: totalBatches,
						validationAttempt: round + 1,
					});
				}

				// Deterministic quality pass: shuffle options (fixes the
				// answer-position bias) and reject length/duplicate/language
				// defects that prompt-level checks miss. Duplicates are checked
				// within this paper at 0.8 and against earlier papers at 0.85.
				const qualityResult = applyQualityFixes(built.paper.questions, {
					previousQuestionTexts: crossPaperTexts,
					currentPaperTexts: approvedSoFar.map((question) => questionTextFor(question)),
					language,
				});

				// Independent verification of this round's candidates only:
				// already-approved questions were verified in their own round.
				const mismatchedAnswers = await verifyQuestionBatch({
					ai,
					questions: qualityResult.questions,
					language,
					deadlineMs,
					runState,
				});

				const { approved, rejected: roundRejected } = partitionRound({
					questions: qualityResult.questions,
					structuralIssues: structuralIssues.filter((issue) => issue.index >= 0),
					qualityIssues: qualityResult.issues,
					mismatchIndexes: mismatchedAnswers,
				});

				if (approved.length === 0 && roundRejected.length === 0) {
					throw new GenerationFailureError('The model returned no questions', {
						stage: 'empty',
						batchIndex: index,
						batchTotal: totalBatches,
						validationAttempt: round + 1,
					});
				}

				if (!resolvedPaperTopic && repairedPaper.topic) {
					resolvedPaperTopic = repairedPaper.topic;
				}

				salvage.rounds += 1;
				salvage.rejected += roundRejected.length;
				for (const entry of roundRejected) {
					for (const issue of entry.issues) {
						salvage.issueCounts[issue] = (salvage.issueCounts[issue] || 0) + 1;
					}
				}
				approvedInBatch.push(...approved.slice(0, missing));
				rejected = roundRejected;
				onProgress?.({
					stage: round === 0 ? 'generating' : 'salvaging',
					approved: generatedQuestions.length + approvedInBatch.length,
					requested: numQuestions,
					round: round + 1,
					batchIndex: index + 1,
					batchTotal: totalBatches,
				});
			} catch (roundError) {
				if (
					isApiLimitExceededError(roundError) ||
					isApiTimeoutError(roundError)
				) {
					throw roundError;
				}
				lastError = roundError;
			}
			round += 1;
		}

		if (approvedInBatch.length === 0) {
			throw (
				lastError ||
				new GenerationFailureError('Failed to validate generated batch', {
					stage: 'batch-validation',
					batchIndex: index,
					batchTotal: totalBatches,
				})
			);
		}
		generatedQuestions.push(...approvedInBatch.map(sanitizeQuestion));
	}

	if (generatedQuestions.length !== numQuestions) {
		if (
			!shouldReturnTrimmed({
				approved: generatedQuestions.length,
				requested: numQuestions,
				testMode,
			})
		) {
			throw new GenerationFailureError(
				`Expected ${numQuestions} questions but generated ${generatedQuestions.length}`,
				{
					stage: 'count',
					generatedCount: generatedQuestions.length,
					requestedCount: numQuestions,
					...salvageSummary({
						requested: numQuestions,
						approved: generatedQuestions.length,
						rounds: salvage.rounds,
						rejectedCount: salvage.rejected,
						issueCounts: salvage.issueCounts,
					}),
				}
			);
		}
		// Enough good questions to be useful: return the smaller paper rather
		// than failing the whole generation.
		salvage.trimmed = true;
	}

	return {
		topic: normalizeMathText(resolvedPaperTopic || resolvedTopic || 'Generated Test'),
		questions: generatedQuestions,
		trimmed: salvage.trimmed,
		requestedCount: salvage.trimmed ? numQuestions : undefined,
		salvage: salvageSummary({
			requested: numQuestions,
			approved: generatedQuestions.length,
			rounds: salvage.rounds,
			rejectedCount: salvage.rejected,
			trimmed: salvage.trimmed,
			issueCounts: salvage.issueCounts,
		}),
	};
}

/**
 * Runs generation, persistence, and success/failure telemetry once, returning
 * a JSON-ready payload so the plain and the streaming response paths share
 * exactly the same behaviour.
 */
async function runGenerationAndStore(context, onProgress) {
	const {
		ai,
		startedAt,
		request,
		clientKey,
		user,
		clientId,
		resolvedTopic,
		numQuestions,
		resolvedDifficulty,
		difficulty,
		testType,
		topicContext,
		examName,
		examStream,
		category,
		selectedTopics,
		syllabusFocus,
		previousQuestions,
		recentQuestions,
		language,
		testMode,
		objectiveOnly,
		userContext,
		warmUpDifficulty,
		personalized,
		tailoredSummary,
		originalRequest,
		intentCapture: capture,
		deadlineMs,
	} = context;
	const generationRun = { model: null };

	try {
		const sectionPlan =
			context.examPattern?.sections?.length > 1 && !context.focusSection
				? context.examPattern.sections
				: null;
		let generatedPaper;
		if (sectionPlan) {
			// Generate each section independently (in parallel) so the section
			// index ranges are guaranteed to match the real paper format.
			const totalRequested = sectionPlan.reduce(
				(sum, section) => sum + (Number(section.questionCount) || 0),
				0
			);
			onProgress?.({
				stage: 'sections',
				approved: 0,
				requested: totalRequested,
				round: 0,
			});
			const sectionPapers = await Promise.all(
				sectionPlan.map((section) =>
					generatePaper({
						ai,
						resolvedTopic,
						numQuestions: section.questionCount,
						difficulty: resolvedDifficulty,
						testType: section.questionTypes?.[0] || testType,
						topicContext: `${topicContext}\n${buildPatternConstraint(
							context.examPattern,
							section
						)}`,
						examName,
						syllabusFocus,
						previousQuestions,
						recentQuestions,
						language,
						testMode,
						objectiveOnly,
						userContext,
						warmUpDifficulty,
						originalRequest,
						deadlineMs,
						runState: generationRun,
					})
				)
			);
			let approvedTotal = 0;
			sectionPapers.forEach((paper, index) => {
				approvedTotal += paper.questions.length;
				onProgress?.({
					stage: 'sections',
					approved: approvedTotal,
					requested: totalRequested,
					round: index + 1,
				});
			});
			generatedPaper = {
				topic: sectionPapers[0]?.topic || resolvedTopic,
				questions: sectionPapers.flatMap((paper) => paper.questions),
			};
			// Actual per-section output sizes drive the ranges, so a trimmed
			// section never mislabels the next one.
			context.examPattern = {
				...context.examPattern,
				sections: sectionPlan.map((section, index) => ({
					...section,
					questionCount: sectionPapers[index].questions.length,
				})),
			};
		} else {
			generatedPaper = await generatePaper({
				ai,
				resolvedTopic,
				numQuestions,
				difficulty: resolvedDifficulty,
				testType,
				topicContext,
				examName,
				syllabusFocus,
				previousQuestions,
				recentQuestions,
				language,
				testMode,
				objectiveOnly,
				userContext,
				warmUpDifficulty,
				originalRequest,
				deadlineMs,
				runState: generationRun,
				onProgress,
			});
		}

		// The model produces a flat paper; section ranges are assigned
		// server-side from the pattern so a hallucinated range can never ship.
		const assignment = generatedPaper.sections?.length
			? {
					questions: generatedPaper.questions,
					sections: generatedPaper.sections,
					examMeta: generatedPaper.examMeta || null,
				}
			: assignSectionsToPaper(generatedPaper.questions, context.examPattern || null, {
					section: context.focusSection || null,
				});
		if (assignment.examMeta && context.schoolName) {
			assignment.examMeta = { ...assignment.examMeta, schoolName: context.schoolName };
		}
		const questionPaper = {
			...generatedPaper,
			questions: assignment.questions,
			...(assignment.sections.length > 0 ? { sections: assignment.sections } : {}),
			...(assignment.examMeta ? { examMeta: assignment.examMeta } : {}),
		};

		const storedPaper = {
			...questionPaper,
			requestParams: {
				topic: resolvedTopic,
				testMode,
				examId: context.examId,
				examName,
				examStream,
				sectionFocus: context.focusSection?.id || null,
				category: category || null,
				selectedTopics,
				syllabusFocus,
				testType,
				numQuestions,
				difficulty: resolvedDifficulty,
				requestedDifficulty: difficulty,
				language,
				objectiveOnly,
				durationMinutes: context.durationMinutes,
				clientId,
			},
		};

		// A trimmed paper is stored (and counted) at its real size.
		const questionCount = questionPaper.questions.length;
		const testId = await createTestRecord(storedPaper, {
			topic: resolvedTopic,
			examName,
			testType,
			numQuestions: questionCount,
			difficulty: resolvedDifficulty,
			language,
			testMode,
			examId: context.examId,
			sectionFocus: context.focusSection?.id || null,
			objectiveOnly,
			durationMinutes: context.durationMinutes,
			createdByUserId: user?.id || null,
		});

		// Planner capture is best-effort: the generated test is already
		// stored, so a failed intent write must not fail the request.
		if (capture) {
			try {
				await saveTestIntentRecord({
					testId,
					thread: capture.thread,
					plan: capture.plan,
					provenance: capture.provenance,
				});
			} catch (intentError) {
				console.error('Failed to store test intent:', intentError);
			}
		}

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
				questionCount,
				testId,
				trimmed: questionPaper.trimmed === true,
				salvage: questionPaper.salvage || null,
				intentCaptured: capture !== null,
			},
		});

		return {
			status: 200,
			payload: {
				...stripAnswerKey(storedPaper),
				id: testId,
				personalized,
				tailoredSummary,
			},
		};
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

		return {
			status: statusCode,
			payload: {
				error: message,
				code,
				details: parseError.message,
			},
		};
	}
}

/**
 * Server-sent events variant of the same pipeline: progress events while the
 * paper is generated, then a single `done` (or `error`) event carrying the
 * same payload the JSON endpoint returns.
 */
function streamGenerate(context) {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			const send = (event, data) => {
				try {
					controller.enqueue(
						encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
					);
				} catch {
					// The client disconnected; generation continues and is logged.
				}
			};
			send('progress', {
				stage: 'starting',
				approved: 0,
				requested: context.numQuestions,
				round: 0,
			});
			runGenerationAndStore(context, (progress) => send('progress', progress))
				.then((result) => {
					if (result.status >= 200 && result.status < 300) {
						send('done', result.payload);
					} else {
						send('error', { ...result.payload, status: result.status });
					}
				})
				.catch((error) => {
					send('error', {
						error: 'Generation failed. Please try again.',
						code: 'GENERATION_UNEXPECTED',
						status: 500,
						details: String(error?.message || ''),
					});
				})
				.finally(() => {
					try {
						controller.close();
					} catch {
						// Already closed.
					}
				});
		},
	});
	return new Response(stream, {
		status: 200,
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'x-accel-buffering': 'no',
		},
	});
}

export async function POST({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);
	const user = await getAuthenticatedUser(cookies);
	const clientId = getClientIdFromRequest(request);
	const wantsStream = String(request.headers.get('accept') || '').includes(
		'text/event-stream'
	);

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
			intentCapture = null,
			sectionFocus = null,
			board = null,
			classLevel = null,
			subject = null,
			paperName = null,
			school = null,
			explicit = null,
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

		const explicitFields = new Set(
			(Array.isArray(explicit) ? explicit : [])
				.filter((field) => typeof field === 'string' && field.length > 0)
				.slice(0, 20)
		);
		if (difficultyExplicit === true) {
			explicitFields.add('difficulty');
		}
		const schoolName =
			typeof school === 'string' && school.trim()
				? school.trim().replace(/\s+/g, ' ').slice(0, 120)
				: null;

		// Board and named papers (full exam without a registry exam id) are the
		// premium surface; registry exams stay free.
		if (testMode === 'full-exam' && !examId) {
			const access = await hasPremiumAccess(request, { userId: user?.id });
			if (!access.allowed) {
				await logApiEvent({
					route: '/api/generate',
					action: 'generate_quiz',
					clientKey,
					request,
					statusCode: 403,
					durationMs: Date.now() - startedAt,
					userId: user?.id || null,
					metadata: { code: 'PREMIUM_REQUIRED', reason: access.reason },
				});
				return json(
					{
						error: 'Full exam papers are an early-access feature.',
						code: 'PREMIUM_REQUIRED',
					},
					{ status: 403 }
				);
			}
		}

		const resolvedTopic = topic || (examName ? `${examName} mock paper` : '');
		// Bounded, server-side sanitized: a hostile client cannot smuggle
		// unbounded text into the prompt or the intent table.
		const capture = sanitizeIntentCapture(intentCapture);
		const originalRequest = capture ? buildOriginalRequest(capture.thread) : null;
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
							difficultyExplicit: explicitFields.has('difficulty'),
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

		let effectiveNumQuestions = numQuestions;
		let examPattern = null;
		let focusSection = null;
		const normalizedSectionFocus =
			typeof sectionFocus === 'string' && sectionFocus.trim()
				? sectionFocus.trim().slice(0, 80)
				: null;
		if (testMode === 'full-exam') {
			// Standard exams use a cached pattern opportunistically; a sectional
			// paper needs the pattern, so it discovers one synchronously.
			try {
				examPattern = await getExamPattern(
					{ examId, paperName: paperName || examName, board, classLevel, subject },
					{ language, discover: Boolean(normalizedSectionFocus) }
				);
			} catch (patternError) {
				console.error('Exam pattern resolution failed:', patternError);
			}
			if (examPattern && normalizedSectionFocus) {
				focusSection =
					examPattern.sections.find((section) => section.id === normalizedSectionFocus) ||
					null;
			}
			if (normalizedSectionFocus && !focusSection) {
				return json(
					{
						error: 'That section is not available for this exam',
						code: 'SECTION_NOT_FOUND',
					},
					{ status: 400 }
				);
			}
			if (focusSection) {
				effectiveNumQuestions = Math.min(
					Math.max(Number(focusSection.questionCount) || numQuestions, 1),
					200
				);
			}
		}

		const resolvedParams = resolveGenerationParams({
			request: {
				difficulty,
				numQuestions: effectiveNumQuestions,
				testType,
				durationMinutes,
				explicit: [...explicitFields],
			},
			pattern: examPattern,
			section: focusSection,
			resolvedDifficulty,
		});

		if (testMode === 'full-exam' && examId && !focusSection) {
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

		const patternConstraint = buildPatternConstraint(examPattern, focusSection);
		const generationTopicContext = patternConstraint
			? `${topicContext}\n${patternConstraint}`
			: topicContext;

		// Keep the "previous questions to avoid" context bounded: every past
		// test can hold 100+ questions and 10 tests of that would balloon the
		// prompt into tens of thousands of tokens, slowing every generation.
		const MAX_PREVIOUS_QUESTIONS = 60;
		const previousQuestions = [];
		const seenQuestionKeys = new Set();
		for (const record of previousTestRecords) {
			for (const q of record.test?.questions || []) {
				const displayText = questionTextFor(q);
				const key = comparableText(displayText);
				if (!key || seenQuestionKeys.has(key)) {
					continue;
				}
				seenQuestionKeys.add(key);
				previousQuestions.push({ question: displayText, answer: q.answer });
				if (previousQuestions.length >= MAX_PREVIOUS_QUESTIONS) {
					break;
				}
			}
			if (previousQuestions.length >= MAX_PREVIOUS_QUESTIONS) {
				break;
			}
		}

		const recentTopicQuestions = (
			await getRecentQuestionsForTopic({
				topic: resolvedTopic,
				language,
			}).catch(() => [])
		)
			.map((row) => {
				const value = row?.question;
				if (value && typeof value === 'object') {
					return { ...value, answer: value.answer ?? row.answer };
				}
				return { question: typeof value === 'string' ? value : '', answer: row?.answer };
			})
			.filter((question) => questionTextFor(question));

		const apiKey = env.GEMINI_API_KEY;
		if (!apiKey) {
			return json({ error: 'Gemini API key is not configured' }, { status: 500 });
		}

		const ai = new GoogleGenAI({ apiKey });
		const generationContext = {
			ai,
			startedAt,
			request,
			clientKey,
			user,
			clientId,
			resolvedTopic,
			numQuestions: resolvedParams.numQuestions,
			resolvedDifficulty,
			difficulty,
			testType: resolvedParams.testType,
			topicContext: generationTopicContext,
			examName,
			examStream,
			category,
			selectedTopics,
			syllabusFocus,
			previousQuestions,
			recentQuestions: recentTopicQuestions,
			language,
			testMode,
			objectiveOnly,
			userContext,
			warmUpDifficulty,
			personalized,
			tailoredSummary,
			examId,
			durationMinutes: resolvedParams.durationMinutes,
			examPattern,
			focusSection,
			schoolName,
			originalRequest,
			intentCapture: capture,
			deadlineMs: startedAt + GENERATION_TIMEOUT_MS,
		};

		if (wantsStream) {
			return streamGenerate(generationContext);
		}
		const result = await runGenerationAndStore(generationContext);
		return json(result.payload, { status: result.status });
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
