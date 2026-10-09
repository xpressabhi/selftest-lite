import { json } from '@sveltejs/kit';
import { logApiEvent, getPasskeyGuardState } from '$lib/server/storage';
import { unlinkGoogleFromUser } from '$lib/server/auth';
import { canRemoveLoginMethod, loginMethodCount } from '$lib/shared/passkeyPolicy';
import { rateLimiter } from '$lib/server/rateLimiter';
import { rateLimited } from '$lib/server/apiResponse';
import { resolveRequestContext } from '$lib/server/apiContext';

const UNLINK_RATE_LIMIT = 10;

/**
 * Disconnects Google from the signed-in account. The account is never deleted:
 * only the identity columns are cleared, and only when at least one other way
 * in (a passkey) is left.
 */
export async function POST({ request, cookies }) {
	const { startedAt, clientKey, clientId, user } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/auth/google/unlink',
			limit: UNLINK_RATE_LIMIT
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/auth/google/unlink',
				action: 'google_unlink',
				clientKey,
				clientId,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
				userId: user?.id ?? null
			});
			return rateLimited(rateLimit);
		}

		if (!user) {
			return json(
				{ error: 'Sign in to manage your sign-in methods.', code: 'SESSION_REQUIRED' },
				{ status: 401 }
			);
		}

		const guard = await getPasskeyGuardState(user.id);
		if (!guard.googleSub) {
			return json(
				{ error: 'Google is not connected to this account.', code: 'GOOGLE_NOT_LINKED' },
				{ status: 409 }
			);
		}

		if (!canRemoveLoginMethod({ passkeyCount: guard.passkeyCount, googleSub: guard.googleSub })) {
			await logApiEvent({
				route: '/api/auth/google/unlink',
				action: 'google_unlink',
				clientKey,
				clientId,
				request,
				statusCode: 409,
				durationMs: Date.now() - startedAt,
				errorMessage: 'Last remaining sign-in method',
				userId: user.id,
				metadata: { loginMethodCount: loginMethodCount(guard) }
			});
			return json(
				{
					error: 'Add a passkey first — Google is the only way into this account.',
					code: 'LAST_LOGIN_METHOD'
				},
				{ status: 409 }
			);
		}

		const updatedUser = await unlinkGoogleFromUser(user.id);

		await logApiEvent({
			route: '/api/auth/google/unlink',
			action: 'google_unlink',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user.id,
			// The released identity is recorded here: the account keeps no copy.
			metadata: { releasedEmail: guard.email || null, passkeyCount: guard.passkeyCount }
		});

		return json({ user: updatedUser, googleLinked: false });
	} catch (error) {
		console.error('Failed to disconnect Google:', error);
		await logApiEvent({
			route: '/api/auth/google/unlink',
			action: 'google_unlink',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
			userId: user?.id ?? null
		});
		return json(
			{ error: 'Unable to disconnect Google right now.', code: 'GOOGLE_UNLINK_ERROR' },
			{ status: 500 }
		);
	}
}
