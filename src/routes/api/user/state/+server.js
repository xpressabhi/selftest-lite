import { json } from '@sveltejs/kit';
import {
	getStateForIdentity,
	upsertStateForIdentity,
	logApiEvent,
} from '$lib/server/storage';
import { rateLimiter } from '$lib/server/rateLimiter';
import { resolveRequestContext } from '$lib/server/apiContext';
import { rateLimited } from '$lib/server/apiResponse';
import { readJsonBody } from '$lib/server/requestBody';
import {
	MAX_STATE_KEYS_PER_REQUEST,
	isSyncedStateKey,
	validateStateValue,
} from '$lib/shared/userState';

const STATE_GET_RATE_LIMIT = 900;
const STATE_POST_RATE_LIMIT = 300;

export async function GET({ request, cookies }) {
	const { startedAt, clientKey, user, clientId } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/user/state:get',
			limit: STATE_GET_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/user/state',
				action: 'get_user_state',
				clientKey,
				clientId,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
				userId: user?.id || null,
			});
			return rateLimited(rateLimit);
		}

		if (!user?.id && !clientId) {
			await logApiEvent({
				route: '/api/user/state',
				action: 'get_user_state',
				clientKey,
				request,
				statusCode: 401,
				durationMs: Date.now() - startedAt,
			});
			return json(
				{ error: 'Authentication required', code: 'AUTH_REQUIRED' },
				{ status: 401 }
			);
		}

		const storage = await getStateForIdentity({ userId: user?.id, clientId });

		await logApiEvent({
			route: '/api/user/state',
			action: 'get_user_state',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			metadata: { keyCount: Object.keys(storage).length },
		});

		return json({ storage });
	} catch (error) {
		console.error('Failed to fetch user state:', error);
		await logApiEvent({
			route: '/api/user/state',
			action: 'get_user_state',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			errorMessage: error.message,
		});
		return json(
			{ error: 'Failed to fetch user state', code: 'STATE_FETCH_ERROR' },
			{ status: 500 }
		);
	}
}

export async function POST({ request, cookies }) {
	const { startedAt, clientKey, user, clientId } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/user/state:post',
			limit: STATE_POST_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/user/state',
				action: 'upsert_user_state',
				clientKey,
				clientId,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
				userId: user?.id || null,
			});
			return rateLimited(rateLimit);
		}

		if (!user?.id && !clientId) {
			await logApiEvent({
				route: '/api/user/state',
				action: 'upsert_user_state',
				clientKey,
				request,
				statusCode: 401,
				durationMs: Date.now() - startedAt,
			});
			return json(
				{ error: 'Authentication required', code: 'AUTH_REQUIRED' },
				{ status: 401 }
			);
		}

		const body = await readJsonBody(request);
		const rawStorage =
			body?.storage && typeof body.storage === 'object' && !Array.isArray(body.storage)
				? body.storage
				: {};

		const entries = Object.entries(rawStorage).slice(0, MAX_STATE_KEYS_PER_REQUEST);
		let storedCount = 0;
		for (const [key, value] of entries) {
			if (!isSyncedStateKey(key)) {
				continue;
			}
			const safeValue = validateStateValue(value, key);
			if (safeValue === null) {
				continue;
			}
			const didUpsert = await upsertStateForIdentity(
				{ userId: user?.id, clientId },
				key,
				safeValue
			);
			if (didUpsert) {
				storedCount += 1;
			}
		}

		await logApiEvent({
			route: '/api/user/state',
			action: 'upsert_user_state',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			metadata: { received: entries.length, stored: storedCount },
		});

		return json({ success: true, storedKeys: storedCount });
	} catch (error) {
		console.error('Failed to update user state:', error);
		await logApiEvent({
			route: '/api/user/state',
			action: 'upsert_user_state',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			errorMessage: error.message,
		});
		return json(
			{ error: 'Failed to update user state', code: 'STATE_UPDATE_ERROR' },
			{ status: 500 }
		);
	}
}
