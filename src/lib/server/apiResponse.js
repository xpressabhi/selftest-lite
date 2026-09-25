import { json } from '@sveltejs/kit';
import { API_LIMIT_ERROR_CODE } from '$lib/shared/apiLimitError';

/**
 * The one 429 body for every rate-limited API route. Keeping it here fixes the
 * `resetTime`/`remaining` shape in one place instead of 20+ hand-written copies.
 */
export function rateLimited(rateLimit) {
	return json(
		{
			error: 'Rate limit exceeded. Please try again later.',
			code: API_LIMIT_ERROR_CODE,
			resetTime: new Date(rateLimit.resetTime).toISOString(),
			remaining: rateLimit.remaining,
		},
		{ status: 429 }
	);
}
