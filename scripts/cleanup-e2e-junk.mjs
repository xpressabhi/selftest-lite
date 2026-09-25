// One-off cleanup for e2e junk rows that older runs wrote to the production
// database, before TEST_DATABASE_URL isolation existed. Dry-run by default;
// pass --apply to execute.
//
// Deletes are intentionally unarchived per explicit owner approval: these are
// synthetic test rows, not user data. Telemetry (feature_events) is left alone
// because it cannot be distinguished from real traffic.

import { neon } from '@neondatabase/serverless';

for (const file of ['.env.local', '.env']) {
	try {
		process.loadEnvFile(file);
	} catch {
		// Optional file; a pre-set process env also works.
	}
	if (process.env.DATABASE_URL) {
		break;
	}
}

const databaseUrl = process.env.DATABASE_URL || '';
if (!databaseUrl) {
	console.error('DATABASE_URL is not configured.');
	process.exit(1);
}

const apply = process.argv.includes('--apply');
const sql = neon(databaseUrl);

// Static predicates only; no user input is interpolated into SQL text.
const E2E_TEST_MATCH = `topic ILIKE '%E2E%' OR test::text ILIKE '%Probe question%'`;
const E2E_USER_MATCH = `google_sub LIKE 'e2e-%' OR name = 'E2E Premium User'`;

async function count(text) {
	const rows = await sql.query(text);
	return rows[0].n;
}

async function snapshot() {
	return {
		ai_test: await count(`SELECT count(*)::int AS n FROM ai_test WHERE ${E2E_TEST_MATCH}`),
		attempts: await count(
			`SELECT count(*)::int AS n FROM ai_test_attempts WHERE test_id IN (SELECT id FROM ai_test WHERE ${E2E_TEST_MATCH})`
		),
		visits: await count(
			`SELECT count(*)::int AS n FROM ai_test_visits WHERE test_id IN (SELECT id FROM ai_test WHERE ${E2E_TEST_MATCH})`
		),
		explanations: await count(
			`SELECT count(*)::int AS n FROM question_explanations WHERE model = 'e2e-seed'`
		),
		probePatterns: await count(
			`SELECT count(*)::int AS n FROM exam_patterns WHERE pattern_key LIKE 'exam:e2e-%'`
		),
		users: await count(`SELECT count(*)::int AS n FROM app_user WHERE ${E2E_USER_MATCH}`),
		sessions: await count(
			`SELECT count(*)::int AS n FROM app_user_session WHERE user_id IN (SELECT id FROM app_user WHERE ${E2E_USER_MATCH})`
		),
	};
}

console.log('before:', JSON.stringify(await snapshot()));

if (!apply) {
	console.log('dry run: pass --apply to delete these rows.');
	process.exit(0);
}

// ai_test deletes cascade into ai_test_attempts and ai_test_visits.
await sql.query(`DELETE FROM ai_test WHERE ${E2E_TEST_MATCH}`);
await sql.query(`DELETE FROM question_explanations WHERE model = 'e2e-seed'`);
await sql.query(`DELETE FROM exam_patterns WHERE pattern_key LIKE 'exam:e2e-%'`);
// The real cached pattern was overwritten by an e2e seed; expire it so the
// next use rediscovers the genuine payload.
await sql.query(`
	UPDATE exam_patterns SET expires_at = NOW()
	WHERE pattern_key = 'exam:ibps-po' AND model = 'e2e-seed'
`);
await sql.query(
	`DELETE FROM app_user_session WHERE user_id IN (SELECT id FROM app_user WHERE ${E2E_USER_MATCH})`
);
await sql.query(`DELETE FROM app_user WHERE ${E2E_USER_MATCH}`);

console.log('after:', JSON.stringify(await snapshot()));
