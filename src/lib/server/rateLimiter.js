import {
	archiveOldRateLimitEvents,
	ensureStorageSchema,
	getClientKey,
	query,
} from './storage';

const DEFAULT_RATE_LIMIT = 10; // requests
const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute

export { DEFAULT_RATE_LIMIT, DEFAULT_WINDOW_MS };

export async function rateLimiter(request, options = {}) {
	const {
		limit = DEFAULT_RATE_LIMIT,
		windowMs = DEFAULT_WINDOW_MS,
		bucket = request.nextUrl?.pathname || 'global',
		userId = null,
	} = options;

	try {
		await ensureStorageSchema();

		const clientKey = getClientKey(request, userId);

		// Insert and count in a single statement so concurrent requests cannot
		// slip between an INSERT and a separate COUNT (the INSERT is visible
		// to the COUNT CTE within the same statement).
		const result = await query(
			`WITH inserted AS (
				INSERT INTO api_rate_limit_events (client_key, route)
				VALUES ($1, $2)
				RETURNING client_key
			),
			window_hits AS (
				SELECT created_at
				FROM api_rate_limit_events
				WHERE client_key = $1
					AND route = $2
					AND created_at >= NOW() - ($3::text || ' milliseconds')::interval
			)
			SELECT
				COUNT(*)::INTEGER AS hit_count,
				COALESCE(
					(EXTRACT(EPOCH FROM (MIN(created_at) + ($3::text || ' milliseconds')::interval)) * 1000)::BIGINT,
					(EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
				) AS reset_time_ms
			FROM window_hits`,
			[clientKey, bucket, windowMs]
		);

		const hitCount = result.rows[0]?.hit_count ?? 0;
		const resetTime = Number(result.rows[0]?.reset_time_ms ?? Date.now() + windowMs);

		// Opportunistic archival keeps the rate-limit table small without a
		// separate cron; rows move to the archive table, never deleted.
		if (Math.random() < 0.02) {
			archiveOldRateLimitEvents().catch((error) => {
				console.error('Rate limit archival failed:', error);
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
		// Fail closed. Failing open meant that any fault isolated to this table —
		// a missing or corrupt `api_rate_limit_events` — silently removed every
		// limit while the endpoints around it kept working, which is the same
		// hole as having no limiter at all. Every caller of this function already
		// needs the database for its own work, so a storage outage fails these
		// routes regardless; denying is the safer of the two failure modes and it
		// is logged loudly rather than silently degrading.
		console.error('Rate limiter storage unavailable (failing closed):', error);
		return {
			limited: true,
			remaining: 0,
			resetTime: Date.now() + windowMs,
		};
	}
}
