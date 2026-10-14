import { createHash } from 'crypto';
import { normalizePlaygroundProfile } from '../shared/playgroundProfile.js';
import { ARTIFACT_PROMPT_VERSION } from './quizConfig.js';
import { ARTIFACT_SCAFFOLD_VERSION } from './artifactScaffold.js';
import { ensureStorageSchema, query } from './storage.js';

// Bump when the key's composition or normalization changes: old rows stay in
// the table but are never served under the new key semantics.
export const ARTIFACT_CACHE_KEY_VERSION = 'pg-v2';

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
 * Stable content address for a cached concept explainer. Exact-match by
 * design: identical concept + context + language + device buckets +
 * prompt/scaffold versions reuse one row; anything else misses.
 */
export function buildExplainerCacheKey({ topic, question, answer, language, profile }) {
	const device = normalizePlaygroundProfile(profile);
	return createHash('sha256')
		.update(
			JSON.stringify([
				ARTIFACT_CACHE_KEY_VERSION,
				ARTIFACT_PROMPT_VERSION,
				ARTIFACT_SCAFFOLD_VERSION,
				normalizeText(language).toLowerCase() || 'english',
				normalizeText(topic),
				normalizeText(question ?? ''),
				normalizeText(answer ?? ''),
				device.viewport,
				device.budget,
			])
		)
		.digest('hex');
}

/**
 * Returns the stored explainer row or null on a miss. Storage failures
 * propagate; callers decide whether a cache problem may block generation.
 */
export async function getCachedExplainer(cacheKey) {
	if (!cacheKey) {
		return null;
	}
	await ensureStorageSchema();
	const result = await query(
		`SELECT payload, language, model, concept
		 FROM concept_explainers
		 WHERE cache_key = $1`,
		[cacheKey]
	);
	const row = result.rows[0];
	if (!row) {
		return null;
	}
	return {
		payload: row.payload,
		language: row.language,
		model: row.model,
		concept: row.concept,
	};
}

/**
 * Stores a freshly generated explainer. Never overwrites an existing row:
 * a concurrent first generation keeps the one that landed first.
 */
export async function saveExplainer({ cacheKey, language, concept, payload, model }) {
	if (!cacheKey || !payload) {
		return false;
	}
	await ensureStorageSchema();
	await query(
		`INSERT INTO concept_explainers (cache_key, language, concept, payload, model)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (cache_key) DO NOTHING`,
		[cacheKey, language || 'english', concept || null, JSON.stringify(payload), model || null]
	);
	return true;
}

/** Records a cache hit for retention/auditing. Best-effort at the call site. */
export async function touchExplainer(cacheKey) {
	if (!cacheKey) {
		return;
	}
	await ensureStorageSchema();
	await query(
		`UPDATE concept_explainers
		 SET use_count = use_count + 1, last_used_at = NOW()
		 WHERE cache_key = $1`,
		[cacheKey]
	);
}
