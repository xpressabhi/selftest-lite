import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '../../utils/auth';
import {
	getClientKey,
	getUserStorageState,
	listUserTestAttemptsWithTests,
	logApiEvent,
	upsertUserStorageState,
	upsertUserTestAttempts,
} from '../../utils/storage';
import { rateLimiter } from '../../utils/rateLimiter';
import { API_LIMIT_ERROR_CODE } from '../../../utils/apiLimitError';

function mapAttemptRow(row) {
	return {
		testId: row.test_id,
		userAnswers: row.user_answers || {},
		score: row.score,
		totalQuestions: row.total_questions,
		timeTaken: row.time_taken,
		submittedAt: row.submitted_at,
		metadata: row.metadata || {},
		test: row.test || null,
		testCreatedAt: row.created_at || null,
	};
}

export async function GET(request) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/user/state:get',
			limit: 60,
			windowMs: 60 * 1000,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/user/state',
				action: 'get_user_state',
				clientKey,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
			});
			return NextResponse.json(
				{
					error: 'Too many requests. Please retry shortly.',
					code: API_LIMIT_ERROR_CODE,
				},
				{
					status: 429,
					headers: {
						'X-RateLimit-Limit': '60',
						'X-RateLimit-Remaining': rateLimit.remaining.toString(),
						'X-RateLimit-Reset': rateLimit.resetTime.toString(),
					},
				},
			);
		}

		const authUser = await getAuthenticatedUser(request);
		if (!authUser?.id) {
			await logApiEvent({
				route: '/api/user/state',
				action: 'get_user_state',
				clientKey,
				statusCode: 401,
				durationMs: Date.now() - startedAt,
			});
			return NextResponse.json(
				{ error: 'Authentication required' },
				{ status: 401 },
			);
		}

		const [storage, attempts] = await Promise.all([
			getUserStorageState(authUser.id),
			listUserTestAttemptsWithTests(authUser.id, { limit: 200 }),
		]);

		return NextResponse.json({
			storage: storage || {},
			attempts: attempts.map(mapAttemptRow),
		});
	} catch (error) {
		console.error('Failed to fetch user state:', error);
		await logApiEvent({
			route: '/api/user/state',
			action: 'get_user_state',
			clientKey,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});
		return NextResponse.json(
			{ error: 'Failed to fetch user state' },
			{ status: 500 },
		);
	}
}

export async function POST(request) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/user/state:post',
			limit: 30,
			windowMs: 60 * 1000,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/user/state',
				action: 'upsert_user_state',
				clientKey,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
			});
			return NextResponse.json(
				{
					error: 'Too many updates. Please retry shortly.',
					code: API_LIMIT_ERROR_CODE,
				},
				{
					status: 429,
					headers: {
						'X-RateLimit-Limit': '30',
						'X-RateLimit-Remaining': rateLimit.remaining.toString(),
						'X-RateLimit-Reset': rateLimit.resetTime.toString(),
					},
				},
			);
		}

		const authUser = await getAuthenticatedUser(request);
		if (!authUser?.id) {
			await logApiEvent({
				route: '/api/user/state',
				action: 'upsert_user_state',
				clientKey,
				statusCode: 401,
				durationMs: Date.now() - startedAt,
			});
			return NextResponse.json(
				{ error: 'Authentication required' },
				{ status: 401 },
			);
		}

		const { storage = {}, attempts = [] } = await request.json();
		const safeStorage =
			storage && typeof storage === 'object' && !Array.isArray(storage)
				? storage
				: {};
		const safeAttempts = Array.isArray(attempts) ? attempts.slice(0, 300) : [];

		const [stateResult, attemptResults] = await Promise.all([
			upsertUserStorageState(authUser.id, safeStorage),
			upsertUserTestAttempts(authUser.id, safeAttempts),
		]);

		return NextResponse.json({
			success: true,
			storedKeys: Object.keys(stateResult?.storage || {}).length,
			storedAttempts: attemptResults.length,
		});
	} catch (error) {
		console.error('Failed to update user state:', error);
		await logApiEvent({
			route: '/api/user/state',
			action: 'upsert_user_state',
			clientKey,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});
		return NextResponse.json(
			{ error: 'Failed to update user state' },
			{ status: 500 },
		);
	}
}
