// Shared e2e database helpers.
//
// The dev server owns an in-memory PGlite database (or a real Postgres when
// TEST_DATABASE_URL points at one); specs seed and verify through the dev-only
// /api/test/db bridge. Tests must never read or write DATABASE_URL, which is
// the production connection string.

export const TEST_ORIGIN = 'http://localhost:5174';

/** TEST_DATABASE_URL, defaulting to the in-memory PGlite adapter. */
export function testDatabaseUrl() {
	// Load both files (loadEnvFile never overwrites, so .env.local wins) so
	// specs also pick up admin credentials and other keys from .env.
	for (const file of ['.env.local', '.env']) {
		try {
			process.loadEnvFile(file);
		} catch {
			// Optional file; a pre-set process env also works.
		}
	}
	const testUrl = process.env.TEST_DATABASE_URL || 'pglite://memory';
	const productionUrl = process.env.DATABASE_URL || '';
	if (productionUrl && testUrl === productionUrl) {
		throw new Error('TEST_DATABASE_URL must not point at DATABASE_URL (production)');
	}
	return testUrl;
}

export function isPgliteUrl(connectionString) {
	return typeof connectionString === 'string' && connectionString.startsWith('pglite:');
}

/**
 * Tagged-template SQL client shaped like `neon()`, but every statement goes
 * through the dev server's bridge so the spec process and the app share one
 * database. `sql.query(text, params)` is available for dynamic statements.
 */
export function sqlClient(request) {
	const tagged = async (strings, ...values) => {
		const text = strings.reduce(
			(acc, part, index) => acc + (index > 0 ? `$${index}` : '') + part,
			''
		);
		return tagged.query(text, values);
	};
	tagged.query = async (text, params = []) => {
		const response = await request.post('/api/test/db', { data: { sql: text, params } });
		if (!response.ok()) {
			throw new Error(`test db query failed (${response.status()}): ${await response.text()}`);
		}
		const body = await response.json();
		return body.rows || [];
	};
	return tagged;
}

/** Fails loudly when the bridge is unreachable; DB specs depend on it. */
export async function connectOrSkip(sql) {
	await sql`SELECT 1 AS ok`;
}
