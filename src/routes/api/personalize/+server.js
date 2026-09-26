import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import * as z from 'zod';
import { rateLimiter } from '$lib/server/rateLimiter';
import { logApiEvent } from '$lib/server/storage';
import { resolveRequestContext } from '$lib/server/apiContext';
import { rateLimited } from '$lib/server/apiResponse';
import {
	InvalidRequestBodyError,
	RequestBodyTooLargeError,
	parseRequestBody,
} from '$lib/server/requestBody';
import { classifyApiError } from '$lib/shared/apiLimitError';
import {
	PERSONALIZE_PAGES,
	buildPersonalizeQuestions,
	derivePersonalize,
} from '$lib/server/personalize';
import {
	buildNudgeQuestions,
	deriveNotificationRanking,
	deriveNudge,
	isNudgeHoldout,
	sanitizeNudgeState,
} from '$lib/server/nudges';

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

// Notification moments always return the ranking (soft-relevance ids drive
// badges even without an interrupt); other moments return the ask itself.
function deriveNudgeResponse(nudgeState, answers, active) {
	if (!active) {
		return null;
	}
	if (nudgeState.page === 'notifications') {
		const ranking = deriveNotificationRanking(answers, nudgeState.candidates);
		return { kind: ranking.pickedId ? 'notify' : null, ...ranking };
	}
	return deriveNudge(nudgeState, answers);
}

export async function POST({ request, cookies }) {
	const { startedAt, clientKey, user, clientId } = await resolveRequestContext(request, cookies);

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

	// Nudge engine: dark unless explicitly enabled. The client slice is
	// validated and clamped here; ineligible moments build no questions and
	// the holdout never sees one.
	const nudgeEnabled = env.NUDGE_ENABLED === 'true';
	const nudgeState = nudgeEnabled ? sanitizeNudgeState(state.nudge, page) : null;
	const nudgeHoldout = Boolean(nudgeState) && isNudgeHoldout(clientId || clientKey);
	const nudgeQuestions = nudgeState && !nudgeHoldout ? buildNudgeQuestions(nudgeState) : {};
	const nudgeActive = Object.keys(nudgeQuestions).length > 0;

	const rateLimit = await rateLimiter(request, {
		bucket: '/api/personalize',
		limit: PERSONALIZE_RATE_LIMIT,
		windowMs: PERSONALIZE_RATE_WINDOW_MS,
	});
	if (rateLimit.limited) {
		return rateLimited(rateLimit);
	}

	const apiKey = env.TYPESAFE_API_KEY;
	if (!apiKey) {
		return json({ error: 'TypeSafe API key is not configured' }, { status: 500 });
	}

	try {
		const ids = Array.isArray(state.ids) ? state.ids.filter((id) => typeof id === 'string').slice(0, 12) : [];
		const questions = { ...buildPersonalizeQuestions(page, { ids }), ...nudgeQuestions };
		if (Object.keys(questions).length === 0) {
			return json({ applied: false, action: null, hide: [], promote: [], nudge: null });
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
		const answers = aiResponse.answers || {};
		const result = derivePersonalize(page, answers, state);
		const nudge = deriveNudgeResponse(nudgeState, answers, nudgeActive);

		await logApiEvent({
			route: '/api/personalize',
			action: 'personalize',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			metadata: {
				page,
				applied: result.applied,
				action: result.action,
				nudge: nudge?.kind ?? null,
				nudgeSuppressed: nudge?.suppressed ?? null,
				nudgeHoldout,
			},
		});

		return json({ ...result, nudge });
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
		return json({ applied: false, action: null, hide: [], promote: [], nudge: null, code });
	}
}
