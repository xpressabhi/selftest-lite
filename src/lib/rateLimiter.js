// Rate limiter configuration
const RATE_LIMIT = 10; // requests per minute
const WINDOW_MS = 60 * 1000; // 1 minute in milliseconds

// Store client request timestamps
const requestLog = new Map();

// Clean up old entries every minute
setInterval(() => {
	const now = Date.now();
	for (const [ip, timestamps] of requestLog.entries()) {
		const validTimestamps = timestamps.filter((time) => now - time < WINDOW_MS);
		if (validTimestamps.length === 0) {
			requestLog.delete(ip);
		} else {
			requestLog.set(ip, validTimestamps);
		}
	}
}, WINDOW_MS);

export async function rateLimiter(request) {
	const ip = request.headers.get('x-forwarded-for') || 'unknown';
	const now = Date.now();
	const timestamps = requestLog.get(ip) || [];

	// Remove timestamps older than the window
	const validTimestamps = timestamps.filter((time) => now - time < WINDOW_MS);

	if (validTimestamps.length >= RATE_LIMIT) {
		return {
			limited: true,
			remaining: 0,
			resetTime: validTimestamps[0] + WINDOW_MS,
		};
	}

	// Add current timestamp
	validTimestamps.push(now);
	requestLog.set(ip, validTimestamps);

	return {
		limited: false,
		remaining: RATE_LIMIT - validTimestamps.length,
		resetTime: now + WINDOW_MS,
	};
}
