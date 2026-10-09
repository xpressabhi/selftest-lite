import { json } from '@sveltejs/kit';
import {
	deleteStateForIdentity,
	getStateForIdentity,
	logApiEvent,
	updateAppUserName,
	upsertStateForIdentity,
} from '$lib/server/storage';
import { mapUserRow } from '$lib/server/auth';
import { normalizeDisplayName } from '$lib/shared/displayName';
import { rateLimiter } from '$lib/server/rateLimiter';
import { resolveRequestContext } from '$lib/server/apiContext';
import { rateLimited } from '$lib/server/apiResponse';
import { readJsonBody } from '$lib/server/requestBody';
import {
	PROFILE_STATE_KEY,
	normalizeProfile,
	parseProfileStateValue,
} from '$lib/shared/userProfile';

const PROFILE_GET_RATE_LIMIT = 60;
const PROFILE_POST_RATE_LIMIT = 30;
const PROFILE_DELETE_RATE_LIMIT = 10;

async function loadProfile(storage) {
	return parseProfileStateValue(storage?.[PROFILE_STATE_KEY]);
}

export async function GET({ request, cookies }) {
	const { startedAt, clientKey, user, clientId } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/user/profile:get',
			limit: PROFILE_GET_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return rateLimited(rateLimit);
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
				{ status: 401 }
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
			{ status: 500 }
		);
	}
}

export async function POST({ request, cookies }) {
	const { startedAt, clientKey, user, clientId } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/user/profile:post',
			limit: PROFILE_POST_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return rateLimited(rateLimit);
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
				{ status: 401 }
			);
		}

		const body = await readJsonBody(request);
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
				{ status: 400 }
			);
		}

		const didUpsert = await upsertStateForIdentity(
			{ userId: user?.id, clientId },
			PROFILE_STATE_KEY,
			JSON.stringify(profile)
		);

		// The display name lives on the account, not in the profile blob, so it
		// is saved here with the rest of the form but written to app_user. An
		// unusable name is refused rather than silently dropped: saving the rest
		// while ignoring the name would look like it worked.
		let updatedUser = null;
		if (user?.id && body?.displayName !== undefined) {
			const displayName = normalizeDisplayName(body.displayName);
			if (!displayName) {
				await logApiEvent({
					route: '/api/user/profile',
					action: 'upsert_user_profile',
					clientKey,
					clientId,
					request,
					statusCode: 400,
					durationMs: Date.now() - startedAt,
					userId: user.id,
					errorMessage: 'Invalid display name',
				});
				return json(
					{
						error: 'Please enter a name between 2 and 40 characters.',
						code: 'INVALID_DISPLAY_NAME',
					},
					{ status: 400 }
				);
			}

			updatedUser = mapUserRow(await updateAppUserName(user.id, displayName));
		}

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
				displayNameUpdated: Boolean(updatedUser),
			},
		});

		return json({ success: didUpsert, profile, user: updatedUser });
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
			{ status: 500 }
		);
	}
}

export async function DELETE({ request, cookies }) {
	const { startedAt, clientKey, user, clientId } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/user/profile:delete',
			limit: PROFILE_DELETE_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return rateLimited(rateLimit);
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
				{ status: 401 }
			);
		}

		const didDelete = await deleteStateForIdentity(
			{ userId: user?.id, clientId },
			PROFILE_STATE_KEY
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
			{ status: 500 }
		);
	}
}
