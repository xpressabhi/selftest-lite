import { ensureStorageSchema, normalizeAttemptIdentity, query } from './storage.js';

// Per-identity explainer library. Rows are pointers into the shared
// concept_explainers cache: opening one is a join + compose, never a model
// call. Reads follow the attempt-history identity model — a signed-in user
// matches by user_id, an anonymous device by client_id while user_id is NULL.

/**
 * Records that an identity received an explainer. Upsert per (identity,
 * cache_key): regenerating the same concept bumps recency instead of adding a
 * duplicate row. Returns false when there is no identity to attach to.
 */
export async function recordExplainerForIdentity(
	identity,
	{ cacheKey, concept, title, summary, language }
) {
	if (!cacheKey) {
		return false;
	}
	const { userId, clientId } = normalizeAttemptIdentity(identity);
	if (!userId && !clientId) {
		return false;
	}
	await ensureStorageSchema();

	if (userId) {
		await query(
			`INSERT INTO user_explainers (user_id, client_id, cache_key, concept, title, summary, language)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)
			 ON CONFLICT (user_id, cache_key) WHERE user_id IS NOT NULL
			 DO UPDATE SET last_opened_at = NOW()`,
			[
				userId,
				clientId,
				cacheKey,
				concept || null,
				title || null,
				summary || null,
				language || 'english',
			]
		);
		return true;
	}

	await query(
		`INSERT INTO user_explainers (user_id, client_id, cache_key, concept, title, summary, language)
		 VALUES (NULL, $1, $2, $3, $4, $5, $6)
		 ON CONFLICT (client_id, cache_key) WHERE user_id IS NULL
		 DO UPDATE SET last_opened_at = NOW()`,
		[clientId, cacheKey, concept || null, title || null, summary || null, language || 'english']
	);
	return true;
}

/**
 * Lists an identity's explainers, newest-created first. Deduped by cache_key:
 * a signed-in user can also match an older anonymous row for the same concept
 * on the same device, and only the most recent should appear. Ordering is by
 * creation time (the operator's request); opening an item still bumps
 * `last_opened_at`, it just does not reorder the list.
 */
export async function listExplainersForIdentity(identity, { limit = 24 } = {}) {
	const { userId, clientId } = normalizeAttemptIdentity(identity);
	if (!userId && !clientId) {
		return [];
	}
	await ensureStorageSchema();

	const result = await query(
		`SELECT id, concept, title, summary, language, created_at, last_opened_at, open_count, slug, cache_key, source
		 FROM (
			SELECT DISTINCT ON (ue.cache_key) ue.*, c.slug,
				(SELECT json_build_object('testId', l.test_id, 'questionIndex', l.question_index)
				   FROM question_explainer_links l
				  WHERE l.cache_key = ue.cache_key
				    AND (l.user_id = $1 OR (l.user_id IS NULL AND l.client_id = $2))
				  ORDER BY l.updated_at DESC
				  LIMIT 1) AS source
			FROM user_explainers ue
			LEFT JOIN concept_explainers c ON c.cache_key = ue.cache_key
			WHERE (ue.user_id = $1) OR (ue.user_id IS NULL AND ue.client_id = $2)
			ORDER BY ue.cache_key, ue.last_opened_at DESC
		 ) latest
		 ORDER BY created_at DESC
		 LIMIT $3`,
		[userId, clientId, limit]
	);
	return result.rows;
}

/** Escapes LIKE wildcards so user input matches literally. */
function escapeLike(value) {
	return String(value ?? '').replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Searches the caller's own explainers and every already-generated public
 * explainer for a substring match, so replaying an existing artifact is
 * always an option before spending tokens. Own rows win the dedupe by cache
 * key; the merged list is newest-created first.
 */
export async function searchExplainersForIdentity(identity, searchTerm, { limit = 12 } = {}) {
	const term = String(searchTerm ?? '').trim();
	if (!term) {
		return [];
	}
	const { userId, clientId } = normalizeAttemptIdentity(identity);
	await ensureStorageSchema();

	const pattern = `%${escapeLike(term)}%`;
	const ownRows =
		userId || clientId
			? (
					await query(
						`SELECT id, concept, title, summary, language, created_at, last_opened_at, open_count, slug, cache_key, true AS mine
						 FROM (
							SELECT DISTINCT ON (ue.cache_key) ue.*, c.slug
							FROM user_explainers ue
							LEFT JOIN concept_explainers c ON c.cache_key = ue.cache_key
							WHERE ((ue.user_id = $1) OR (ue.user_id IS NULL AND ue.client_id = $2))
							  AND (ue.title ILIKE $3 OR ue.concept ILIKE $3 OR ue.summary ILIKE $3)
							ORDER BY ue.cache_key, ue.last_opened_at DESC
						 ) latest
						 ORDER BY created_at DESC
						 LIMIT $4`,
						[userId, clientId, pattern, limit]
					)
				).rows
			: [];

	const ownKeys = new Set(ownRows.map((row) => row.cache_key));
	const publicRows = (
		await query(
			`SELECT NULL::bigint AS id, c.concept, c.payload->>'title' AS title,
				c.payload->>'summary' AS summary, c.language, c.created_at,
				c.created_at AS last_opened_at, 0 AS open_count, c.slug, c.cache_key, false AS mine
			 FROM concept_explainers c
			 WHERE c.slug IS NOT NULL
			   AND (c.payload->>'title' ILIKE $1 OR c.concept ILIKE $1)
			 ORDER BY c.created_at DESC
			 LIMIT $2`,
			[pattern, limit]
		)
	).rows.filter((row) => !ownKeys.has(row.cache_key));

	return [...ownRows, ...publicRows]
		.sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
		.slice(0, limit);
}

/**
 * Loads one library row plus its cached payload, and bumps the open counters.
 * Returns null when the row does not belong to the identity.
 */
export async function getExplainerForIdentity(identity, id) {
	const { userId, clientId } = normalizeAttemptIdentity(identity);
	if (!userId && !clientId) {
		return null;
	}
	await ensureStorageSchema();

	const result = await query(
		`SELECT ue.id, ue.concept, ue.title, ue.summary, ue.language, ue.open_count, c.payload, c.slug
		 FROM user_explainers ue
		 INNER JOIN concept_explainers c ON c.cache_key = ue.cache_key
		 WHERE ue.id = $1
		   AND (ue.user_id = $2 OR (ue.user_id IS NULL AND ue.client_id = $3))`,
		[id, userId, clientId]
	);
	const row = result.rows[0];
	if (!row) {
		return null;
	}

	await query(
		`UPDATE user_explainers
		 SET open_count = open_count + 1, last_opened_at = NOW()
		 WHERE id = $1`,
		[row.id]
	);
	return row;
}
