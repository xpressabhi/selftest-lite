import { json } from '@sveltejs/kit';
import { getAuthenticatedUser, getClientIdFromRequest, normalizeClientId } from '$lib/server/auth';
import { recordTelemetryEvents, validateTelemetryPayload } from '$lib/server/telemetry';
import { rateLimiter } from '$lib/server/rateLimiter';
import { rateLimited } from '$lib/server/apiResponse';
import { parseRequestBody } from '$lib/server/requestBody';

const TELEMETRY_RATE_LIMIT = 240;

export async function POST({ request, cookies }) {
	const rateLimit = await rateLimiter(request, {
		bucket: '/api/telemetry',
		limit: TELEMETRY_RATE_LIMIT,
	});
	if (rateLimit.limited) {
		return rateLimited(rateLimit);
	}

	let body;
	try {
		body = await parseRequestBody(request);
	} catch {
		return json({ error: 'Invalid JSON body', code: 'INVALID_BODY' }, { status: 400 });
	}

	const validated = validateTelemetryPayload(body);
	if (validated.error) {
		return json(
			{ error: validated.error, code: 'INVALID_TELEMETRY' },
			{ status: validated.status }
		);
	}

	const user = await getAuthenticatedUser(cookies);
	const clientId = normalizeClientId(validated.clientId) || getClientIdFromRequest(request);

	try {
		await recordTelemetryEvents(validated.events, {
			clientId,
			userId: user?.id || null,
		});
	} catch (error) {
		console.error(error);
		// Telemetry must never break the app: report failure to the client
		// silently and drop the batch.
		return json({ error: 'Failed to record telemetry' }, { status: 500 });
	}

	return new Response(null, { status: 204 });
}
