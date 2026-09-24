import { createHash } from 'crypto';
import { ensureStorageSchema, query } from './storage.js';

// Bump when the key's composition or normalization changes: old rows stay in
// the table but are never served under the new key semantics.
export const EXPLANATION_CACHE_KEY_VERSION = 'ex-v1';

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
 * Stable content address for a cached explanation. Exact-match by design:
 * identical question + answer + language reuse one row; anything else misses.
 */
export function buildExplanationCacheKey({ question, answer, language }) {
	const normalizedLanguage = normalizeText(language).toLowerCase() || 'english';
	return createHash('sha256')
		.update(
			JSON.stringify([
				EXPLANATION_CACHE_KEY_VERSION,
				normalizedLanguage,
				normalizeText(question),
				normalizeText(answer),
			])
		)
		.digest('hex');
}

/**
 * Returns the stored explanation payload or null on a miss. Storage failures
 * propagate; callers decide whether a cache problem may block generation.
 */
export async function getCachedExplanation(cacheKey) {
	if (!cacheKey) {
		return null;
	}
	await ensureStorageSchema();
	const result = await query(
		`SELECT explanation, language, model
		 FROM question_explanations
		 WHERE cache_key = $1`,
		[cacheKey]
	);
	const row = result.rows[0];
	if (!row) {
		return null;
	}
	return {
		explanation: row.explanation,
		language: row.language,
		model: row.model,
	};
}

/**
 * Stores a freshly generated explanation. Never overwrites an existing row:
 * a concurrent first generation keeps the one that landed first.
 */
export async function saveExplanation({ cacheKey, language, explanation, model }) {
	if (!cacheKey || !explanation) {
		return false;
	}
	await ensureStorageSchema();
	await query(
		`INSERT INTO question_explanations (cache_key, language, explanation, model)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (cache_key) DO NOTHING`,
		[cacheKey, language || 'english', JSON.stringify(explanation), model || null]
	);
	return true;
}

/** Records a cache hit for retention/auditing. Best-effort at the call site. */
export async function touchExplanation(cacheKey) {
	if (!cacheKey) {
		return;
	}
	await ensureStorageSchema();
	await query(
		`UPDATE question_explanations
		 SET use_count = use_count + 1, last_used_at = NOW()
		 WHERE cache_key = $1`,
		[cacheKey]
	);
}
