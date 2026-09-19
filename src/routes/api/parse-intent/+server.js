import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { rateLimiter } from '$lib/server/rateLimiter';
import { getClientKey, getStateForIdentity, logApiEvent } from '$lib/server/storage';
import { getAuthenticatedUser, getClientIdFromRequest } from '$lib/server/auth';
import { PROFILE_STATE_KEY, parseProfileStateValue } from '$lib/shared/userProfile';
import { buildStudentContext } from '$lib/server/profile';
import { API_LIMIT_ERROR_CODE, classifyApiError } from '$lib/shared/apiLimitError';
import {
	INTENT_MODEL,
	MAX_RECENT_MESSAGES,
	MAX_RECENT_MESSAGE_CHARS,
	MAX_TOPIC_CANDIDATES,
	VALID_DIFFICULTIES,
	VALID_LANGUAGES,
	VALID_TEST_TYPES,
	buildIntentQuestions,
	buildTopicCandidates,
	deriveIntentParams,
	extractMentionedFields,
} from '$lib/server/intentParse';
import * as z from 'zod';

const PARSE_TIMEOUT_MS = 15000;
const PREVIEW_TIMEOUT_MS = 5000;
const PREVIEW_CLIENT_TIMEOUT_MS = 4000;
// Live previews only carry the fields the message actually mentions; the
// topic Choice is trimmed to keep the payload small.
const PREVIEW_TOPIC_CANDIDATES = 24;
const PARSE_RATE_LIMIT = 100;
const PARSE_RATE_WINDOW_MS = 60 * 1000;

const planSchema = z
	.object({
		topic: z.string().max(500).optional(),
		testType: z.enum(VALID_TEST_TYPES).optional(),
		difficulty: z.enum(VALID_DIFFICULTIES).optional(),
		numQuestions: z.number().int().optional(),
		examId: z.string().max(100).nullable().optional(),
		isFullExam: z.boolean().optional(),
		language: z.enum(VALID_LANGUAGES).optional(),
	})
	.optional()
	.nullable();

const answerValueSchema = z.union([z.string().max(500), z.number(), z.null()]);

const requestSchema = z.object({
	intent: z.string().min(2).max(500),
	mode: z.enum(['turn', 'preview']).optional(),
	plan: planSchema,
	explicit: z.record(z.string().max(40), z.boolean()).optional(),
	answers: z.record(z.string().max(40), answerValueSchema).optional(),
	askedFields: z.array(z.string().max(40)).max(10).optional(),
	skippedFields: z.array(z.string().max(40)).max(10).optional(),
	round: z.number().int().min(0).max(10).optional(),
	recentMessages: z
		.array(
			z.object({
				role: z.enum(['user', 'assistant', 'system']),
				text: z.string().max(MAX_RECENT_MESSAGE_CHARS + 100),
			})
		)
		.max(MAX_RECENT_MESSAGES + 2)
		.optional(),
});

function buildState({ intent, recentMessages, answers, plan, studentContext }) {
	return {
		message: intent,
		recent_messages: (recentMessages || []).map((message) => ({
			role: message.role,
			text: String(message.text || '').slice(0, MAX_RECENT_MESSAGE_CHARS),
		})),
		answered_questions: answers || {},
		current_plan: plan || null,
		student_context: studentContext,
	};
}

function withTimeout(promise, timeoutMs) {
	let timeoutId;
	const timeout = new Promise((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error('Intent parsing timed out')), timeoutMs);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export async function POST({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);
	const user = await getAuthenticatedUser(cookies);
	const clientId = getClientIdFromRequest(request);

	try {
		let body;
		try {
			body = await request.json();
		} catch {
			return json(
				{ error: 'Request body must be valid JSON', code: 'INVALID_REQUEST_BODY' },
				{ status: 400 }
			);
		}

		const parsed = requestSchema.safeParse(body);
		if (!parsed.success) {
			return json(
				{
					error: 'Intent must be a string between 2 and 500 characters',
					code: 'INVALID_INTENT',
				},
				{ status: 400 }
			);
		}

		const {
			intent,
			mode = 'turn',
			plan = null,
			explicit = {},
			answers = {},
			askedFields = [],
			skippedFields = [],
			round = 0,
			recentMessages = [],
		} = parsed.data;
		const isPreview = mode === 'preview';

		const rateLimit = await rateLimiter(request, {
			bucket: '/api/parse-intent',
			limit: PARSE_RATE_LIMIT,
			windowMs: PARSE_RATE_WINDOW_MS,
		});
		if (rateLimit.limited) {
			return json(
				{
					error: 'Rate limit exceeded. Please try again later.',
					code: API_LIMIT_ERROR_CODE,
					remaining: rateLimit.remaining,
				},
				{ status: 429 }
			);
		}

		const apiKey = env.TYPESAFE_API_KEY;
		if (!apiKey) {
			return json({ error: 'TypeSafe API key is not configured' }, { status: 500 });
		}

		let profile = null;
		if (!isPreview && (user?.id || clientId)) {
			try {
				const storage = await getStateForIdentity({ userId: user?.id, clientId });
				profile = parseProfileStateValue(storage?.[PROFILE_STATE_KEY]);
			} catch (profileError) {
				console.error('Failed to load student context:', profileError);
			}
		}
		const studentContext = buildStudentContext(profile);
		const preferredLanguage = profile?.preferences?.language || null;

		try {
			const client = new TypeSafeClient({
				apiKey,
				timeout: isPreview ? PREVIEW_CLIENT_TIMEOUT_MS : 5000,
				retry: {
					maxRetries: isPreview ? 0 : 1,
					apiTimeoutError: false,
					backoffInitialMs: 300,
					backoffMaxMs: 2000,
					maxRetryAfterMs: 3000,
				},
			});

			const candidates = buildTopicCandidates(intent);
			const mentioned = extractMentionedFields(intent);
			const questions = buildIntentQuestions({
				candidates,
				maxCandidates: isPreview ? PREVIEW_TOPIC_CANDIDATES : MAX_TOPIC_CANDIDATES,
				only: isPreview
					? [
							...(mentioned.difficulty ? ['difficulty'] : []),
							...(mentioned.language ? ['language'] : []),
							...(mentioned.testType ? ['test_type'] : []),
							...(mentioned.exam ? ['is_exam', 'exam_id'] : []),
						]
					: null,
			});

			const hasQuestions = Object.keys(questions).length > 0;
			const aiResponse = hasQuestions
				? await withTimeout(
						client.systemOne({
							state: buildState({
								intent,
								recentMessages: isPreview ? [] : recentMessages,
								answers,
								plan,
								studentContext: isPreview ? null : studentContext,
							}),
							questions,
							model: INTENT_MODEL,
						}),
						isPreview ? PREVIEW_TIMEOUT_MS : PARSE_TIMEOUT_MS
					)
				: { answers: {}, model: null, usage: null };

			const result = deriveIntentParams({
				intent,
				judgments: aiResponse.answers || {},
				answers,
				previousPlan: plan,
				explicit,
				askedFields,
				skippedFields,
				round,
				preferredLanguage,
			});

			if (!isPreview) {
				await logApiEvent({
					route: '/api/parse-intent',
					action: 'parse_intent',
					clientKey,
					clientId,
					request,
					statusCode: 200,
					durationMs: Date.now() - startedAt,
					userId: user?.id || null,
					metadata: {
						intent: intent.slice(0, 200),
						provider: 'typesafe',
						model: aiResponse.model,
						round,
						confidence: result.confidence,
						clarifyField: result.clarify?.id || null,
						answeredFields: Object.keys(answers),
						topicSource: result.topicSource,
						fieldConfidence: result.fieldConfidence,
						isFullExam: result.plan.isFullExam,
						usedStudentContext: studentContext !== null,
						usage: aiResponse.usage || null,
					},
				});
			}

			if (isPreview) {
				// Previews fire often; only the fields the card needs go back.
				return json({
					plan: result.plan,
					confidence: result.confidence,
					fieldConfidence: result.fieldConfidence,
					topicSource: result.topicSource,
					usage: aiResponse.usage || null,
					preview: true,
				});
			}

			return json(result);
		} catch (aiError) {
			console.error('Intent parsing failed:', aiError);

			const { statusCode, code, message } = classifyApiError(aiError, {
				fallbackCode: 'PARSE_FAILED',
				fallbackMessage: 'Failed to parse intent. Please try again.',
				limitMessage: 'API limit exceeded. Please retry later.',
				timeoutMessage: 'Intent parsing timed out.',
			});

			await logApiEvent({
				route: '/api/parse-intent',
				action: isPreview ? 'parse_intent_preview' : 'parse_intent',
				clientKey,
				clientId,
				request,
				statusCode,
				durationMs: Date.now() - startedAt,
				userId: user?.id || null,
				errorMessage: aiError.message,
				metadata: {
					intent: intent.slice(0, 200),
					provider: 'typesafe',
					mode: isPreview ? 'preview' : 'turn',
					round,
				},
			});

			return json({ error: message, code }, { status: statusCode });
		}
	} catch (error) {
		console.error('Parse intent unexpected error:', error);

		await logApiEvent({
			route: '/api/parse-intent',
			action: 'parse_intent',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			errorMessage: error.message,
		});

		return json(
			{ error: 'An unexpected error occurred', code: 'PARSE_UNEXPECTED' },
			{ status: 500 }
		);
	}
}
