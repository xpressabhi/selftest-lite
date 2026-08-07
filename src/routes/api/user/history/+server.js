import { json } from '@sveltejs/kit';
import {
	listAttemptsForIdentity,
	upsertUserTestAttempts,
	getClientKey,
	logApiEvent,
} from '$lib/server/storage';
import { getAuthenticatedUser, getClientIdFromRequest } from '$lib/server/auth';
import { rateLimiter } from '$lib/server/rateLimiter';
import { API_LIMIT_ERROR_CODE } from '$lib/shared/apiLimitError';

const HISTORY_GET_RATE_LIMIT = 60;
const HISTORY_POST_RATE_LIMIT = 30;

function mapAttemptRow(row) {
	return {
		testId: row.test_id,
		userAnswers: row.user_answers || {},
		score: row.score,
		totalQuestions: row.total_questions,
		timeTaken: row.time_taken,
		submittedAt: row.submitted_at,
		test: row.test || null,
		topic: row.topic || row.test?.topic || null,
	};
}

function rateLimitedResponse(rateLimit) {
	return json(
		{
			error: 'Rate limit exceeded. Please try again later.',
			code: API_LIMIT_ERROR_CODE,
			resetTime: new Date(rateLimit.resetTime).toISOString(),
			remaining: rateLimit.remaining,
		},
		{ status: 429 },
	);
}

export async function GET({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);
	const user = await getAuthenticatedUser(cookies);
	const clientId = getClientIdFromRequest(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/user/history:get',
			limit: HISTORY_GET_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/user/history',
				action: 'get_user_history',
				clientKey,
				clientId,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
				userId: user?.id || null,
			});
			return rateLimitedResponse(rateLimit);
		}

		if (!user?.id && !clientId) {
			await logApiEvent({
				route: '/api/user/history',
				action: 'get_user_history',
				clientKey,
				request,
				statusCode: 401,
				durationMs: Date.now() - startedAt,
			});
			return json(
				{ error: 'Authentication required', code: 'AUTH_REQUIRED' },
				{ status: 401 },
			);
		}

		const attempts = await listAttemptsForIdentity(
			{ userId: user?.id, clientId },
			{ limit: 200 },
		);

		await logApiEvent({
			route: '/api/user/history',
			action: 'get_user_history',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			metadata: { attemptCount: attempts.length },
		});

		return json({
			attempts: attempts.map(mapAttemptRow),
		});
	} catch (error) {
		console.error('Failed to fetch user history:', error);
		await logApiEvent({
			route: '/api/user/history',
			action: 'get_user_history',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			errorMessage: error.message,
		});
		return json(
			{ error: 'Failed to fetch user history', code: 'HISTORY_FETCH_ERROR' },
			{ status: 500 },
		);
	}
}

export async function POST({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);
	const user = await getAuthenticatedUser(cookies);
	const clientId = getClientIdFromRequest(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/user/history:post',
			limit: HISTORY_POST_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/user/history',
				action: 'upsert_user_history',
				clientKey,
				clientId,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
				userId: user?.id || null,
			});
			return rateLimitedResponse(rateLimit);
		}

		if (!user?.id && !clientId) {
			await logApiEvent({
				route: '/api/user/history',
				action: 'upsert_user_history',
				clientKey,
				request,
				statusCode: 401,
				durationMs: Date.now() - startedAt,
			});
			return json(
				{ error: 'Authentication required', code: 'AUTH_REQUIRED' },
				{ status: 401 },
			);
		}

		const body = await request.json().catch(() => ({}));
		const attempts = Array.isArray(body?.attempts) ? body.attempts.slice(0, 300) : [];
		const storedCount = await upsertUserTestAttempts(
			{ userId: user?.id, clientId },
			attempts,
		);

		await logApiEvent({
			route: '/api/user/history',
			action: 'upsert_user_history',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			metadata: { received: attempts.length, stored: storedCount },
		});

		return json({ success: true, stored: storedCount });
	} catch (error) {
		console.error('Failed to update user history:', error);
		await logApiEvent({
			route: '/api/user/history',
			action: 'upsert_user_history',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			errorMessage: error.message,
		});
		return json(
			{ error: 'Failed to update user history', code: 'HISTORY_UPDATE_ERROR' },
			{ status: 500 },
		);
	}
}
