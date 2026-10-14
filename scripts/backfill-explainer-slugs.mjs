#!/usr/bin/env node
// Backfills public slugs for explainer rows created before public URLs
// existed. Deterministic and idempotent: recomputes the slug from the cache
// key + title and only touches rows that still have none.
//
// Usage: npm run explainers:backfill-slugs

import { neon } from '@neondatabase/serverless';
import { buildExplainerSlug } from '../src/lib/server/explainerSlug.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL is not set — run via npm run explainers:backfill-slugs');
	process.exit(1);
}

const sql = neon(databaseUrl);
const rows = await sql`
	SELECT cache_key, payload->>'title' AS title
	FROM concept_explainers
	WHERE slug IS NULL
`;

for (const row of rows) {
	const slug = buildExplainerSlug({ title: row.title, cacheKey: row.cache_key });
	await sql`
		UPDATE concept_explainers
		SET slug = ${slug}
		WHERE cache_key = ${row.cache_key} AND slug IS NULL
	`;
	console.log(`slugged ${row.cache_key.slice(0, 8)}… -> ${slug}`);
}

console.log(`backfilled ${rows.length} explainer slug(s)`);
