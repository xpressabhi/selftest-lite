import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { parseRequestBody } from '$lib/server/quizValidation';
import { query } from '$lib/server/storage';
import { isPgliteUrl } from '$lib/server/testDb';

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
	if (!((dev || env.E2E_DB_BRIDGE === '1') && isPgliteUrl(env.DATABASE_URL))) {
		return json({ error: 'Not found' }, { status: 404 });
	}

	try {
		const { sql, params } = await parseRequestBody(request);
		if (typeof sql !== 'string' || sql.trim().length === 0 || sql.length > MAX_SQL_CHARS) {
			return json({ error: 'Invalid SQL' }, { status: 400 });
		}
		const result = await query(sql, Array.isArray(params) ? params : []);
		return json({ rows: result.rows || [] });
	} catch (error) {
		if (error?.code === 'REQUEST_TOO_LARGE') {
			return json({ error: 'Request is too large' }, { status: 413 });
		}
		if (error?.code === 'INVALID_REQUEST_BODY') {
			return json({ error: 'Request body must be valid JSON' }, { status: 400 });
		}
		return json({ error: error?.message || 'Query failed' }, { status: 400 });
	}
}
