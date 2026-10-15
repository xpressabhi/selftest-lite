import {
	EXPLAINER_PROVIDER,
	GEMINI_API_KEY,
	OPENCODE_API_KEY,
	OPENCODE_BASE_URL,
	TYPESAFE_API_KEY,
} from '$app/env/private';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { resolveRequestContext } from '#lib/server/apiContext.js';
import { composeArtifactDocument } from '#lib/server/artifactScaffold.js';
import {
	buildExplainerCacheKey,
	getCachedExplainer,
	saveExplainer,
	touchExplainer,
} from '#lib/server/explainerCache.js';
import { recordExplainerForIdentity } from '#lib/server/explainerLibrary.js';
import { generateExplainerArtifact } from '#lib/server/explainerPipeline.js';
import { buildExplainerSlug } from '#lib/server/explainerSlug.js';
import { backfillExplainerSlug } from '#lib/server/explainerCache.js';
import {
	buildQuestionLinkKey,
	recordQuestionExplainerLink,
} from '#lib/server/questionExplainerLinks.js';
import {
	ARTIFACT_BRIEF_MODEL,
	ARTIFACT_RATE_LIMIT,
	MAX_ANSWER_TEXT_LENGTH,
	MAX_QUESTION_TEXT_LENGTH,
	MAX_TOPIC_LENGTH,
	VALID_LANGUAGES,
} from '#lib/server/quizConfig.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';
import { parseRequestBody } from '#lib/server/requestBody.js';
import { logApiEvent } from '#lib/server/storage.js';
import { judgeVisualFit } from '#lib/server/visualFitJudge.js';
import { API_LIMIT_ERROR_CODE, classifyApiError } from '#lib/shared/apiLimitError.js';
import { normalizePlaygroundProfile } from '#lib/shared/playgroundProfile.js';

const ROUTE = '/api/playground';
const ACTION = 'generate_explainer';
// The judge is a metered provider call, so uncached topics get their own
// bucket; refusals still never touch the generation bucket below.
const JUDGE_RATE_LIMIT = 20;
const MAX_SOURCE_TEST_ID_LENGTH = 128;
const MAX_SOURCE_QUESTION_INDEX = 999;

/**
 * The one 429 body every limiter on this route returns, so a caller cannot
 * tell which bucket denied them (and neither can a stale client contract).
 */
function rateLimitedResponse(rateLimit, limit) {
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
				'X-RateLimit-Limit': String(limit),
				'X-RateLimit-Remaining': rateLimit.remaining.toString(),
				'X-RateLimit-Reset': rateLimit.resetTime.toString(),
			},
		}
	);
}

/**
 * Reads the optional `source` provenance field. Only the exact shape is
 * accepted — a test id that trims to 1-128 characters and an integer question
 * index in 0-999 — and anything else is ignored rather than fatal: an
 * unparsable source must still serve the explainer.
 */
function normalizeSource(value) {
	if (!value || typeof value !== 'object') {
		return null;
	}
	// A device-local paper carries a string id while a server-resolved one
	// carries the record's numeric id, so both forms are accepted and
	// coerced to the string the links table stores.
	const rawTestId =
		typeof value.testId === 'string'
			? value.testId
			: Number.isFinite(value.testId) && Number.isInteger(value.testId)
				? String(value.testId)
				: '';
	const testId = rawTestId.trim();
	if (testId.length < 1 || testId.length > MAX_SOURCE_TEST_ID_LENGTH) {
		return null;
	}
	const questionIndex = value.questionIndex;
	if (
		!Number.isInteger(questionIndex) ||
		questionIndex < 0 ||
		questionIndex > MAX_SOURCE_QUESTION_INDEX
	) {
		return null;
	}
	return { testId, questionIndex };
}

export async function POST({ request, cookies }) {
	const { startedAt, clientKey, user, clientId } = await resolveRequestContext(request, cookies);

	try {
		const body = await parseRequestBody(request);
		const { topic, question, answer, language } = body;
		const theme = body.theme === 'dark' ? 'dark' : 'light';
		const provider =
			String(EXPLAINER_PROVIDER || '').toLowerCase() === 'opencode' ? 'opencode' : 'gemini';
		const profile = normalizePlaygroundProfile(body.profile);
		const source = normalizeSource(body.source);

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
			profile,
		});

		// Every served explainer lands in the caller's library, hit or fresh.
		// Best-effort: a library write must never fail the response.
		const identity = { userId: user?.id ?? null, clientId };
		const recordLibraryEntry = async ({ concept, title, summary }) => {
			try {
				await recordExplainerForIdentity(identity, {
					cacheKey,
					concept,
					title,
					summary,
					language: effectiveLanguage,
				});
			} catch (error) {
				console.error('Explainer library record failed', error);
			}
		};

		// Provenance: the served explainer answers a specific question of a
		// specific test. Best-effort like the library write — a link failure
		// must never fail a serve, and an absent or malformed source is simply
		// nothing to record.
		const recordLink = async () => {
			if (!source) {
				return;
			}
			try {
				await recordQuestionExplainerLink(identity, {
					testId: source.testId,
					questionIndex: source.questionIndex,
					questionKey: buildQuestionLinkKey(question, answer),
					cacheKey,
				});
			} catch (error) {
				console.error('Question explainer link record failed', error);
			}
		};

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
			await recordLibraryEntry({
				concept: cached.concept,
				title: cached.payload?.title,
				summary: cached.payload?.summary,
			});
			// Rows created before public URLs existed get their slug lazily;
			// the backfill never overwrites an assigned slug.
			let slug = cached.slug;
			if (!slug) {
				try {
					slug = await backfillExplainerSlug({ cacheKey, title: cached.payload?.title });
				} catch (error) {
					console.error('Explainer slug backfill failed', error);
				}
			}
			await recordLink();
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
				slug,
				html: composeArtifactDocument({
					brief: cached.payload,
					payload: cached.payload,
					language: effectiveLanguage,
					theme,
				}),
				cached: true,
			});
		}

		// The visual-fit gate runs before the generation limiter: an unworthy
		// topic is refused without spending generation quota, and the verdict
		// is cached so repeats stay free. The judge is still a metered provider
		// call, so uncached topics pass their own bucket first — refusals never
		// consume generation quota, but judging an uncached topic never runs
		// unmetered either. judgeVisualFit owns the fail-open contract — no
		// key, an upstream error, or a timeout all suggest the visual — so this
		// route never duplicates that logic.
		const judgeLimit = await rateLimiter(request, {
			bucket: `${ROUTE}:judge`,
			limit: JUDGE_RATE_LIMIT,
		});
		if (judgeLimit.limited) {
			await logApiEvent({
				route: ROUTE,
				action: ACTION,
				clientKey,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
			});
			return rateLimitedResponse(judgeLimit, JUDGE_RATE_LIMIT);
		}

		const judgeClient = TYPESAFE_API_KEY
			? new TypeSafeClient({
					apiKey: TYPESAFE_API_KEY,
					timeout: 5000,
					retry: { maxRetries: 0, apiTimeoutError: false },
				})
			: null;
		const verdict = await judgeVisualFit({
			topic,
			question,
			answer,
			language: effectiveLanguage,
			client: judgeClient,
		});
		if (!verdict.suggested) {
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
					notWorthy: true,
					judgeCategory: verdict.category,
					judgeCached: verdict.cached,
					judgeDegraded: verdict.degraded,
				},
			});
			return Response.json({ code: 'VISUAL_NOT_WORTHY', category: verdict.category });
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

			return rateLimitedResponse(rateLimit, ARTIFACT_RATE_LIMIT);
		}

		const apiKey = provider === 'opencode' ? OPENCODE_API_KEY : GEMINI_API_KEY;

		if (!apiKey) {
			return Response.json(
				{
					error:
						provider === 'opencode'
							? 'Inference API key is not configured'
							: 'Gemini API key is not configured',
				},
				{ status: 500 }
			);
		}

		const { brief, payload, model } = await generateExplainerArtifact({
			topic,
			question,
			answer,
			language: effectiveLanguage,
			apiKey,
			provider,
			baseUrl: OPENCODE_BASE_URL || undefined,
			profile,
		});
		const slug = buildExplainerSlug({ title: brief.title, cacheKey });

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
				model: model,
			});
		} catch (error) {
			// Storage must never fail a good explainer; the next request
			// regenerates and tries to save again.
			console.error('Explainer cache save failed', error);
		}

		await recordLibraryEntry({
			concept: brief.concept,
			title: brief.title,
			summary: brief.summary,
		});
		await recordLink();

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
				provider,
				deviceProfile: `${profile.viewport}-${profile.budget}`,
				briefModel: provider === 'opencode' ? model : ARTIFACT_BRIEF_MODEL,
				artifactModel: model,
				judgeCategory: verdict.category,
				judgeCached: verdict.cached,
				judgeDegraded: verdict.degraded,
			},
		});

		return Response.json({
			title: brief.title,
			summary: brief.summary,
			recipes: brief.recipes,
			slug,
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
