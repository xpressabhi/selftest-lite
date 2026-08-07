import { json } from '@sveltejs/kit';
import {
	deleteStateForIdentity,
	getClientKey,
	getStateForIdentity,
	logApiEvent,
	upsertStateForIdentity,
} from '$lib/server/storage';
import { getAuthenticatedUser, getClientIdFromRequest } from '$lib/server/auth';
import { rateLimiter } from '$lib/server/rateLimiter';
import { API_LIMIT_ERROR_CODE } from '$lib/shared/apiLimitError';
import { PROFILE_STATE_KEY, normalizeProfile } from '$lib/shared/userProfile';

const PROFILE_GET_RATE_LIMIT = 60;
const PROFILE_POST_RATE_LIMIT = 30;
const PROFILE_DELETE_RATE_LIMIT = 10;

function rateLimitedResponse(rateLimit) {
	return json(
		{
			error: 'Rate limit exceeded. Please try again later.',
			code: API_LIMIT_ERROR_CODE,
			resetTime: new Date(rateLimit.resetTime).toISOString(),
			remaining: rateLimit.remaining,
		},
		{ status: 429 },
	);
}

async function loadProfile(storage) {
	const profileValue = storage?.[PROFILE_STATE_KEY];
	if (typeof profileValue !== 'string') {
		return null;
	}
	try {
		return normalizeProfile(JSON.parse(profileValue));
	} catch {
		return null;
	}
}

export async function GET({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);
	const user = await getAuthenticatedUser(cookies);
	const clientId = getClientIdFromRequest(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/user/profile:get',
			limit: PROFILE_GET_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return rateLimitedResponse(rateLimit);
		}

		if (!user?.id && !clientId) {
			await logApiEvent({
				route: '/api/user/profile',
				action: 'get_user_profile',
				clientKey,
				request,
				statusCode: 401,
				durationMs: Date.now() - startedAt,
			});
			return json(
				{ error: 'Authentication required', code: 'AUTH_REQUIRED' },
				{ status: 401 },
			);
		}

		const storage = await getStateForIdentity({ userId: user?.id, clientId });
		const profile = await loadProfile(storage);

		await logApiEvent({
			route: '/api/user/profile',
			action: 'get_user_profile',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			metadata: { hasProfile: profile !== null },
		});

		return json({ profile });
	} catch (error) {
		console.error('Failed to fetch user profile:', error);
		await logApiEvent({
			route: '/api/user/profile',
			action: 'get_user_profile',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			errorMessage: error.message,
		});
		return json(
			{ error: 'Failed to fetch user profile', code: 'PROFILE_FETCH_ERROR' },
			{ status: 500 },
		);
	}
}

export async function POST({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);
	const user = await getAuthenticatedUser(cookies);
	const clientId = getClientIdFromRequest(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/user/profile:post',
			limit: PROFILE_POST_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return rateLimitedResponse(rateLimit);
		}

		if (!user?.id && !clientId) {
			await logApiEvent({
				route: '/api/user/profile',
				action: 'upsert_user_profile',
				clientKey,
				request,
				statusCode: 401,
				durationMs: Date.now() - startedAt,
			});
			return json(
				{ error: 'Authentication required', code: 'AUTH_REQUIRED' },
				{ status: 401 },
			);
		}

		const body = await request.json().catch(() => ({}));
		const profile = normalizeProfile(body?.profile);
		if (!profile) {
			await logApiEvent({
				route: '/api/user/profile',
				action: 'upsert_user_profile',
				clientKey,
				clientId,
				request,
				statusCode: 400,
				durationMs: Date.now() - startedAt,
				userId: user?.id || null,
			});
			return json(
				{ error: 'Invalid profile payload', code: 'INVALID_PROFILE' },
				{ status: 400 },
			);
		}

		const didUpsert = await upsertStateForIdentity(
			{ userId: user?.id, clientId },
			PROFILE_STATE_KEY,
			JSON.stringify(profile),
		);

		await logApiEvent({
			route: '/api/user/profile',
			action: 'upsert_user_profile',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			metadata: {
				setupComplete: profile.setupComplete,
				personalized: profile.preferences?.personalized,
				declaredFocusCount: profile.declaredFocus?.length || 0,
			},
		});

		return json({ success: didUpsert, profile });
	} catch (error) {
		console.error('Failed to update user profile:', error);
		await logApiEvent({
			route: '/api/user/profile',
			action: 'upsert_user_profile',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			errorMessage: error.message,
		});
		return json(
			{ error: 'Failed to update user profile', code: 'PROFILE_UPDATE_ERROR' },
			{ status: 500 },
		);
	}
}

export async function DELETE({ request, cookies }) {
	const startedAt = Date.now();
	const clientKey = getClientKey(request);
	const user = await getAuthenticatedUser(cookies);
	const clientId = getClientIdFromRequest(request);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/user/profile:delete',
			limit: PROFILE_DELETE_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return rateLimitedResponse(rateLimit);
		}

		if (!user?.id && !clientId) {
			await logApiEvent({
				route: '/api/user/profile',
				action: 'delete_user_profile',
				clientKey,
				request,
				statusCode: 401,
				durationMs: Date.now() - startedAt,
			});
			return json(
				{ error: 'Authentication required', code: 'AUTH_REQUIRED' },
				{ status: 401 },
			);
		}

		const didDelete = await deleteStateForIdentity(
			{ userId: user?.id, clientId },
			PROFILE_STATE_KEY,
		);

		await logApiEvent({
			route: '/api/user/profile',
			action: 'delete_user_profile',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			metadata: { deleted: didDelete },
		});

		return json({ success: true, deleted: didDelete });
	} catch (error) {
		console.error('Failed to delete user profile:', error);
		await logApiEvent({
			route: '/api/user/profile',
			action: 'delete_user_profile',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			userId: user?.id || null,
			errorMessage: error.message,
		});
		return json(
			{ error: 'Failed to delete user profile', code: 'PROFILE_DELETE_ERROR' },
			{ status: 500 },
		);
	}
}
