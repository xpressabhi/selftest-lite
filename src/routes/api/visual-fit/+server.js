import { TYPESAFE_API_KEY } from '$app/env/private';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { resolveRequestContext } from '#lib/server/apiContext.js';
import { rateLimited } from '#lib/server/apiResponse.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';
import {
	InvalidRequestBodyError,
	RequestBodyTooLargeError,
	parseRequestBody,
} from '#lib/server/requestBody.js';
import { logApiEvent } from '#lib/server/storage.js';
import { VISUAL_FIT_MODEL } from '#lib/server/visualFit.js';
import { judgeVisualFit } from '#lib/server/visualFitJudge.js';
import {
	MAX_ANSWER_TEXT_LENGTH,
	MAX_QUESTION_TEXT_LENGTH,
	MAX_TOPIC_LENGTH,
	VALID_LANGUAGES,
} from '#lib/server/quizConfig.js';
import { classifyApiError } from '#lib/shared/apiLimitError.js';

const ROUTE = '/api/visual-fit';
const ACTION = 'judge_visual_fit';
// A 20-question review view judges once per question per session, so the
// bucket fits exactly one paper in flight.
const VISUAL_FIT_RATE_LIMIT = 20;

export async function POST({ request, cookies }) {
	const { startedAt, clientKey, clientId } = await resolveRequestContext(request, cookies);

	try {
		const { topic, question, answer, language } = (await parseRequestBody(request)) ?? {};
		const topicText = typeof topic === 'string' ? topic : '';
		const questionText = typeof question === 'string' ? question : '';
		const answerText = typeof answer === 'string' ? answer : '';

		// The judge needs both the question and its answer; the topic only
		// sharpens the context and stays optional.
		if (!questionText.trim() || !answerText.trim()) {
			return Response.json(
				{
					error: 'A question and answer are required',
					code: 'VISUAL_FIT_FIELDS_REQUIRED',
				},
				{ status: 400 }
			);
		}

		if (
			topicText.length > MAX_TOPIC_LENGTH ||
			questionText.length > MAX_QUESTION_TEXT_LENGTH ||
			answerText.length > MAX_ANSWER_TEXT_LENGTH
		) {
			return Response.json(
				{
					error: 'The question or answer is too long',
					code: 'VISUAL_FIT_FIELDS_TOO_LONG',
				},
				{ status: 400 }
			);
		}

		if (
			language &&
			typeof language === 'string' &&
			!VALID_LANGUAGES.includes(language.toLowerCase())
		) {
			return Response.json(
				{
					error: 'Invalid language selection',
					code: 'INVALID_LANGUAGE',
				},
				{ status: 400 }
			);
		}

		const effectiveLanguage =
			typeof language === 'string' && VALID_LANGUAGES.includes(language.toLowerCase())
				? language.toLowerCase()
				: 'english';

		const rateLimit = await rateLimiter(request, {
			bucket: ROUTE,
			limit: VISUAL_FIT_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: ROUTE,
				action: ACTION,
				clientKey,
				clientId,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
			});

			return rateLimited(rateLimit);
		}

		// No key configured is not an error here: judgeVisualFit owns the
		// fail-open contract and returns a degraded verdict for a null client,
		// a provider error, or a timeout.
		const client = TYPESAFE_API_KEY
			? new TypeSafeClient({
					apiKey: TYPESAFE_API_KEY,
					timeout: 5000,
					retry: { maxRetries: 0, apiTimeoutError: false },
				})
			: null;

		const verdict = await judgeVisualFit({
			topic: topicText,
			question: questionText,
			answer: answerText,
			language: effectiveLanguage,
			client,
		});

		await logApiEvent({
			route: ROUTE,
			action: ACTION,
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			metadata: {
				category: verdict.category,
				confidence: verdict.confidence,
				cached: verdict.cached,
				degraded: verdict.degraded,
				model: VISUAL_FIT_MODEL,
			},
		});

		return Response.json(verdict);
	} catch (error) {
		console.error(error);
		if (error instanceof RequestBodyTooLargeError) {
			return Response.json(
				{ error: 'Request is too large', code: 'REQUEST_TOO_LARGE' },
				{ status: 413 }
			);
		}
		if (error instanceof InvalidRequestBodyError) {
			return Response.json(
				{ error: 'Request body must be valid JSON', code: 'INVALID_REQUEST_BODY' },
				{ status: 400 }
			);
		}

		const { statusCode, code, message } = classifyApiError(error, {
			fallbackCode: 'VISUAL_FIT_FAILED',
			fallbackMessage: 'Visual-fit judgment unavailable.',
			timeoutMessage: 'Visual-fit judgment timed out. Please retry.',
		});

		await logApiEvent({
			route: ROUTE,
			action: ACTION,
			clientKey,
			clientId,
			request,
			statusCode,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});

		return Response.json(
			{
				error: message,
				code,
			},
			{ status: statusCode }
		);
	}
}
