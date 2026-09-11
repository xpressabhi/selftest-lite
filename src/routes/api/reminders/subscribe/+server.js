import { json } from '@sveltejs/kit';
import { getAuthenticatedUser, getClientIdFromRequest } from '$lib/server/auth';
import {
	archivePushSubscription,
	getClientKey,
	logApiEvent,
	savePushSubscription,
} from '$lib/server/storage';
import { rateLimiter } from '$lib/server/rateLimiter';

const SUBSCRIBE_RATE_LIMIT = 20;

export async function POST({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);
	const user = await getAuthenticatedUser(cookies);
	const clientId = getClientIdFromRequest(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/reminders:subscribe',
			limit: SUBSCRIBE_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return json(
				{ error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' },
				{ status: 429 }
			);
		}

		const body = await request.json().catch(() => ({}));
		const subscription = body?.subscription;
		const endpoint = subscription?.endpoint;
		const p256dh = subscription?.keys?.p256dh;
		const auth = subscription?.keys?.auth;

		if (
			typeof endpoint !== 'string' ||
			!endpoint.startsWith('https://') ||
			typeof p256dh !== 'string' ||
			typeof auth !== 'string'
		) {
			return json(
				{ error: 'Invalid subscription', code: 'INVALID_SUBSCRIPTION' },
				{ status: 400 }
			);
		}

		await savePushSubscription({
			clientId,
			userId: user?.id || null,
			endpoint,
			p256dh,
			auth,
			timezone: body?.timezone,
		});

		await logApiEvent({
			route: '/api/reminders/subscribe',
			action: 'subscribe',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
		});

		return json({ success: true });
	} catch (error) {
		console.error('Failed to save push subscription:', error);
		await logApiEvent({
			route: '/api/reminders/subscribe',
			action: 'subscribe',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});
		return json(
			{ error: 'Failed to save subscription', code: 'SUBSCRIPTION_SAVE_ERROR' },
			{ status: 500 }
		);
	}
}

export async function DELETE({ request }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);

	try {
		const body = await request.json().catch(() => ({}));
		const endpoint = body?.endpoint;
		if (typeof endpoint !== 'string' || !endpoint) {
			return json({ error: 'Invalid endpoint', code: 'INVALID_ENDPOINT' }, { status: 400 });
		}

		// Archive-first: unsubscribing moves the row, never deletes it.
		const archived = await archivePushSubscription(endpoint);

		await logApiEvent({
			route: '/api/reminders/subscribe',
			action: 'unsubscribe',
			clientKey,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			metadata: { archived },
		});

		return json({ success: true });
	} catch (error) {
		console.error('Failed to remove push subscription:', error);
		return json(
			{ error: 'Failed to remove subscription', code: 'SUBSCRIPTION_REMOVE_ERROR' },
			{ status: 500 }
		);
	}
}
