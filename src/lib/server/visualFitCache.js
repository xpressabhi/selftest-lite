import { createHash } from 'crypto';
import { ensureStorageSchema, query } from './storage.js';
import { VISUAL_FIT_KEY_VERSION } from './visualFit.js';

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
 * Stable content address for a cached visual-fit verdict. Exact-match by
 * design: identical topic + question + answer + language reuse one row;
 * anything else misses. The judge version travels in
 * VISUAL_FIT_KEY_VERSION, so a criteria change retires old verdicts.
 */
export function buildVisualFitCacheKey({ topic, question, answer, language }) {
	const normalizedLanguage = normalizeText(language).toLowerCase() || 'english';
	return createHash('sha256')
		.update(
			JSON.stringify([
				VISUAL_FIT_KEY_VERSION,
				normalizedLanguage,
				normalizeText(topic ?? ''),
				normalizeText(question ?? ''),
				normalizeText(answer ?? ''),
			])
		)
		.digest('hex');
}

/**
 * Returns the stored verdict or null on a miss. Storage failures propagate;
 * callers fail open and judge the content instead.
 */
export async function getCachedVisualFit(cacheKey) {
	if (!cacheKey) {
		return null;
	}
	await ensureStorageSchema();
	const result = await query(
		`SELECT category, confidence, language, model
		 FROM question_visual_fits
		 WHERE cache_key = $1`,
		[cacheKey]
	);
	const row = result.rows[0];
	if (!row) {
		return null;
	}
	return {
		category: row.category,
		confidence: row.confidence,
		language: row.language,
		model: row.model,
	};
}

/**
 * Stores a freshly judged verdict. Never overwrites an existing row: a
 * concurrent first judgment keeps the one that landed first.
 */
export async function saveVisualFit({ cacheKey, language, category, confidence, model }) {
	if (!cacheKey || !category) {
		return false;
	}
	await ensureStorageSchema();
	await query(
		`INSERT INTO question_visual_fits (cache_key, language, category, confidence, model)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (cache_key) DO NOTHING`,
		[cacheKey, language || 'english', category, confidence ?? null, model || null]
	);
	return true;
}

/** Records a cache hit for retention/auditing. Best-effort at the call site. */
export async function touchVisualFit(cacheKey) {
	if (!cacheKey) {
		return;
	}
	await ensureStorageSchema();
	await query(
		`UPDATE question_visual_fits
		 SET use_count = use_count + 1, last_used_at = NOW()
		 WHERE cache_key = $1`,
		[cacheKey]
	);
}
