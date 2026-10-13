import { getPasskeyGuardState, logApiEvent, removePasskeyForUser } from '#lib/server/storage.js';
import { canRemoveLoginMethod, loginMethodCount } from '#lib/shared/passkeyPolicy.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';
import { rateLimited } from '#lib/server/apiResponse.js';
import { readJsonBody } from '#lib/server/requestBody.js';
import { resolveRequestContext } from '#lib/server/apiContext.js';

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
			limit: REMOVE_RATE_LIMIT,
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
				userId: user?.id ?? null,
			});
			return rateLimited(rateLimit);
		}

		if (!user) {
			return Response.json(
				{ error: 'Sign in to manage passkeys.', code: 'SESSION_REQUIRED' },
				{ status: 401 }
			);
		}

		const body = await readJsonBody(request);
		const passkeyId = Number(body?.id);
		if (!Number.isInteger(passkeyId) || passkeyId <= 0) {
			return Response.json(
				{ error: 'A passkey id is required.', code: 'PASSKEY_ID_REQUIRED' },
				{ status: 400 }
			);
		}

		const guard = await getPasskeyGuardState(user.id);
		if (
			!canRemoveLoginMethod({ passkeyCount: guard.passkeyCount, googleSub: guard.googleSub })
		) {
			await logApiEvent({
				route: '/api/auth/passkey/remove',
				action: 'passkey_remove',
				clientKey,
				clientId,
				request,
				statusCode: 409,
				durationMs: Date.now() - startedAt,
				errorMessage: 'Last remaining sign-in method',
				userId: user.id,
				metadata: { loginMethodCount: loginMethodCount(guard) },
			});
			return Response.json(
				{
					error: 'Connect Google first, or this would be your only way in.',
					code: 'LAST_LOGIN_METHOD',
				},
				{ status: 409 }
			);
		}

		const removed = await removePasskeyForUser({ userId: user.id, passkeyId });
		if (!removed) {
			return Response.json(
				{ error: 'That passkey was not found.', code: 'PASSKEY_NOT_FOUND' },
				{ status: 404 }
			);
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
			metadata: { passkeyId },
		});

		return Response.json({ removed: true });
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
			userId: user?.id ?? null,
		});
		return Response.json(
			{ error: 'Unable to remove that passkey.', code: 'PASSKEY_REMOVE_ERROR' },
			{ status: 500 }
		);
	}
}
