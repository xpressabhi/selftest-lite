import { json } from '@sveltejs/kit';
import { getClientKey, logApiEvent } from '$lib/server/storage';
import { getTestStats, recordTestVisit } from '$lib/server/testStats';
import { getAuthenticatedUser, getClientIdFromRequest } from '$lib/server/auth';
import { rateLimiter } from '$lib/server/rateLimiter';
import { API_LIMIT_ERROR_CODE } from '$lib/shared/apiLimitError';

const STATS_RATE_LIMIT = 120;

/**
 * Public test stats: visitor / in-progress / submission counters, the public
 * score list, the viewer's own attempt, and daily activity. Answer keys and
 * full breakdowns never leave the owner's result page.
 */
export async function GET({ request, url, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/test:stats',
			limit: STATS_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/test:stats',
				action: 'get_test_stats',
				clientKey,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
			});
			return json(
				{
					error: 'Rate limit exceeded. Please try again later.',
					code: API_LIMIT_ERROR_CODE,
					resetTime: new Date(rateLimit.resetTime).toISOString(),
					remaining: rateLimit.remaining,
				},
				{
					status: 429,
					headers: {
						'X-RateLimit-Limit': String(STATS_RATE_LIMIT),
						'X-RateLimit-Remaining': rateLimit.remaining.toString(),
						'X-RateLimit-Reset': rateLimit.resetTime.toString(),
					},
				}
			);
		}

		const user = await getAuthenticatedUser(cookies);
		const clientId = getClientIdFromRequest(request);
		const testId = Number(url.searchParams.get('id'));
		if (!Number.isInteger(testId) || testId <= 0) {
			return json({ error: 'Invalid test ID', code: 'INVALID_TEST_ID' }, { status: 400 });
		}

		// Loading the stats is itself a way of opening the test, and recording
		// it first makes the viewer's own visit part of the returned counts
		// (no race between the activity ping and this fetch).
		try {
			await recordTestVisit({ testId, userId: user?.id || null, clientId });
		} catch {
			// Unknown tests fall through to the 404 below; bookkeeping is best-effort.
		}

		const stats = await getTestStats(testId, { userId: user?.id, clientId });
		if (!stats) {
			return json({ error: 'Test not found', code: 'TEST_NOT_FOUND' }, { status: 404 });
		}

		await logApiEvent({
			route: '/api/test:stats',
			action: 'get_test_stats',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			metadata: { testId },
		});

		return json(stats, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		console.error('Failed to load test stats:', error);
		await logApiEvent({
			route: '/api/test:stats',
			action: 'get_test_stats',
			clientKey,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});
		return json(
			{ error: 'Failed to load test stats', code: 'STATS_FETCH_ERROR' },
			{ status: 500 }
		);
	}
}
