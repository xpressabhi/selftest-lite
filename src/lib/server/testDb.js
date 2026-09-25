// Test-only database adapter.
//
// When DATABASE_URL uses the `pglite:` scheme, queries run against an
// in-process WASM Postgres (PGlite) instead of Neon. The e2e harness sets the
// scheme; production never does. The package is a devDependency and the import
// specifier is deliberately not statically analyzable, so production bundles
// never include it.

export function isPgliteUrl(connectionString) {
	return typeof connectionString === 'string' && connectionString.startsWith('pglite:');
}

/**
 * Builds a Pool-shaped adapter over a single in-memory PGlite instance.
 * `rowCount` is mapped from PGlite's `affectedRows` so the storage layer's
 * `result.rowCount` checks keep working.
 */
export async function createPglitePool() {
	const moduleName = '@electric-sql/pglite';
	const { PGlite } = await import(/* @vite-ignore */ moduleName);
	const database = new PGlite();
	await database.waitReady;
	return {
		async query(text, params = []) {
			const result = await database.query(text, params);
			return {
				rows: result.rows || [],
				rowCount: result.affectedRows ?? result.rows?.length ?? 0,
				fields: result.fields || [],
			};
		},
		totalCount: 0,
		idleCount: 0,
		waitingCount: 0,
		end: () => database.close(),
	};
}
