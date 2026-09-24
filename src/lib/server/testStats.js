import {
	ensureStorageSchema,
	getMyAttemptForIdentity,
	normalizeUserIdValue,
	query,
} from './storage.js';

const MAX_DISPLAY_NAME = 40;
const MAX_PUBLIC_SCORES = 50;
const MIN_CLIENT_ID_LENGTH = 8;

function normalizeClientId(value) {
	return typeof value === 'string' && value.trim().length >= MIN_CLIENT_ID_LENGTH
		? value.trim().slice(0, 64)
		: null;
}

function toIso(value) {
	if (!value) {
		return null;
	}
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Stable per-test identity. Signed-in users are keyed by their account so
 * visits survive a device change; anonymous visitors by the device id.
 */
export function buildVisitIdentityKey({ userId = null, clientId = null } = {}) {
	const normalizedUserId = normalizeUserIdValue(userId);
	if (normalizedUserId) {
		return `u:${normalizedUserId}`;
	}
	const normalizedClientId = normalizeClientId(clientId);
	return normalizedClientId ? `c:${normalizedClientId}` : null;
}

/** Public names are opt-in and bounded: trim, drop control chars, cap length. */
export function sanitizeDisplayName(value) {
	if (typeof value !== 'string') {
		return null;
	}
	const cleaned = [...value]
		.filter((character) => {
			const code = character.charCodeAt(0);
			return code >= 32 && code !== 127;
		})
		.join('')
		.trim();
	return cleaned ? cleaned.slice(0, MAX_DISPLAY_NAME) : null;
}

/** Profile name first, then the challenge name; null means "anonymous". */
export function resolveDisplayName({ userName = null, challengeName = null } = {}) {
	return sanitizeDisplayName(userName) || sanitizeDisplayName(challengeName) || null;
}

/**
 * Deduplicates, clamps, sorts and caps the public score list. Pure: takes
 * raw joined rows (one per attempt) and returns the display rows.
 */
export function buildPublicScores({ rows = [], viewerKey = null, limit = MAX_PUBLIC_SCORES } = {}) {
	const byIdentity = new Map();
	for (const row of Array.isArray(rows) ? rows : []) {
		const identityKey = typeof row?.identity_key === 'string' ? row.identity_key : null;
		const total = Number(row?.total_questions);
		const score = Number(row?.score);
		const createdAt = toIso(row?.created_at);
		if (!identityKey || !Number.isFinite(total) || total <= 0 || !Number.isFinite(score)) {
			continue;
		}
		if (!createdAt) {
			continue;
		}
		// Keep the most recent attempt per identity (the query already
		// dedupes; this also holds when the rows come from anywhere else).
		const existing = byIdentity.get(identityKey);
		if (existing && existing.createdAt >= createdAt) {
			continue;
		}
		byIdentity.set(identityKey, {
			name: resolveDisplayName({
				userName: row.user_name,
				challengeName: row.display_name,
			}),
			score: Math.min(Math.round(total), Math.max(0, Math.round(score))),
			total: Math.round(total),
			createdAt,
			isMine: identityKey === viewerKey,
		});
	}

	const cappedLimit = Math.min(Math.max(Number(limit) || MAX_PUBLIC_SCORES, 1), MAX_PUBLIC_SCORES);
	return [...byIdentity.values()]
		.sort((a, b) => b.score - a.score || (a.createdAt < b.createdAt ? -1 : 1))
		.slice(0, cappedLimit);
}

export async function testExists(testId) {
	const id = Number(testId);
	if (!Number.isInteger(id) || id <= 0) {
		return false;
	}
	await ensureStorageSchema();
	const result = await query(`SELECT 1 FROM ai_test WHERE id = $1`, [id]);
	return result.rows.length > 0;
}

/** Records (or refreshes) a visitor row. A later name never overwrites one. */
export async function recordTestVisit({ testId, userId = null, clientId = null, displayName = null }) {
	const id = Number(testId);
	const identityKey = buildVisitIdentityKey({ userId, clientId });
	if (!Number.isInteger(id) || id <= 0 || !identityKey) {
		return false;
	}
	await ensureStorageSchema();
	const result = await query(
		`INSERT INTO ai_test_visits (test_id, identity_key, user_id, client_id, display_name)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (test_id, identity_key) DO UPDATE
		   SET last_seen_at = NOW(),
		       display_name = COALESCE(ai_test_visits.display_name, EXCLUDED.display_name)`,
		[
			id,
			identityKey,
			normalizeUserIdValue(userId),
			normalizeClientId(clientId),
			sanitizeDisplayName(displayName),
		]
	);
	return (result.rowCount || 0) > 0;
}

/** Marks that the visitor answered at least one question (first time only). */
export async function markTestStarted({ testId, userId = null, clientId = null }) {
	const id = Number(testId);
	const identityKey = buildVisitIdentityKey({ userId, clientId });
	if (!Number.isInteger(id) || id <= 0 || !identityKey) {
		return false;
	}
	await ensureStorageSchema();
	const result = await query(
		`INSERT INTO ai_test_visits (test_id, identity_key, user_id, client_id, started_at)
		 VALUES ($1, $2, $3, $4, NOW())
		 ON CONFLICT (test_id, identity_key) DO UPDATE
		   SET last_seen_at = NOW(),
		       started_at = COALESCE(ai_test_visits.started_at, NOW())`,
		[id, identityKey, normalizeUserIdValue(userId), normalizeClientId(clientId)]
	);
	return (result.rowCount || 0) > 0;
}

/**
 * Marks submissions for one identity in a single statement. Called from the
 * server-side submit and history paths, so clients never send this event.
 */
export async function markTestsSubmitted({
	testIds = [],
	userId = null,
	clientId = null,
	displayName = null,
} = {}) {
	const identityKey = buildVisitIdentityKey({ userId, clientId });
	const ids = [
		...new Set(
			(Array.isArray(testIds) ? testIds : [])
				.map((value) => Number(value))
				.filter((id) => Number.isInteger(id) && id > 0)
		),
	].slice(0, 300);
	if (!identityKey || ids.length === 0) {
		return 0;
	}
	await ensureStorageSchema();
	const result = await query(
		`INSERT INTO ai_test_visits (test_id, identity_key, user_id, client_id, submitted_at, display_name)
		 SELECT t.id, $2, $3, $4, NOW(), $5
		 FROM ai_test t
		 WHERE t.id = ANY($1::bigint[])
		 ON CONFLICT (test_id, identity_key) DO UPDATE
		   SET submitted_at = COALESCE(ai_test_visits.submitted_at, NOW()),
		       last_seen_at = NOW(),
		       display_name = COALESCE(ai_test_visits.display_name, EXCLUDED.display_name)`,
		[
			ids,
			identityKey,
			normalizeUserIdValue(userId),
			normalizeClientId(clientId),
			sanitizeDisplayName(displayName),
		]
	);
	return result.rowCount || 0;
}

/**
 * Public stats for a test: the three counters, the public score list, the
 * viewer's own attempt, and the daily activity used by the dashboard page.
 * Returns null when the test does not exist.
 */
export async function getTestStats(testId, viewer = {}) {
	const id = Number(testId);
	if (!Number.isInteger(id) || id <= 0) {
		return null;
	}
	await ensureStorageSchema();

	const testResult = await query(`SELECT created_by_user_id FROM ai_test WHERE id = $1`, [id]);
	if (testResult.rows.length === 0) {
		return null;
	}

	const viewerKey = buildVisitIdentityKey(viewer);
	const viewerUserId = normalizeUserIdValue(viewer.userId);
	const viewerClientId = normalizeClientId(viewer.clientId);

	const [visitsResult, submissionsResult, scoreRows, dailyRows, viewerVisit, viewerAttempt] =
		await Promise.all([
			query(
				`SELECT
					COUNT(*)::INTEGER AS visitors,
					COUNT(*) FILTER (WHERE started_at IS NOT NULL AND submitted_at IS NULL)::INTEGER AS in_progress
				 FROM ai_test_visits
				 WHERE test_id = $1`,
				[id]
			),
			query(`SELECT COUNT(*)::INTEGER AS submissions FROM ai_test_attempts WHERE test_id = $1`, [
				id,
			]),
			query(
				`SELECT DISTINCT ON (COALESCE('u:' || a.user_id::text, 'c:' || a.client_id))
					COALESCE('u:' || a.user_id::text, 'c:' || a.client_id) AS identity_key,
					u.name AS user_name,
					v.display_name,
					a.score,
					a.total_questions,
					a.created_at
				 FROM ai_test_attempts a
				 LEFT JOIN app_user u ON u.id = a.user_id
				 LEFT JOIN ai_test_visits v
				   ON v.test_id = a.test_id
				  AND v.identity_key = COALESCE('u:' || a.user_id::text, 'c:' || a.client_id)
				 WHERE a.test_id = $1
				   AND (a.user_id IS NOT NULL OR a.client_id IS NOT NULL)
				 ORDER BY COALESCE('u:' || a.user_id::text, 'c:' || a.client_id), a.created_at DESC`,
				[id]
			),
			query(
				`SELECT
					to_char(day, 'YYYY-MM-DD') AS date,
					(SELECT COUNT(*) FROM ai_test_visits v
					  WHERE v.test_id = $1 AND date_trunc('day', v.first_seen_at) = day)::INTEGER AS visits,
					(SELECT COUNT(*) FROM ai_test_attempts a
					  WHERE a.test_id = $1 AND date_trunc('day', a.created_at) = day)::INTEGER AS submissions
				 FROM generate_series(
					date_trunc('day', NOW()) - INTERVAL '13 days',
					date_trunc('day', NOW()),
					INTERVAL '1 day'
				 ) AS day`,
				[id]
			),
			viewerKey
				? query(`SELECT 1 FROM ai_test_visits WHERE test_id = $1 AND identity_key = $2`, [
						id,
						viewerKey,
					])
				: null,
			viewerKey
				? getMyAttemptForIdentity(id, { userId: viewerUserId, clientId: viewerClientId })
				: null,
		]);

	const ownerId = normalizeUserIdValue(testResult.rows[0]?.created_by_user_id);

	return {
		visitors: Number(visitsResult.rows[0]?.visitors || 0),
		inProgress: Number(visitsResult.rows[0]?.in_progress || 0),
		submissions: Number(submissionsResult.rows[0]?.submissions || 0),
		scores: buildPublicScores({ rows: scoreRows.rows, viewerKey }),
		myAttempt: viewerAttempt
			? {
					score: viewerAttempt.score,
					total: viewerAttempt.total_questions,
					marks: viewerAttempt.marks === null ? null : Number(viewerAttempt.marks),
					totalMarks:
						viewerAttempt.total_marks === null ? null : Number(viewerAttempt.total_marks),
					createdAt: toIso(viewerAttempt.submitted_at),
				}
			: null,
		viewer: {
			hasVisited: Boolean(viewerVisit?.rows?.length),
			hasAttempted: Boolean(viewerAttempt),
		},
		isOwner: Boolean(ownerId && viewerUserId && ownerId === viewerUserId),
		daily: dailyRows.rows.map((row) => ({
			date: row.date,
			visits: Number(row.visits || 0),
			submissions: Number(row.submissions || 0),
		})),
	};
}
