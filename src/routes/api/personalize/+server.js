import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import * as z from 'zod';
import { rateLimiter } from '$lib/server/rateLimiter';
import { getClientKey, logApiEvent } from '$lib/server/storage';
import { getAuthenticatedUser, getClientIdFromRequest } from '$lib/server/auth';
import {
	InvalidRequestBodyError,
	RequestBodyTooLargeError,
	parseRequestBody,
} from '$lib/server/quizValidation';
import { API_LIMIT_ERROR_CODE, classifyApiError } from '$lib/shared/apiLimitError';
import {
	PERSONALIZE_PAGES,
	buildPersonalizeQuestions,
	derivePersonalize,
} from '$lib/server/personalize';

const PERSONALIZE_TIMEOUT_MS = 5000;
const PERSONALIZE_RATE_LIMIT = 30;
const PERSONALIZE_RATE_WINDOW_MS = 60 * 1000;

const requestSchema = z.object({
	page: z.enum(PERSONALIZE_PAGES),
	state: z.record(z.string().max(60), z.unknown()).optional(),
});

function withTimeout(promise, timeoutMs) {
	let timeoutId;
	const timeout = new Promise((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error('Personalization timed out')), timeoutMs);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export async function POST({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);
	const user = await getAuthenticatedUser(cookies);
	const clientId = getClientIdFromRequest(request);

	let body;
	try {
		body = await parseRequestBody(request);
	} catch (error) {
		if (error instanceof RequestBodyTooLargeError) {
			return json({ error: 'Request is too large', code: 'REQUEST_TOO_LARGE' }, { status: 413 });
		}
		if (error instanceof InvalidRequestBodyError) {
			return json({ error: 'Request body must be valid JSON', code: 'INVALID_REQUEST_BODY' }, { status: 400 });
		}
		throw error;
	}

	const parsed = requestSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: 'Unknown personalize page', code: 'INVALID_PAGE' }, { status: 400 });
	}
	const { page, state = {} } = parsed.data;

	const rateLimit = await rateLimiter(request, {
		bucket: '/api/personalize',
		limit: PERSONALIZE_RATE_LIMIT,
		windowMs: PERSONALIZE_RATE_WINDOW_MS,
	});
	if (rateLimit.limited) {
		return json(
			{ error: 'Rate limit exceeded. Please try again later.', code: API_LIMIT_ERROR_CODE },
			{ status: 429 }
		);
	}

	const apiKey = env.TYPESAFE_API_KEY;
	if (!apiKey) {
		return json({ error: 'TypeSafe API key is not configured' }, { status: 500 });
	}

	try {
		const ids = Array.isArray(state.ids) ? state.ids.filter((id) => typeof id === 'string').slice(0, 12) : [];
		const questions = buildPersonalizeQuestions(page, { ids });
		if (Object.keys(questions).length === 0) {
			return json({ applied: false, action: null, hide: [], promote: [] });
		}
		const client = new TypeSafeClient({
			apiKey,
			timeout: 5000,
			retry: { maxRetries: 0, apiTimeoutError: false },
		});
		const aiResponse = await withTimeout(
			client.systemOne({
				state: { page, ...state, ids },
				questions,
				model: 'jev-latest',
			}),
			PERSONALIZE_TIMEOUT_MS
		);
		const result = derivePersonalize(page, aiResponse.answers || {}, state);

		await logApiEvent({
			route: '/api/personalize',
			action: 'personalize',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			metadata: { page, applied: result.applied, action: result.action },
		});

		return json(result);
	} catch (aiError) {
		console.error('Personalization failed (fail-open):', aiError?.message);
		const { statusCode, code } = classifyApiError(aiError, {
			fallbackCode: 'PERSONALIZE_FAILED',
			fallbackMessage: 'Personalization unavailable.',
		});
		await logApiEvent({
			route: '/api/personalize',
			action: 'personalize',
			clientKey,
			clientId,
			request,
			statusCode,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			errorMessage: aiError?.message,
			metadata: { page, failOpen: true },
		});
		// Fail-open: keep the current UI instead of surfacing an error.
		return json({ applied: false, action: null, hide: [], promote: [], code });
	}
}
