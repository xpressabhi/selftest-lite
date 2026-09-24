import { json } from '@sveltejs/kit';
import { isAdminConfigured, isAdminRequest } from '$lib/server/adminAuth';
import { ensureStorageSchema, query } from '$lib/server/storage';
import { getExamPattern } from '$lib/server/examPattern';
import { rateLimiter } from '$lib/server/rateLimiter';

const PATTERNS_RATE_LIMIT = 30;

async function requireAdmin(request) {
	if (!isAdminConfigured() || !isAdminRequest(request)) {
		return json({ error: 'Unauthorized', code: 'ADMIN_UNAUTHORIZED' }, { status: 401 });
	}
	return null;
}

async function checkRateLimit(request) {
	const rateLimit = await rateLimiter(request, {
		bucket: '/api/admin:patterns',
		limit: PATTERNS_RATE_LIMIT,
	});
	if (rateLimit.limited) {
		return json(
			{
				error: 'Rate limit exceeded. Please try again later.',
				code: 'RATE_LIMIT_EXCEEDED',
				resetTime: new Date(rateLimit.resetTime).toISOString(),
			},
			{ status: 429 }
		);
	}
	return null;
}

/** Admin-only view of every cached exam pattern and its freshness. */
export async function GET({ request }) {
	const unauthorized = await requireAdmin(request);
	if (unauthorized) {
		return unauthorized;
	}
	try {
		const limited = await checkRateLimit(request);
		if (limited) {
			return limited;
		}
		await ensureStorageSchema();
		const result = await query(
			`SELECT
				pattern_key,
				source,
				payload->>'examName' AS exam_name,
				payload->>'patternYear' AS pattern_year,
				payload->'sections' AS sections,
				model,
				fetched_at,
				expires_at,
				(target IS NOT NULL) AS refreshable
			 FROM exam_patterns
			 ORDER BY fetched_at DESC
			 LIMIT 200`
		);
		return json({
			patterns: result.rows.map((row) => ({
				patternKey: row.pattern_key,
				source: row.source,
				examName: row.exam_name,
				patternYear: row.pattern_year,
				sectionCount: Array.isArray(row.sections) ? row.sections.length : 0,
				model: row.model,
				fetchedAt: row.fetched_at,
				expiresAt: row.expires_at,
				refreshable: row.refreshable,
			})),
		});
	} catch (error) {
		console.error(error);
		return json({ error: 'Failed to load exam patterns', code: 'PATTERNS_LIST_ERROR' }, { status: 500 });
	}
}

/** Rediscovers one stored pattern from its original target (admin only). */
export async function POST({ request }) {
	const unauthorized = await requireAdmin(request);
	if (unauthorized) {
		return unauthorized;
	}
	try {
		const limited = await checkRateLimit(request);
		if (limited) {
			return limited;
		}
		const body = await request.json().catch(() => ({}));
		const patternKey = typeof body?.patternKey === 'string' ? body.patternKey.trim() : '';
		if (!patternKey) {
			return json({ error: 'patternKey is required', code: 'PATTERN_KEY_REQUIRED' }, { status: 400 });
		}

		await ensureStorageSchema();
		const row = (
			await query(`SELECT target FROM exam_patterns WHERE pattern_key = $1`, [patternKey])
		).rows[0];
		if (!row) {
			return json({ error: 'Pattern not found', code: 'PATTERN_NOT_FOUND' }, { status: 404 });
		}
		if (!row.target) {
			return json(
				{ error: 'Pattern has no stored target; rediscover it from the surface instead', code: 'NO_TARGET' },
				{ status: 400 }
			);
		}

		const pattern = await getExamPattern(row.target, {
			refresh: true,
			minRefreshAgeMs: 0,
		});
		return json({
			success: true,
			pattern: {
				examName: pattern?.examName || null,
				patternYear: pattern?.patternYear || null,
				sectionCount: Array.isArray(pattern?.sections) ? pattern.sections.length : 0,
				fetchedAt: pattern?.fetchedAt || null,
			},
		});
	} catch (error) {
		console.error(error);
		return json(
			{ error: 'Failed to refresh the exam pattern', code: 'PATTERN_REFRESH_ERROR' },
			{ status: 502 }
		);
	}
}
