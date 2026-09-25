import { json } from '@sveltejs/kit';
import { getClientKey, logApiEvent } from '$lib/server/storage';
import {
	buildVisitIdentityKey,
	markTestStarted,
	recordTestVisit,
	testExists,
} from '$lib/server/testStats';
import { getAuthenticatedUser, getClientIdFromRequest } from '$lib/server/auth';
import { rateLimiter } from '$lib/server/rateLimiter';
import { parseRequestBody } from '$lib/server/requestBody';
import { API_LIMIT_ERROR_CODE } from '$lib/shared/apiLimitError';

const ACTIVITY_RATE_LIMIT = 60;
const VALID_EVENTS = new Set(['view', 'start']);

/**
 * Records a visitor opening a test (`view`) or answering their first question
 * (`start`). Identity always comes from the session or the client-id header;
 * the body can never claim someone else. Best-effort by contract: failures
 * are logged and never break the visitor experience.
 */
export async function POST({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/test:activity',
			limit: ACTIVITY_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/test:activity',
				action: 'test_activity',
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
						'X-RateLimit-Limit': String(ACTIVITY_RATE_LIMIT),
						'X-RateLimit-Remaining': rateLimit.remaining.toString(),
						'X-RateLimit-Reset': rateLimit.resetTime.toString(),
					},
				}
			);
		}

		const { testId, event, name } = await parseRequestBody(request);
		const id = Number(testId);
		if (!Number.isInteger(id) || id <= 0) {
			return json({ error: 'Invalid test ID', code: 'INVALID_TEST_ID' }, { status: 400 });
		}
		if (!VALID_EVENTS.has(event)) {
			return json({ error: 'Invalid activity event', code: 'INVALID_EVENT' }, { status: 400 });
		}

		const user = await getAuthenticatedUser(cookies);
		const clientId = getClientIdFromRequest(request);
		if (!buildVisitIdentityKey({ userId: user?.id, clientId })) {
			// Nothing to attribute to; report success so clients do not retry.
			return json({ tracked: false });
		}
		if (!(await testExists(id))) {
			return json({ error: 'Test not found', code: 'TEST_NOT_FOUND' }, { status: 404 });
		}

		if (event === 'view') {
			await recordTestVisit({ testId: id, userId: user?.id, clientId, displayName: name });
		} else {
			await markTestStarted({ testId: id, userId: user?.id, clientId });
		}

		await logApiEvent({
			route: '/api/test:activity',
			action: 'test_activity',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			metadata: { testId: id, event },
		});

		return json({ tracked: true });
	} catch (error) {
		console.error('Test activity tracking failed:', error);
		if (error?.code === 'REQUEST_TOO_LARGE') {
			return json({ error: 'Request is too large', code: 'REQUEST_TOO_LARGE' }, { status: 413 });
		}
		if (error?.code === 'INVALID_REQUEST_BODY') {
			return json(
				{ error: 'Request body must be valid JSON', code: 'INVALID_REQUEST_BODY' },
				{ status: 400 }
			);
		}
		return json({ tracked: false }, { status: 200 });
	}
}
