import { ensureStorageSchema, normalizeAttemptIdentity, query } from './storage.js';

// Per-identity pointer from one question of one test to the explainer that
// answers it. Review cards use it to restore their visuals; the playground
// reads it as provenance. It mirrors user_explainers: a signed-in user
// matches by user_id, an anonymous device by client_id while user_id is
// NULL, and re-recording the same (identity, test, question) replaces the
// cache key in place. Upserts only; nothing is deleted (see AGENTS.md).

export const UPSERT_USER_QUESTION_EXPLAINER_LINK_SQL = `INSERT INTO question_explainer_links (user_id, client_id, test_id, question_index, question_key, cache_key)
 VALUES ($1, $2, $3, $4, $5, $6)
 ON CONFLICT (user_id, test_id, question_index) WHERE user_id IS NOT NULL
 DO UPDATE SET cache_key = EXCLUDED.cache_key, question_key = EXCLUDED.question_key, updated_at = NOW()`;

export const UPSERT_CLIENT_QUESTION_EXPLAINER_LINK_SQL = `INSERT INTO question_explainer_links (user_id, client_id, test_id, question_index, question_key, cache_key)
 VALUES (NULL, $1, $2, $3, $4, $5)
 ON CONFLICT (client_id, test_id, question_index) WHERE user_id IS NULL
 DO UPDATE SET cache_key = EXCLUDED.cache_key, question_key = EXCLUDED.question_key, updated_at = NOW()`;

// Both the link and the library row must belong to the caller, or the same
// cache key on another identity would leak into the review card. The shared
// concept row is optional (LEFT JOIN): a pool miss only costs the slug.
export const LIST_QUESTION_EXPLAINER_LINKS_SQL = `SELECT l.question_index, l.cache_key, l.question_key, l.created_at,
       ue.id AS library_id, ue.title, c.slug
 FROM question_explainer_links l
 INNER JOIN user_explainers ue
   ON ue.cache_key = l.cache_key
  AND (ue.user_id = $2 OR (ue.user_id IS NULL AND ue.client_id = $3))
 LEFT JOIN concept_explainers c ON c.cache_key = l.cache_key
 WHERE l.test_id = $1
   AND (l.user_id = $2 OR (l.user_id IS NULL AND l.client_id = $3))
 ORDER BY l.created_at DESC`;

/**
 * NFC-normalizes, trims and collapses internal whitespace. Case is preserved
 * because symbols and variables (N vs n, CO2 vs co2) are case-sensitive.
 */
function normalizeText(value) {
	return String(value ?? '')
		.normalize('NFC')
		.trim()
		.replace(/\s+/g, ' ');
}

/**
 * Stable key for one question and its answer, so the same question in a
 * regenerated test maps to the same stored link. Human-readable by design:
 * an operator can read which question a link answers.
 */
export function buildQuestionLinkKey(question, answer) {
	return `${normalizeText(question)}::${normalizeText(answer)}`;
}

/**
 * Records that an explainer answers one question of one test for an identity.
 * Returns false when there is no identity or a required field is missing.
 */
export async function recordQuestionExplainerLink(
	identity,
	{ testId, questionIndex, questionKey, cacheKey } = {}
) {
	if (!testId || !cacheKey) {
		return false;
	}
	const { userId, clientId } = normalizeAttemptIdentity(identity);
	if (!userId && !clientId) {
		return false;
	}
	await ensureStorageSchema();

	if (userId) {
		await query(UPSERT_USER_QUESTION_EXPLAINER_LINK_SQL, [
			userId,
			clientId ?? null,
			testId,
			questionIndex,
			questionKey,
			cacheKey,
		]);
		return true;
	}

	await query(UPSERT_CLIENT_QUESTION_EXPLAINER_LINK_SQL, [
		clientId,
		testId,
		questionIndex,
		questionKey,
		cacheKey,
	]);
	return true;
}

/**
 * Lists the caller's explainer links for one test, newest-created first.
 * Links without a matching library row are omitted, not rendered empty.
 */
export async function listQuestionExplainerLinks(identity, testId) {
	if (!testId) {
		return [];
	}
	const { userId, clientId } = normalizeAttemptIdentity(identity);
	if (!userId && !clientId) {
		return [];
	}
	await ensureStorageSchema();

	const result = await query(LIST_QUESTION_EXPLAINER_LINKS_SQL, [testId, userId, clientId]);
	return result.rows.map((row) => ({
		questionIndex: Number(row.question_index),
		cacheKey: row.cache_key,
		questionKey: row.question_key,
		createdAt: row.created_at,
		libraryId: row.library_id,
		title: row.title,
		slug: row.slug ?? null,
	}));
}
