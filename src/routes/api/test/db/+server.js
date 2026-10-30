import { dev } from '$app/env';
import { E2E_DB_BRIDGE, DATABASE_URL } from '$app/env/private';
import { parseRequestBody } from '#lib/server/requestBody.js';
import { query, ensureStorageSchema } from '#lib/server/storage.js';
import { clearTestResponseCaches } from '#lib/server/testResponseCache.js';
import { isPgliteUrl } from '#lib/server/testDb.js';

const MAX_SQL_CHARS = 20000;

/**
 * Dev-only SQL bridge for e2e specs.
 *
 * PGlite is single-process, so specs seed through the dev server that owns the
 * in-memory test database. Disabled unless the server runs in dev mode (or the
 * opt-in push suite sets E2E_DB_BRIDGE) AND the database is the PGlite test
 * adapter, so a production deployment can never expose it.
 */
export async function POST({ request }) {
	if (!((dev || E2E_DB_BRIDGE === '1') && isPgliteUrl(DATABASE_URL))) {
		return Response.json({ error: 'Not found' }, { status: 404 });
	}

	try {
		const { sql, params } = await parseRequestBody(request);
		if (typeof sql !== 'string' || sql.trim().length === 0 || sql.length > MAX_SQL_CHARS) {
			return Response.json({ error: 'Invalid SQL' }, { status: 400 });
		}
		await ensureStorageSchema();
		const result = await query(sql, Array.isArray(params) ? params : []);
		// Seeding can make any cached read stale; clearing here keeps the e2e
		// suite deterministic now that GET /api/test serves cached reads.
		clearTestResponseCaches();
		return Response.json({ rows: result.rows || [] });
	} catch (error) {
		if (error?.code === 'REQUEST_TOO_LARGE') {
			return Response.json({ error: 'Request is too large' }, { status: 413 });
		}
		if (error?.code === 'INVALID_REQUEST_BODY') {
			return Response.json({ error: 'Request body must be valid JSON' }, { status: 400 });
		}
		return Response.json({ error: error?.message || 'Query failed' }, { status: 400 });
	}
}
