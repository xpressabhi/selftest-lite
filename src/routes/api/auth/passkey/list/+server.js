import { listPasskeysForUser, logApiEvent } from '#lib/server/storage.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';
import { rateLimited } from '#lib/server/apiResponse.js';
import { resolveRequestContext } from '#lib/server/apiContext.js';

const LIST_RATE_LIMIT = 120;

/**
 * The signed-in user's passkeys. Credential ids, public keys and counters never
 * leave the server: the browser only needs labels and dates.
 */
export async function GET({ request, cookies }) {
	const { startedAt, clientKey, clientId, user } = await resolveRequestContext(request, cookies);

	try {
		const rateLimit = await rateLimiter(request, {
			bucket: '/api/auth/passkey/list',
			limit: LIST_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			return rateLimited(rateLimit);
		}

		if (!user) {
			return Response.json(
				{ error: 'Sign in to manage passkeys.', code: 'SESSION_REQUIRED' },
				{ status: 401 }
			);
		}

		const rows = await listPasskeysForUser(user.id);
		const passkeys = rows.map((row) => ({
			id: Number(row.id),
			label: row.label || null,
			deviceType: row.device_type || null,
			backedUp: Boolean(row.backed_up),
			createdAt: row.created_at,
			lastUsedAt: row.last_used_at,
		}));

		await logApiEvent({
			route: '/api/auth/passkey/list',
			action: 'passkey_list',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			userId: user.id,
			metadata: { count: passkeys.length },
		});

		return Response.json({
			passkeys,
			googleLinked: Boolean(user.googleSub),
			googleEmail: user.email || null,
		});
	} catch (error) {
		console.error('Failed to list passkeys:', error);
		await logApiEvent({
			route: '/api/auth/passkey/list',
			action: 'passkey_list',
			clientKey,
			clientId,
			request,
			statusCode: 500,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
			userId: user?.id ?? null,
		});
		return Response.json(
			{ error: 'Unable to load passkeys.', code: 'PASSKEY_LIST_ERROR' },
			{ status: 500 }
		);
	}
}
