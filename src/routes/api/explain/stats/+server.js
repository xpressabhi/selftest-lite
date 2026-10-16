import { getClientKey, logApiEvent } from '#lib/server/storage.js';
import { getExplainerStats } from '#lib/server/explainerStats.js';
import { getAuthenticatedUser, getClientIdFromRequest } from '#lib/server/auth.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';
import { API_LIMIT_ERROR_CODE } from '#lib/shared/apiLimitError.js';

const STATS_RATE_LIMIT = 120;

/**
 * Public explainer stats: how many distinct viewers have opened the page. The
 * request records the caller's own visit first (inside getExplainerStats), so
 * the returned count always includes them.
 */
export async function GET({ request, url, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/explain:stats',
			limit: STATS_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/explain:stats',
				action: 'get_explainer_stats',
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
						'X-RateLimit-Limit': String(STATS_RATE_LIMIT),
						'X-RateLimit-Remaining': rateLimit.remaining.toString(),
						'X-RateLimit-Reset': rateLimit.resetTime.toString(),
					},
				}
			);
		}

		const user = await getAuthenticatedUser(cookies);
		const clientId = getClientIdFromRequest(request);
		const slug = String(url.searchParams.get('slug') ?? '').trim();
		if (!slug) {
			return Response.json({ error: 'Invalid slug', code: 'INVALID_SLUG' }, { status: 400 });
		}

		const stats = await getExplainerStats({ slug, userId: user?.id || null, clientId });
		if (!stats) {
			return Response.json(
				{ error: 'Explainer not found', code: 'EXPLAINER_NOT_FOUND' },
				{ status: 404 }
			);
		}

		await logApiEvent({
			route: '/api/explain:stats',
			action: 'get_explainer_stats',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			metadata: { slug },
		});

		return Response.json(stats, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		console.error('Failed to load explainer stats:', error);
		await logApiEvent({
			route: '/api/explain:stats',
			action: 'get_explainer_stats',
			clientKey,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});
		return Response.json(
			{ error: 'Failed to load explainer stats', code: 'STATS_FETCH_ERROR' },
			{ status: 500 }
		);
	}
}
