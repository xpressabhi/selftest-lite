import { json } from '@sveltejs/kit';
import {
	listAttemptsForIdentity,
	upsertUserTestAttempts,
	logApiEvent,
} from '$lib/server/storage';
import { rateLimiter } from '$lib/server/rateLimiter';
import { resolveRequestContext } from '$lib/server/apiContext';
import { rateLimited } from '$lib/server/apiResponse';
import { readJsonBody } from '$lib/server/requestBody';
import { markTestsSubmitted } from '$lib/server/testStats';

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

export async function GET({ request, cookies }) {
	const { startedAt, clientKey, user, clientId } = await resolveRequestContext(request, cookies);

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
			return rateLimited(rateLimit);
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
				{ status: 401 }
			);
		}

		const attempts = await listAttemptsForIdentity(
			{ userId: user?.id, clientId },
			{ limit: 200 }
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
			{ status: 500 }
		);
	}
}

export async function POST({ request, cookies }) {
	const { startedAt, clientKey, user, clientId } = await resolveRequestContext(request, cookies);

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
			return rateLimited(rateLimit);
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
				{ status: 401 }
			);
		}

		const body = await readJsonBody(request);
		const attempts = Array.isArray(body?.attempts) ? body.attempts.slice(0, 300) : [];
		const storedCount = await upsertUserTestAttempts({ userId: user?.id, clientId }, attempts);

		try {
			const submittedIds = attempts
				.map((attempt) => Number(attempt?.testId))
				.filter((id) => Number.isInteger(id) && id > 0);
			await markTestsSubmitted({ testIds: submittedIds, userId: user?.id || null, clientId });
		} catch (markError) {
			console.error('Failed to mark history submissions:', markError);
		}

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
			{ status: 500 }
		);
	}
}
