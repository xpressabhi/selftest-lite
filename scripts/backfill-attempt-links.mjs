#!/usr/bin/env node
// Attributes historical anonymous attempts to the account that provably owns
// their device. An attempt with user_id NULL is invisible to the account on
// any other device (getMyAttemptForIdentity matches user_id OR client_id), and
// login only backfills the logging-in device (backfillUserIdentity), so this
// one-off pass covers rows that path could not reach.
//
// Evidence is limited to rows that already carry BOTH ids: attempts, feature
// events (and their archive), and generated papers (created_by_user_id plus
// requestParams.clientId). A device mapping to more than one account is
// ambiguous and is skipped, never guessed. Updates only; never deletes.
//
// Usage:
//   npm run attempts:backfill-links            # dry run
//   npm run attempts:backfill-links -- --apply

import { neon } from '@neondatabase/serverless';

const apply = process.argv.slice(2).includes('--apply');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error(
		'DATABASE_URL is not set. Run via `npm run attempts:backfill-links` (loads .env/.env.local) or export it first.'
	);
	process.exit(1);
}

const sql = neon(databaseUrl);

// Devices (client ids) with exactly one known account. The 8-char minimum
// matches normalizeAttemptIdentity: shorter values are not credentials.
const MAPPED = `
	SELECT client_id,
		COUNT(DISTINCT user_id)::int AS accounts,
		MIN(user_id) AS user_id
	FROM (
		SELECT client_id, user_id
		FROM ai_test_attempts
		WHERE user_id IS NOT NULL AND client_id IS NOT NULL
		UNION ALL
		SELECT client_id, user_id
		FROM feature_events
		WHERE user_id IS NOT NULL AND client_id IS NOT NULL
		UNION ALL
		SELECT client_id, user_id
		FROM feature_events_archive
		WHERE user_id IS NOT NULL AND client_id IS NOT NULL
		UNION ALL
		SELECT client_id, user_id
		FROM api_request_events
		WHERE user_id IS NOT NULL AND client_id IS NOT NULL
		UNION ALL
		SELECT client_id, user_id
		FROM api_request_events_archive
		WHERE user_id IS NOT NULL AND client_id IS NOT NULL
		UNION ALL
		SELECT client_id, user_id
		FROM app_user_state
		WHERE user_id IS NOT NULL AND client_id IS NOT NULL
		UNION ALL
		SELECT client_id, user_id
		FROM app_user_state_archive
		WHERE user_id IS NOT NULL AND client_id IS NOT NULL
		UNION ALL
		SELECT test->'requestParams'->>'clientId' AS client_id, created_by_user_id AS user_id
		FROM ai_test
		WHERE created_by_user_id IS NOT NULL
			AND test->'requestParams'->>'clientId' IS NOT NULL
	) evidence
	WHERE length(client_id) >= 8
	GROUP BY client_id
`;

const CANDIDATES = `
	SELECT a.id, a.test_id, a.client_id, a.created_at, m.user_id
	FROM ai_test_attempts a
	JOIN (${MAPPED}) m ON m.client_id = a.client_id
	WHERE a.user_id IS NULL AND m.accounts = 1
`;

const summary = (
	await sql.query(`
		WITH mapped AS (${MAPPED})
		SELECT
			(SELECT COUNT(*)::int FROM ai_test_attempts) AS attempts_total,
			(SELECT COUNT(*)::int FROM ai_test_attempts WHERE user_id IS NOT NULL) AS already_linked,
			(SELECT COUNT(*)::int FROM ai_test_attempts WHERE user_id IS NULL) AS unlinked,
			(SELECT COUNT(*)::int FROM ai_test_attempts
				WHERE user_id IS NULL AND client_id IS NULL) AS unlinkable_no_client,
			(SELECT COUNT(*)::int FROM ai_test_attempts a
				WHERE a.user_id IS NULL AND a.client_id IS NOT NULL
					AND NOT EXISTS (SELECT 1 FROM mapped m WHERE m.client_id = a.client_id)
			) AS unlinkable_unknown_device,
			(SELECT COUNT(*)::int FROM ai_test_attempts a
				JOIN mapped m ON m.client_id = a.client_id
				WHERE a.user_id IS NULL AND m.accounts > 1
			) AS unlinkable_ambiguous_device,
			(SELECT COUNT(*)::int FROM ai_test_attempts
				WHERE user_answers IS NULL OR user_answers = '{}'::jsonb) AS attempts_without_answers,
			(SELECT COUNT(*)::int FROM (${CANDIDATES}) c) AS candidates
	`)
)[0];

console.log('Attempt link backfill');
for (const [key, value] of Object.entries(summary)) {
	console.log(`  ${key}: ${value}`);
}

const samples = await sql.query(
	`SELECT * FROM (${CANDIDATES}) c ORDER BY c.created_at DESC LIMIT 5`
);
if (samples.length > 0) {
	console.log('candidate sample:');
	for (const row of samples) {
		console.log(
			`  attempt ${row.id} (test ${row.test_id}, device ${String(row.client_id).slice(0, 12)}…) -> user ${row.user_id}`
		);
	}
}

if (!apply) {
	console.log('dry run: re-run with --apply to link these attempts.');
	process.exit(0);
}

const updated = await sql.query(`
	WITH candidates AS (${CANDIDATES})
	UPDATE ai_test_attempts a
	SET user_id = c.user_id
	FROM candidates c
	WHERE a.id = c.id AND a.user_id IS NULL
	RETURNING a.id
`);

console.log(`linked rows: ${updated.length}`);
