import { json } from '@sveltejs/kit';
import { getPasskeyGuardState, logApiEvent, removePasskeyForUser } from '$lib/server/storage';
import { canRemovePasskey } from '$lib/shared/passkeyPolicy';
import { rateLimiter } from '$lib/server/rateLimiter';
import { rateLimited } from '$lib/server/apiResponse';
import { readJsonBody } from '$lib/server/requestBody';
import { resolveRequestContext } from '$lib/server/apiContext';

const REMOVE_RATE_LIMIT = 20;

/**
 * Revokes one of the caller's passkeys (archive-first). Removing the last
 * credential of an account with no Google identity is refused, because that
 * combination leaves the account unreachable.
 */
export async function POST({ request, cookies }) {
	const { startedAt, clientKey, clientId, user } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/auth/passkey/remove',
			limit: REMOVE_RATE_LIMIT
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: '/api/auth/passkey/remove',
				action: 'passkey_remove',
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
				{ error: 'Sign in to manage passkeys.', code: 'SESSION_REQUIRED' },
				{ status: 401 }
			);
		}

		const body = await readJsonBody(request);
		const passkeyId = Number(body?.id);
		if (!Number.isInteger(passkeyId) || passkeyId <= 0) {
			return json({ error: 'A passkey id is required.', code: 'PASSKEY_ID_REQUIRED' }, { status: 400 });
		}

		const guard = await getPasskeyGuardState(user.id);
		if (!canRemovePasskey({ passkeyCount: guard.passkeyCount, googleSub: guard.googleSub })) {
			await logApiEvent({
				route: '/api/auth/passkey/remove',
				action: 'passkey_remove',
				clientKey,
				clientId,
				request,
				statusCode: 409,
				durationMs: Date.now() - startedAt,
				errorMessage: 'Last credential without a Google link',
				userId: user.id
			});
			return json(
				{
					error: 'Link a Google account first, or this would be your only way in.',
					code: 'LAST_CREDENTIAL'
				},
				{ status: 409 }
			);
		}

		const removed = await removePasskeyForUser({ userId: user.id, passkeyId });
		if (!removed) {
			return json({ error: 'That passkey was not found.', code: 'PASSKEY_NOT_FOUND' }, { status: 404 });
		}

		await logApiEvent({
			route: '/api/auth/passkey/remove',
			action: 'passkey_remove',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user.id,
			metadata: { passkeyId }
		});

		return json({ removed: true });
	} catch (error) {
		console.error('Failed to remove passkey:', error);
		await logApiEvent({
			route: '/api/auth/passkey/remove',
			action: 'passkey_remove',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
			userId: user?.id ?? null
		});
		return json({ error: 'Unable to remove that passkey.', code: 'PASSKEY_REMOVE_ERROR' }, { status: 500 });
	}
}
