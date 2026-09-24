#!/usr/bin/env node
// Rebuilds ai_test_visits from historical telemetry so visitor and
// in-progress counters have history. Upserts only; never deletes. Archive
// aware: archived feature events count too.
//
// Sources: `test:start` (started_at) and `results:view` (submitted_at), both
// carrying the test id in props.id and an identity (user_id or client_id).
// Submissions themselves are already correct in ai_test_attempts.
//
// Usage:
//   npm run telemetry:backfill-visits                 # dry run
//   npm run telemetry:backfill-visits -- --apply
//   npm run telemetry:backfill-visits -- --days=180 --apply

import { neon } from '@neondatabase/serverless';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const daysArg = args.find((argument) => argument.startsWith('--days='));
const days = Number(daysArg?.split('=')[1]);
const windowDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 365;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error(
		'DATABASE_URL is not set. Run via `npm run telemetry:backfill-visits` (loads .env/.env.local) or export it first.'
	);
	process.exit(1);
}

const sql = neon(databaseUrl);

const BASE_SELECT = `
	WITH events AS (
		SELECT event, props, client_id, user_id, created_at
		FROM feature_events
		WHERE event IN ('test:start', 'results:view')
		  AND created_at > NOW() - $1::int * INTERVAL '1 day'
		UNION ALL
		SELECT event, props, client_id, user_id, created_at
		FROM feature_events_archive
		WHERE event IN ('test:start', 'results:view')
		  AND created_at > NOW() - $1::int * INTERVAL '1 day'
	),
	grouped AS (
		SELECT
			(props->>'id')::bigint AS test_id,
			COALESCE('u:' || user_id::text, 'c:' || client_id) AS identity_key,
			MAX(user_id) AS user_id,
			MAX(client_id) AS client_id,
			MIN(created_at) AS first_seen_at,
			MAX(created_at) AS last_seen_at,
			MIN(created_at) FILTER (WHERE event = 'test:start') AS started_at,
			MIN(created_at) FILTER (WHERE event = 'results:view') AS submitted_at
		FROM events
		WHERE props->>'id' ~ '^[0-9]+$'
		  AND (user_id IS NOT NULL OR (client_id IS NOT NULL AND length(client_id) >= 8))
		GROUP BY 1, 2
	)
`;

const preview = await sql.query(
	`
	${BASE_SELECT}
	SELECT
		COUNT(*)::int AS candidates,
		COUNT(DISTINCT g.test_id)::int AS tests,
		COUNT(*) FILTER (WHERE t.id IS NULL)::int AS unknown_tests
	FROM grouped g
	LEFT JOIN ai_test t ON t.id = g.test_id
`,
	[windowDays]
);
const { candidates, tests, unknown_tests: unknownTests } = preview[0];

console.log(`window: ${windowDays} days`);
console.log(
	`candidate visits: ${candidates} across ${tests} tests (${unknownTests} rows skipped: unknown test ids)`
);

if (!apply) {
	console.log('dry run: re-run with --apply to upsert these rows.');
	process.exit(0);
}

const upserted = await sql.query(
	`
	${BASE_SELECT}
	INSERT INTO ai_test_visits
		(test_id, identity_key, user_id, client_id, first_seen_at, last_seen_at, started_at, submitted_at)
	SELECT
		g.test_id, g.identity_key, g.user_id, g.client_id,
		g.first_seen_at, g.last_seen_at, g.started_at, g.submitted_at
	FROM grouped g
	JOIN ai_test t ON t.id = g.test_id
	ON CONFLICT (test_id, identity_key) DO UPDATE
		SET first_seen_at = LEAST(ai_test_visits.first_seen_at, EXCLUDED.first_seen_at),
		    last_seen_at = GREATEST(ai_test_visits.last_seen_at, EXCLUDED.last_seen_at),
		    started_at = COALESCE(ai_test_visits.started_at, EXCLUDED.started_at),
		    submitted_at = COALESCE(ai_test_visits.submitted_at, EXCLUDED.submitted_at),
		    user_id = COALESCE(ai_test_visits.user_id, EXCLUDED.user_id),
		    client_id = COALESCE(ai_test_visits.client_id, EXCLUDED.client_id)
	RETURNING 1
`,
	[windowDays]
);

console.log(`upserted rows: ${upserted.length}`);
