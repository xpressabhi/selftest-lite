import { GEMINI_API_KEY } from '$app/env/private';
import { composeArtifactDocument } from '#lib/server/artifactScaffold.js';
import {
	buildExplainerCacheKey,
	getCachedExplainer,
	saveExplainer,
	touchExplainer,
} from '#lib/server/explainerCache.js';
import { generateExplainerArtifact } from '#lib/server/explainerPipeline.js';
import {
	ARTIFACT_BRIEF_MODEL,
	ARTIFACT_MODEL,
	ARTIFACT_RATE_LIMIT,
	MAX_ANSWER_TEXT_LENGTH,
	MAX_QUESTION_TEXT_LENGTH,
	MAX_TOPIC_LENGTH,
	VALID_LANGUAGES,
} from '#lib/server/quizConfig.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';
import { parseRequestBody } from '#lib/server/requestBody.js';
import { getClientKey, logApiEvent } from '#lib/server/storage.js';
import { API_LIMIT_ERROR_CODE, classifyApiError } from '#lib/shared/apiLimitError.js';

const ROUTE = '/api/playground';
const ACTION = 'generate_explainer';

export async function POST({ request }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);

	try {
		const body = await parseRequestBody(request);
		const { topic, question, answer, language } = body;
		const theme = body.theme === 'dark' ? 'dark' : 'light';

		if (!topic) {
			return Response.json(
				{ error: 'A topic is required', code: 'PLAYGROUND_FIELDS_REQUIRED' },
				{ status: 400 }
			);
		}

		if (
			String(topic).length > MAX_TOPIC_LENGTH ||
			(question != null && String(question).length > MAX_QUESTION_TEXT_LENGTH) ||
			(answer != null && String(answer).length > MAX_ANSWER_TEXT_LENGTH)
		) {
			return Response.json(
				{ error: 'The topic or context is too long', code: 'PLAYGROUND_FIELDS_TOO_LONG' },
				{ status: 400 }
			);
		}

		if (
			language &&
			typeof language === 'string' &&
			!VALID_LANGUAGES.includes(language.toLowerCase())
		) {
			return Response.json(
				{ error: 'Invalid language selection', code: 'INVALID_LANGUAGE' },
				{ status: 400 }
			);
		}

		const effectiveLanguage =
			typeof language === 'string' && VALID_LANGUAGES.includes(language.toLowerCase())
				? language.toLowerCase()
				: 'english';
		const cacheKey = buildExplainerCacheKey({
			topic,
			question,
			answer,
			language: effectiveLanguage,
		});

		// Cache hits are served before the rate limiter: they only cost an
		// indexed read, so repeat explainers stay instant and free.
		let cached = null;
		try {
			cached = await getCachedExplainer(cacheKey);
		} catch (error) {
			// A cache read failure must never block generation.
			console.error('Explainer cache read failed', error);
		}

		if (cached) {
			try {
				await touchExplainer(cacheKey);
			} catch (error) {
				console.error('Explainer cache touch failed', error);
			}
			await logApiEvent({
				route: ROUTE,
				action: ACTION,
				clientKey,
				request,
				statusCode: 200,
				durationMs: Date.now() - startedAt,
				metadata: {
					topic,
					language: effectiveLanguage,
					cached: true,
				},
			});
			return Response.json({
				title: cached.payload.title,
				summary: cached.payload.summary,
				recipes: cached.payload.recipes,
				html: composeArtifactDocument({
					brief: cached.payload,
					payload: cached.payload,
					language: effectiveLanguage,
					theme,
				}),
				cached: true,
			});
		}

		// Only generation requests consume rate-limit quota.
		const rateLimit = await rateLimiter(request, {
			bucket: ROUTE,
			limit: ARTIFACT_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: ROUTE,
				action: ACTION,
				clientKey,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
			});

			return Response.json(
				{
					error: 'Rate limit exceeded. Please try again later.',
					code: API_LIMIT_ERROR_CODE,
					resetTime: new Date(rateLimit.resetTime).toISOString(),
					remaining: rateLimit.remaining,
				},
				{
					status: 429,
					headers: {
						'X-RateLimit-Limit': String(ARTIFACT_RATE_LIMIT),
						'X-RateLimit-Remaining': rateLimit.remaining.toString(),
						'X-RateLimit-Reset': rateLimit.resetTime.toString(),
					},
				}
			);
		}

		const apiKey = GEMINI_API_KEY;

		if (!apiKey) {
			return Response.json({ error: 'Gemini API key is not configured' }, { status: 500 });
		}

		const { brief, payload } = await generateExplainerArtifact({
			topic,
			question,
			answer,
			language: effectiveLanguage,
			apiKey,
		});

		try {
			await saveExplainer({
				cacheKey,
				language: effectiveLanguage,
				concept: brief.concept,
				payload: {
					title: brief.title,
					summary: brief.summary,
					recipes: brief.recipes,
					html: payload.html,
					css: payload.css,
					js: payload.js,
				},
				model: ARTIFACT_MODEL,
			});
		} catch (error) {
			// Storage must never fail a good explainer; the next request
			// regenerates and tries to save again.
			console.error('Explainer cache save failed', error);
		}

		await logApiEvent({
			route: ROUTE,
			action: ACTION,
			clientKey,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			metadata: {
				topic,
				language: effectiveLanguage,
				cached: false,
				briefModel: ARTIFACT_BRIEF_MODEL,
				artifactModel: ARTIFACT_MODEL,
			},
		});

		return Response.json({
			title: brief.title,
			summary: brief.summary,
			recipes: brief.recipes,
			html: composeArtifactDocument({ brief, payload, language: effectiveLanguage, theme }),
			cached: false,
		});
	} catch (error) {
		console.error(error);
		if (error?.code === 'REQUEST_TOO_LARGE') {
			return Response.json(
				{ error: 'Request is too large', code: 'REQUEST_TOO_LARGE' },
				{ status: 413 }
			);
		}
		if (error?.code === 'INVALID_REQUEST_BODY') {
			return Response.json(
				{ error: 'Request body must be valid JSON', code: 'INVALID_REQUEST_BODY' },
				{ status: 400 }
			);
		}
		if (error?.code === 'ARTIFACT_INVALID') {
			await logApiEvent({
				route: ROUTE,
				action: ACTION,
				clientKey,
				request,
				statusCode: 500,
				durationMs: Date.now() - startedAt,
				errorMessage: error.message,
				metadata: { generationFailure: error.generationFailure },
			});
			return Response.json(
				{
					error: 'The explainer could not be generated. Please retry.',
					code: 'ARTIFACT_INVALID',
				},
				{ status: 500 }
			);
		}

		const { statusCode, code, message } = classifyApiError(error, {
			fallbackCode: 'EXPLAINER_FAILED',
			timeoutMessage: 'Explainer timed out. Please retry.',
		});

		await logApiEvent({
			route: ROUTE,
			action: ACTION,
			clientKey,
			request,
			statusCode,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
			metadata: error?.generationFailure ? { generationFailure: error.generationFailure } : {},
		});

		return Response.json({ error: message, code }, { status: statusCode });
	}
}
