import {
	cleanupOldRateLimitEvents,
	ensureStorageSchema,
	getClientKey,
	query,
} from './storage';

const DEFAULT_RATE_LIMIT = 10; // requests
const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute

export async function rateLimiter(request, options = {}) {
	const {
		limit = DEFAULT_RATE_LIMIT,
		windowMs = DEFAULT_WINDOW_MS,
		bucket = request.nextUrl?.pathname || 'global',
	} = options;

	try {
		await ensureStorageSchema();

		const clientKey = getClientKey(request);

		await query(
			`INSERT INTO api_rate_limit_events (client_key, route)
			 VALUES ($1, $2)`,
			[clientKey, bucket],
		);

		const result = await query(
			`WITH window_hits AS (
				SELECT created_at
				FROM api_rate_limit_events
				WHERE client_key = $1
					AND route = $2
					AND created_at >= NOW() - ($3::text || ' milliseconds')::interval
				ORDER BY created_at ASC
			)
			SELECT
				COUNT(*)::INTEGER AS hit_count,
				COALESCE(
					(EXTRACT(EPOCH FROM (MIN(created_at) + ($3::text || ' milliseconds')::interval)) * 1000)::BIGINT,
					(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
				) AS reset_time_ms
			FROM window_hits`,
			[clientKey, bucket, windowMs],
		);

		const hitCount = result.rows[0]?.hit_count ?? 0;
		const resetTime = Number(result.rows[0]?.reset_time_ms ?? Date.now() + windowMs);

		// Opportunistic cleanup to keep rate-limit table small without a separate cron.
		if (Math.random() < 0.02) {
			cleanupOldRateLimitEvents().catch((error) => {
				console.error('Rate limit cleanup failed:', error);
			});
		}

		if (hitCount > limit) {
			return {
				limited: true,
				remaining: 0,
				resetTime,
			};
		}

		return {
			limited: false,
			remaining: Math.max(0, limit - hitCount),
			resetTime,
		};
	} catch (error) {
		// Fail-open keeps core functionality alive if rate-limit storage has an issue.
		console.error('Rate limiter fallback (fail-open):', error);
		return {
			limited: false,
			remaining: limit,
			resetTime: Date.now() + windowMs,
		};
	}
}
