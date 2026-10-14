import { createHash } from 'node:crypto';

// Deterministic, human-readable public slugs for explainers. Pure given the
// cache key: the same artifact gets the same URL for every visitor, and a
// recomputation is the backfill for rows created before public URLs existed.

export const SLUG_MAX_BASE_LENGTH = 60;

export function slugifyExplainerTitle(value) {
	return String(value ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+/, '')
		.slice(0, SLUG_MAX_BASE_LENGTH)
		.replace(/-+$/, '');
}

export function buildExplainerSlug({ title, cacheKey }) {
	const base = slugifyExplainerTitle(title) || 'explainer';
	const suffix = createHash('sha256')
		.update(String(cacheKey ?? ''))
		.digest('hex')
		.slice(0, 8);
	return `${base}-${suffix}`;
}
