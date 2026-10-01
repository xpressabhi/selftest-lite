import { expect, test } from '@playwright/test';
import { TEST_ORIGIN } from './testDb.js';

// The e2e harness points the dev server at an in-memory PGlite database, not the
// production Neon connection. The /api/test/db bridge is only enabled for that
// PGlite adapter, so a 404 here means the server is attached to something else.
//
// That check matters because the failure is silent and destructive: a run
// pointed at production writes spec rows into real tables and real
// api_request_events. Production held 205 /api/test:get rows for
// testId "999999999" — the id smoke.e2e.js navigates to — which is the signature
// of an e2e run that talked to the production database.
test('the dev server is attached to the isolated test database, not production', async ({
	request,
}) => {
	const response = await request.post(`${TEST_ORIGIN}/api/test/db`, {
		data: { sql: 'SELECT 1 AS ok' },
	});

	expect(
		response.status(),
		`/api/test/db returned ${response.status()}. The e2e dev server is not using the ` +
			'PGlite test database, so this run is pointed at DATABASE_URL (production). ' +
			'Stop and fix playwright.config.js / TEST_DATABASE_URL before running specs: ' +
			'every seed and assertion below is writing to the real database.'
	).toBe(200);

	const body = await response.json();
	expect(body.rows?.[0]?.ok).toBe(1);
});
