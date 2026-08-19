import { json } from '@sveltejs/kit';
import {
	getClientKey,
	getMyAttemptForIdentity,
	getTestRecordById,
	listTestRecords,
	logApiEvent,
} from '$lib/server/storage';
import { getAuthenticatedUser, getClientIdFromRequest } from '$lib/server/auth';
import { rateLimiter } from '$lib/server/rateLimiter';
import { stripAnswerKey } from '$lib/server/paperRedaction';

const SEARCH_RATE_LIMIT = 60;

function rateLimitHeaders(rateLimit) {
	return {
		'X-RateLimit-Limit': String(SEARCH_RATE_LIMIT),
		'X-RateLimit-Remaining': rateLimit.remaining.toString(),
		'X-RateLimit-Reset': rateLimit.resetTime.toString(),
	};
}

export async function GET({ request, url, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);
	const user = await getAuthenticatedUser(cookies);
	const clientId = getClientIdFromRequest(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/test:list',
			limit: SEARCH_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/test:list',
				action: 'list_tests',
				clientKey,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
			});
			return json(
				{
					error: 'Rate limit exceeded. Please try again later.',
					code: 'RATE_LIMIT_EXCEEDED',
					resetTime: new Date(rateLimit.resetTime).toISOString(),
					remaining: rateLimit.remaining,
				},
				{
					status: 429,
					headers: rateLimitHeaders(rateLimit),
				}
			);
		}

		const { searchParams } = url;
		const id = searchParams.get('id');
		const search = searchParams.get('q') || '';
		const limit = searchParams.get('limit') || '10';
		const offset = searchParams.get('offset') || '0';
		const language = searchParams.get('language') || 'all';
		const examType = searchParams.get('examType') || 'all';

		if (!id) {
			const requestedLimit = Math.min(Math.max(Number(limit) || 10, 1), 10);
			const tests = await listTestRecords({
				search,
				limit: requestedLimit + 1,
				offset: Number(offset),
				language,
				examType,
			});
			const hasMore = tests.length > requestedLimit;

			await logApiEvent({
				route: '/api/test:list',
				action: 'list_tests',
				clientKey,
				request,
				statusCode: 200,
				durationMs: Date.now() - startedAt,
				metadata: {
					search: search.trim().slice(0, 100),
					hasMore,
				},
			});

			return json({
				tests: hasMore ? tests.slice(0, requestedLimit) : tests,
				hasMore,
			});
		}

		const testRecord = await getTestRecordById(id);
		if (!testRecord) {
			await logApiEvent({
				route: '/api/test:get',
				action: 'fetch_test',
				clientKey,
				request,
				statusCode: 404,
				durationMs: Date.now() - startedAt,
				metadata: { testId: id },
			});
			return json({ error: 'Test not found', code: 'TEST_NOT_FOUND' }, { status: 404 });
		}

		const myAttempt = await getMyAttemptForIdentity(testRecord.id, {
			userId: user?.id,
			clientId,
		});
		let mappedAttempt = null;
		if (myAttempt) {
			mappedAttempt = {
				score: myAttempt.score,
				totalQuestions: myAttempt.total_questions,
				timeTaken: myAttempt.time_taken,
				submittedAt: myAttempt.submitted_at,
				userAnswers: myAttempt.user_answers || {},
			};
		}

		await logApiEvent({
			route: '/api/test:get',
			action: 'fetch_test',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			metadata: { testId: id },
		});

		return json({
			...stripAnswerKey(testRecord),
			myAttempt: mappedAttempt,
		});
	} catch (error) {
		console.error('Database error:', error);
		return json(
			{ error: 'An error occurred while fetching the test', code: 'TEST_FETCH_ERROR' },
			{ status: 500 }
		);
	}
}
