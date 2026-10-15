import { resolveRequestContext } from '#lib/server/apiContext.js';
import { listQuestionExplainerLinks } from '#lib/server/questionExplainerLinks.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';
import { logApiEvent } from '#lib/server/storage.js';
import { API_LIMIT_ERROR_CODE, classifyApiError } from '#lib/shared/apiLimitError.js';

// Which questions of one test already have a visual explainer for this
// caller, so the results page can restore review cards with one read per test
// instead of probing question by question. Owner-only: the query matches both
// the link and its library row to the caller's identity.

const ROUTE = '/api/playground/links';
const LINKS_RATE_LIMIT = 30;
const MAX_TEST_ID_LENGTH = 128;

// Per-identity data must never sit in any browser or service-worker cache.
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

// One row per recorded link, mapped one-to-one. Two rows for the same
// questionIndex are a legitimate outcome (a signed-in and an older anonymous
// library row both match the caller) and consumers key by questionIndex, so
// nothing is deduped here.
function mapLinkItem(row) {
	return {
		questionIndex: row.questionIndex,
		libraryId: row.libraryId,
		slug: row.slug,
		title: row.title,
		createdAt: row.createdAt,
	};
}

function rateLimitedResponse(rateLimit) {
	return Response.json(
		{
			error: 'Rate limit exceeded. Please try again later.',
			code: API_LIMIT_ERROR_CODE,
			resetTime: new Date(rateLimit.resetTime).toISOString(),
			remaining: rateLimit.remaining,
		},
		{
			status: 429,
			headers: {
				...NO_STORE_HEADERS,
				'X-RateLimit-Limit': String(LINKS_RATE_LIMIT),
				'X-RateLimit-Remaining': rateLimit.remaining.toString(),
				'X-RateLimit-Reset': rateLimit.resetTime.toString(),
			},
		}
	);
}

export async function GET({ request, cookies, url }) {
	const { startedAt, clientKey, user, clientId } = await resolveRequestContext(request, cookies);
	const identity = { userId: user?.id ?? null, clientId };

	try {
		const testId = (url.searchParams.get('testId') ?? '').trim();
		if (testId.length === 0 || testId.length > MAX_TEST_ID_LENGTH) {
			return Response.json(
				{ error: 'A test id is required', code: 'LINKS_TESTID_REQUIRED' },
				{ status: 400, headers: NO_STORE_HEADERS }
			);
		}

		const rateLimit = await rateLimiter(request, {
			bucket: ROUTE,
			limit: LINKS_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: ROUTE,
				action: 'read_links',
				clientKey,
				clientId,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
			});
			return rateLimitedResponse(rateLimit);
		}

		const rows = await listQuestionExplainerLinks(identity, testId);
		await logApiEvent({
			route: ROUTE,
			action: 'read_links',
			clientKey,
			clientId,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			metadata: { count: rows.length },
		});

		return Response.json({ items: rows.map(mapLinkItem) }, { headers: NO_STORE_HEADERS });
	} catch (error) {
		console.error(error);
		const { statusCode, code, message } = classifyApiError(error, {
			fallbackCode: 'LINKS_FAILED',
		});
		await logApiEvent({
			route: ROUTE,
			action: 'read_links',
			clientKey,
			clientId,
			request,
			statusCode,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});
		return Response.json({ error: message, code }, { status: statusCode });
	}
}
