import { json } from '@sveltejs/kit';
import { recordTelemetryEvents, validateTelemetryPayload } from '$lib/server/telemetry';
import { rateLimiter } from '$lib/server/rateLimiter';

const TELEMETRY_RATE_LIMIT = 120;

export async function POST({ request }) {
	const rateLimit = await rateLimiter(request, {
		bucket: '/api/telemetry',
		limit: TELEMETRY_RATE_LIMIT,
	});
	if (rateLimit.limited) {
		return json(
			{
				error: 'Rate limit exceeded. Please try again later.',
				code: 'RATE_LIMIT_EXCEEDED',
				resetTime: new Date(rateLimit.resetTime).toISOString(),
			},
			{ status: 429 },
		);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, { status: 400 });
	}

	const validated = validateTelemetryPayload(body);
	if (validated.error) {
		return json({ error: validated.error, code: 'INVALID_TELEMETRY' }, { status: validated.status });
	}

	try {
		await recordTelemetryEvents(validated.events);
	} catch (error) {
		console.error(error);
		// Telemetry must never break the app: report failure to the client
		// silently and drop the batch.
		return json({ error: 'Failed to record telemetry' }, { status: 500 });
	}

	return new Response(null, { status: 204 });
}
