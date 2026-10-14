import { resolveRequestContext } from '#lib/server/apiContext.js';
import { composeArtifactDocument } from '#lib/server/artifactScaffold.js';
import {
	getExplainerForIdentity,
	listExplainersForIdentity,
	searchExplainersForIdentity,
} from '#lib/server/explainerLibrary.js';
import { rateLimiter } from '#lib/server/rateLimiter.js';
import { logApiEvent } from '#lib/server/storage.js';
import { API_LIMIT_ERROR_CODE, classifyApiError } from '#lib/shared/apiLimitError.js';

// The caller's explainer library: a list for the playground page, and a
// by-id open that joins the shared cache and composes at serve time. Opening
// never calls a model, which is what makes reviewing saved explainers free.

const ROUTE = '/api/playground/library';
const LIBRARY_RATE_LIMIT = 60;

// Per-identity data must never sit in any browser or service-worker cache.
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

function mapExplainerItem(row) {
	return {
		id: row.id ?? null,
		concept: row.concept,
		title: row.title,
		summary: row.summary,
		language: row.language,
		slug: row.slug,
		openCount: Number(row.open_count ?? 0),
		createdAt: row.created_at,
		lastOpenedAt: row.last_opened_at,
		mine: row.mine === true,
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
				'X-RateLimit-Limit': String(LIBRARY_RATE_LIMIT),
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
		const rateLimit = await rateLimiter(request, {
			bucket: ROUTE,
			limit: LIBRARY_RATE_LIMIT,
		});
		if (rateLimit.limited) {
			await logApiEvent({
				route: ROUTE,
				action: 'read_library',
				clientKey,
				request,
				statusCode: 429,
				durationMs: Date.now() - startedAt,
			});
			return rateLimitedResponse(rateLimit);
		}

		const idParam = Number.parseInt(url.searchParams.get('id') ?? '', 10);
		if (Number.isInteger(idParam) && idParam > 0) {
			const row = await getExplainerForIdentity(identity, idParam);
			if (!row) {
				return Response.json(
					{ error: 'Explainer not found', code: 'EXPLAINER_NOT_FOUND' },
					{ status: 404, headers: NO_STORE_HEADERS }
				);
			}
			const theme = url.searchParams.get('theme') === 'dark' ? 'dark' : 'light';
			await logApiEvent({
				route: ROUTE,
				action: 'open_explainer',
				clientKey,
				request,
				statusCode: 200,
				durationMs: Date.now() - startedAt,
				metadata: { id: row.id, language: row.language },
			});
			return Response.json(
				{
					id: row.id,
					title: row.title,
					summary: row.summary,
					recipes: row.payload?.recipes ?? [],
					slug: row.slug,
					html: composeArtifactDocument({
						brief: row.payload ?? {},
						payload: row.payload ?? {},
						language: row.language,
						theme,
					}),
					cached: true,
				},
				{ headers: NO_STORE_HEADERS }
			);
		}

		const searchTerm = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
		const rows = searchTerm
			? await searchExplainersForIdentity(identity, searchTerm, { limit: 12 })
			: (await listExplainersForIdentity(identity, { limit: 24 })).map((row) => ({
					...row,
					mine: true,
				}));
		await logApiEvent({
			route: ROUTE,
			action: searchTerm ? 'search_explainers' : 'list_explainers',
			clientKey,
			request,
			statusCode: 200,
			durationMs: Date.now() - startedAt,
			metadata: { count: rows.length, search: searchTerm || null },
		});
		return Response.json(
			{
				items: rows.map(mapExplainerItem),
			},
			{ headers: NO_STORE_HEADERS }
		);
	} catch (error) {
		console.error(error);
		const { statusCode, code, message } = classifyApiError(error, {
			fallbackCode: 'LIBRARY_FAILED',
		});
		await logApiEvent({
			route: ROUTE,
			action: 'read_library',
			clientKey,
			request,
			statusCode,
			durationMs: Date.now() - startedAt,
			errorMessage: error.message,
		});
		return Response.json({ error: message, code }, { status: statusCode });
	}
}
