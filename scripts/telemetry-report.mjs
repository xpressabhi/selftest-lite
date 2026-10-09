#!/usr/bin/env node
// Read-only telemetry report for selftest-lite.
//
// Usage:
//   npm run telemetry:report -- --days=30 [--gate-days=7]
//
// The npm script loads DATABASE_URL from .env.local / .env. This script only
// runs SELECTs; it never writes to the database. See docs/telemetry.md for the
// review checklist that goes with it.
//
// Two independent windows:
//   --days       how far back the descriptive sections look (trend context)
//   --gate-days  how far back the quality gates look (recency)
//
// The gates deliberately default to a short window. Gates answer "is the
// product healthy right now", so a fixed incident from three weeks ago must not
// keep them red forever — that only trains everyone to ignore them. The weekly
// workflow runs --strict, so a stale window there meant a permanently red build.

import { neon } from '@neondatabase/serverless';
import { TELEMETRY_EVENTS } from '../src/lib/shared/telemetryEvents.js';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
	console.log('Usage: npm run telemetry:report -- [--days=30] [--gate-days=7] [--strict]');
	process.exit(0);
}

const daysArgument = args.find((argument) => argument.startsWith('--days='));
const days = Math.min(Math.max(Number(daysArgument?.split('=')[1]) || 30, 1), 365);
const gateDaysArgument = args.find((argument) => argument.startsWith('--gate-days='));
const gateDays = Math.min(
	Math.max(Number(gateDaysArgument?.split('=')[1]) || 7, 1),
	days
);
const strict = args.includes('--strict');

/**
 * Vercel attaches x-vercel-ip-* to production traffic; a local dev server
 * pointed at the production database, an e2e run, or a curl probe does not.
 * Those rows are real requests but not real users, and they were ~70% of the
 * API table, which silently turned every latency and error number into a blend
 * of a dev loop and production. Gates and hotspots therefore read only
 * production rows; the descriptive sections still report both.
 */
const PRODUCTION_ONLY_PREDICATE = 'ip_country IS NOT NULL';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error(
		'DATABASE_URL is not set. Run via `npm run telemetry:report` (loads .env.local/.env) or export it first.'
	);
	process.exit(1);
}

const sql = neon(databaseUrl);
const PRODUCTION_ONLY = sql`${sql.query(PRODUCTION_ONLY_PREDICATE)}`;

function section(title) {
	console.log(`\n=== ${title} ===`);
}

function printTable(rows, columns) {
	if (rows.length === 0) {
		console.log('  (none)');
		return;
	}
	const widths = columns.map((column) =>
		Math.max(column.label.length, ...rows.map((row) => String(row[column.key] ?? '').length))
	);
	const line = (cells) =>
		`  ${cells.map((cell, index) => String(cell).padEnd(widths[index])).join('  ')}`;
	console.log(line(columns.map((column) => column.label)));
	console.log(line(widths.map((width) => '-'.repeat(width))));
	for (const row of rows) {
		console.log(line(columns.map((column) => row[column.key] ?? '')));
	}
}

function percent(part, total) {
	if (!total) {
		return '0%';
	}
	return `${((part / total) * 100).toFixed(1)}%`;
}

section(`Telemetry report (last ${days} days)`);

section('Database overview (all time)');
printTable(
	await sql`
		SELECT
			(SELECT COUNT(*) FROM feature_events)::int AS feature_events,
			(SELECT MAX(created_at)::date FROM feature_events) AS feature_last,
			(SELECT COUNT(*) FROM api_request_events)::int AS api_events,
			(SELECT MAX(created_at)::date FROM api_request_events) AS api_last,
			(SELECT COUNT(*) FROM ai_test)::int AS tests,
			(SELECT COUNT(*) FROM ai_test_attempts)::int AS attempts,
			(SELECT COUNT(*) FROM app_user)::int AS users
	`,
	[
		{ key: 'feature_events', label: 'feature_events' },
		{ key: 'feature_last', label: 'last' },
		{ key: 'api_events', label: 'api_events' },
		{ key: 'api_last', label: 'last' },
		{ key: 'tests', label: 'tests' },
		{ key: 'attempts', label: 'attempts' },
		{ key: 'users', label: 'users' },
	]
);

section('Weekly activity (feature_events)');
printTable(
	await sql`
		SELECT
			DATE_TRUNC('week', created_at)::date AS week,
			COUNT(*)::int AS events,
			COUNT(DISTINCT session_id)::int AS sessions,
			COUNT(DISTINCT COALESCE(user_id::text, client_id))::int AS identities
		FROM feature_events
		WHERE created_at >= NOW() - ${days}::int * INTERVAL '1 day'
		GROUP BY 1
		ORDER BY 1
	`,
	[
		{ key: 'week', label: 'week' },
		{ key: 'events', label: 'events' },
		{ key: 'sessions', label: 'sessions' },
		{ key: 'identities', label: 'identities' },
	]
);

section('Retention (new vs returning identities)');
printTable(
	await sql`
		WITH ids AS (
			SELECT COALESCE(user_id::text, client_id) AS id, created_at
			FROM feature_events
			WHERE COALESCE(user_id::text, client_id) IS NOT NULL
		),
		first_seen AS (
			SELECT id, MIN(created_at) AS first_at FROM ids GROUP BY id
		)
		SELECT
			DATE_TRUNC('week', i.created_at)::date AS week,
			COUNT(DISTINCT i.id)::int AS identities,
			COUNT(DISTINCT i.id) FILTER (WHERE f.first_at >= DATE_TRUNC('week', i.created_at))::int AS new_ids,
			COUNT(DISTINCT i.id) FILTER (WHERE f.first_at < DATE_TRUNC('week', i.created_at))::int AS returning
		FROM ids i
		JOIN first_seen f USING (id)
		WHERE i.created_at >= NOW() - ${days}::int * INTERVAL '1 day'
		GROUP BY 1
		ORDER BY 1
	`,
	[
		{ key: 'week', label: 'week' },
		{ key: 'identities', label: 'identities' },
		{ key: 'new_ids', label: 'new' },
		{ key: 'returning', label: 'returning' },
	]
);

section('Cohort retention (last 14 days of cohorts)');
// Below this many identities a retention percentage is not a measurement.
const MIN_RETENTION_COHORT = 60;
const cohortRows = await sql`
	WITH firsts AS (
		SELECT COALESCE(user_id::text, client_id) AS id, MIN(created_at)::date AS cohort
		FROM feature_events
		WHERE COALESCE(user_id::text, client_id) IS NOT NULL
		GROUP BY 1
	),
	activity AS (
		SELECT DISTINCT COALESCE(user_id::text, client_id) AS id, created_at::date AS day
		FROM feature_events
		WHERE COALESCE(user_id::text, client_id) IS NOT NULL
	)
	SELECT
		f.cohort,
		COUNT(DISTINCT f.id)::int AS cohort_size,
		COUNT(DISTINCT a.id) FILTER (WHERE a.day = f.cohort + 1)::int AS d1,
		COUNT(DISTINCT a.id) FILTER (WHERE a.day > f.cohort AND a.day <= f.cohort + 7)::int AS d7
	FROM firsts f
	JOIN activity a USING (id)
	WHERE f.cohort >= CURRENT_DATE - 14
	GROUP BY 1
	ORDER BY 1
`;
printTable(cohortRows, [
	{ key: 'cohort', label: 'cohort' },
	{ key: 'cohort_size', label: 'size' },
	{ key: 'd1', label: 'D1' },
	{ key: 'd7', label: 'D7' },
]);
const cohortSize = cohortRows.reduce((sum, row) => sum + row.cohort_size, 0);
const d1Count = cohortRows.reduce((sum, row) => sum + row.d1, 0);
const d7Count = cohortRows.reduce((sum, row) => sum + row.d7, 0);
const d1Rate = cohortSize > 0 ? d1Count / cohortSize : 0;
const d7Rate = cohortSize > 0 ? d7Count / cohortSize : 0;
console.log(
	`  aggregate: ${cohortSize} identities, D1 ${(d1Rate * 100).toFixed(1)}%, D7 ${(d7Rate * 100).toFixed(1)}%`
);

// The retention gates below measure engaged retention: an identity's cohort
// starts at its first generate:start / test:start, not at its first page view.
// A one-day wave of single-session drive-bys otherwise inflates the aggregate
// past the 60-identity floor and pins the gate red forever, which teaches
// everyone to ignore it. The all-identity table above stays descriptive.
section('Engaged retention (first generate/test start, last 14 days of cohorts)');
const engagedCohortRows = await sql`
	WITH firsts AS (
		SELECT COALESCE(user_id::text, client_id) AS id, MIN(created_at)::date AS cohort
		FROM feature_events
		WHERE event IN ('generate:start', 'test:start')
			AND COALESCE(user_id::text, client_id) IS NOT NULL
		GROUP BY 1
	),
	activity AS (
		SELECT DISTINCT COALESCE(user_id::text, client_id) AS id, created_at::date AS day
		FROM feature_events
		WHERE COALESCE(user_id::text, client_id) IS NOT NULL
	)
	SELECT
		f.cohort,
		COUNT(DISTINCT f.id)::int AS cohort_size,
		COUNT(DISTINCT a.id) FILTER (WHERE a.day = f.cohort + 1)::int AS d1,
		COUNT(DISTINCT a.id) FILTER (WHERE a.day > f.cohort AND a.day <= f.cohort + 7)::int AS d7
	FROM firsts f
	JOIN activity a USING (id)
	WHERE f.cohort >= CURRENT_DATE - 14
	GROUP BY 1
	ORDER BY 1
`;
printTable(engagedCohortRows, [
	{ key: 'cohort', label: 'cohort' },
	{ key: 'cohort_size', label: 'size' },
	{ key: 'd1', label: 'D1' },
	{ key: 'd7', label: 'D7' },
]);
const engagedCohortSize = engagedCohortRows.reduce((sum, row) => sum + row.cohort_size, 0);
const engagedD1Count = engagedCohortRows.reduce((sum, row) => sum + row.d1, 0);
const engagedD7Count = engagedCohortRows.reduce((sum, row) => sum + row.d7, 0);
const engagedD1Rate = engagedCohortSize > 0 ? engagedD1Count / engagedCohortSize : 0;
const engagedD7Rate = engagedCohortSize > 0 ? engagedD7Count / engagedCohortSize : 0;
console.log(
	`  aggregate: ${engagedCohortSize} engaged identities, D1 ${(engagedD1Rate * 100).toFixed(1)}%, D7 ${(engagedD7Rate * 100).toFixed(1)}%`
);

// Drive-by share: identities that never started a generation or a test.
// Descriptive, not a gate — it explains funnel dilution and why the
// all-identity retention above reads lower than the engaged numbers.
const driveBy = (
	await sql`
		WITH per_id AS (
			SELECT COALESCE(user_id::text, client_id) AS id,
				COUNT(*) FILTER (WHERE event IN ('generate:start', 'test:start'))::int AS core
			FROM feature_events
			WHERE created_at >= NOW() - ${days}::int * INTERVAL '1 day'
				AND COALESCE(user_id::text, client_id) IS NOT NULL
			GROUP BY 1
		)
		SELECT COUNT(*)::int AS identities, COUNT(*) FILTER (WHERE core = 0)::int AS no_core
		FROM per_id
	`
)[0];
console.log(
	`  drive-by identities (no generate/test start in ${days}d): ${driveBy.no_core}/${driveBy.identities} (${percent(driveBy.no_core, driveBy.identities)})`
);

section('Activation funnel (distinct identities)');
printTable(
	await sql`
		SELECT
			event,
			COUNT(DISTINCT COALESCE(user_id::text, client_id))::int AS identities,
			COUNT(*)::int AS events
		FROM feature_events
		WHERE created_at >= NOW() - ${days}::int * INTERVAL '1 day'
			AND event IN (
				'page:view', 'generate:start', 'test:start', 'test:submit',
				'results:explain', 'history:view', 'bookmarks:view'
			)
		GROUP BY event
		ORDER BY identities DESC
	`,
	[
		{ key: 'event', label: 'stage' },
		{ key: 'identities', label: 'identities' },
		{ key: 'events', label: 'events' },
	]
);

section('Top feature events');
// Fetch every event, not just the top 25: the display trims to 25 below, but
// the allowlist doctor needs the full window to know what actually fired.
// Building the seen-set from the display limit marked ~3 in 4 live events as
// "not seen" (they were simply below the top-25 cutoff).
const eventCounts = await sql`
	SELECT
		event,
		COUNT(*)::int AS events,
		COUNT(DISTINCT COALESCE(user_id::text, client_id))::int AS identities,
		MAX(created_at)::date AS last_seen
	FROM feature_events
	WHERE created_at >= NOW() - ${days}::int * INTERVAL '1 day'
	GROUP BY event
	ORDER BY events DESC
`;
printTable(eventCounts.slice(0, 25), [
	{ key: 'event', label: 'event' },
	{ key: 'events', label: 'events' },
	{ key: 'identities', label: 'identities' },
	{ key: 'last_seen', label: 'last seen' },
]);

const seenEvents = new Set(eventCounts.map((row) => row.event));
const unseenAllowlisted = [...TELEMETRY_EVENTS].filter((event) => !seenEvents.has(event));
section('Allowlisted events not seen in window');
console.log(
	unseenAllowlisted.length > 0
		? `  ${unseenAllowlisted.join(', ')}\n  (rare path or feature no longer used; the allowlist doctor test catches dead entries)`
		: '  (none - every allowlisted event fired)'
);

section('Conversational planner (client)');
printTable(
	await sql`
		SELECT
			event,
			COUNT(*)::int AS events,
			COUNT(DISTINCT COALESCE(user_id::text, client_id))::int AS identities,
			MAX(created_at)::date AS last_seen
		FROM feature_events
		WHERE event IN (
				'intent:parse',
				'intent:parsed',
				'intent:parse-failed',
				'intent:clarification-asked',
				'intent:clarification-answered'
			)
			AND created_at >= NOW() - ${days}::int * INTERVAL '1 day'
		GROUP BY event
		ORDER BY events DESC
	`,
	[
		{ key: 'event', label: 'event' },
		{ key: 'events', label: 'events' },
		{ key: 'identities', label: 'identities' },
		{ key: 'last_seen', label: 'last seen' },
	]
);

printTable(
	await sql`
		SELECT
			COALESCE(props->>'field', '(none)') AS field,
			COALESCE(props->>'outcome', '(asked)') AS outcome,
			COUNT(*)::int AS events
		FROM feature_events
		WHERE event IN ('intent:clarification-asked', 'intent:clarification-answered')
			AND created_at >= NOW() - ${days}::int * INTERVAL '1 day'
		GROUP BY field, outcome
		ORDER BY events DESC
		LIMIT 12
	`,
	[
		{ key: 'field', label: 'field' },
		{ key: 'outcome', label: 'outcome' },
		{ key: 'events', label: 'events' },
	]
);

printTable(
	await sql`
		SELECT
			COALESCE(metadata->>'topicSource', '(unknown)') AS topic_source,
			COALESCE(metadata->>'confidence', '(unknown)') AS confidence,
			COALESCE(metadata->>'model', '(unknown)') AS model,
			COUNT(*)::int AS turns,
			COUNT(*) FILTER (WHERE metadata->>'clarifyField' IS NOT NULL)::int AS clarifications
		FROM api_request_events
		WHERE route = '/api/parse-intent'
			AND status_code < 400
			AND created_at >= NOW() - ${days}::int * INTERVAL '1 day'
		GROUP BY topic_source, confidence, model
		ORDER BY turns DESC
		LIMIT 15
	`,
	[
		{ key: 'topic_source', label: 'topic source' },
		{ key: 'confidence', label: 'confidence' },
		{ key: 'model', label: 'model' },
		{ key: 'turns', label: 'turns' },
		{ key: 'clarifications', label: 'clarifications' },
	]
);

printTable(
	await sql`
		SELECT
			COALESCE(metadata->>'model', '(legacy)') AS model,
			COALESCE(metadata->>'confidence', '(unknown)') AS confidence,
			COUNT(*)::int AS turns,
			COALESCE(ROUND(AVG(COALESCE((metadata->'usage'->>'input_tokens')::int, 0))), 0)::int AS avg_input_tokens,
			COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::int, 0) AS p95_ms,
			COUNT(*) FILTER (WHERE status_code >= 400)::int AS errors
		FROM api_request_events
		WHERE route = '/api/parse-intent'
			AND created_at >= NOW() - ${days}::int * INTERVAL '1 day'
		GROUP BY model, confidence
		ORDER BY model DESC, turns DESC
	`,
	[
		{ key: 'model', label: 'model' },
		{ key: 'confidence', label: 'confidence' },
		{ key: 'turns', label: 'turns' },
		{ key: 'avg_input_tokens', label: 'avg in tokens' },
		{ key: 'p95_ms', label: 'p95 ms' },
		{ key: 'errors', label: 'errors' },
	]
);

section(`API hotspots (production traffic only, last ${days} days)`);
const hotspotRows = await sql`
	SELECT
		route,
		COUNT(*)::int AS requests,
		COUNT(*) FILTER (WHERE status_code >= 400 AND status_code NOT IN (401, 429))::int AS errors,
		COUNT(*) FILTER (WHERE status_code = 401)::int AS unauth,
		COUNT(*) FILTER (WHERE status_code = 429)::int AS limited,
		COALESCE(ROUND(AVG(duration_ms)), 0)::int AS avg_ms,
		COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::int, 0) AS p95_ms,
		MAX(created_at) FILTER (
			WHERE status_code >= 400 AND status_code NOT IN (401, 429)
		)::date AS last_error
	FROM api_request_events
	WHERE ${PRODUCTION_ONLY}
		AND created_at >= NOW() - ${days}::int * INTERVAL '1 day'
	GROUP BY route
	ORDER BY requests DESC
	LIMIT 15
`;
printTable(hotspotRows, [
	{ key: 'route', label: 'route' },
	{ key: 'requests', label: 'requests' },
	{ key: 'errors', label: 'errors' },
	{ key: 'last_error', label: 'last error' },
	{ key: 'unauth', label: '401s' },
	{ key: 'limited', label: '429s' },
	{ key: 'avg_ms', label: 'avg ms' },
	{ key: 'p95_ms', label: 'p95 ms' },
]);

// Surfaced rather than silently filtered: a dev loop or a misconfigured e2e run
// pointed at production is itself a finding, and it explains any drop in the
// identity counts above.
const trafficSplit = (
	await sql`
		SELECT
			COUNT(*) FILTER (WHERE ip_country IS NULL)::int AS non_production,
			COUNT(*) FILTER (WHERE ip_country IS NOT NULL)::int AS production,
			COUNT(DISTINCT client_key) FILTER (WHERE ip_country IS NULL)::int AS non_prod_clients,
			COUNT(*) FILTER (
				WHERE ip_country IS NULL
					AND user_agent LIKE 'Playwright/%'
			)::int AS e2e_rows
		FROM api_request_events
		WHERE created_at >= NOW() - ${days}::int * INTERVAL '1 day'
	`
)[0];
console.log(
	`\n  Excluded as non-production: ${trafficSplit.non_production} rows from ${trafficSplit.non_prod_clients} client keys (${trafficSplit.e2e_rows} Playwright) — local dev, e2e or probes hitting the production database.`
);

section('Rate-limiter requests (every call, not only trips)');
printTable(
	await sql`
		SELECT
			route,
			COUNT(*)::int AS requests,
			COUNT(DISTINCT client_key)::int AS clients
		FROM api_rate_limit_events
		WHERE created_at >= NOW() - ${days}::int * INTERVAL '1 day'
		GROUP BY route
		ORDER BY requests DESC
		LIMIT 12
	`,
	[
		{ key: 'route', label: 'route' },
		{ key: 'requests', label: 'requests' },
		{ key: 'clients', label: 'clients' },
	]
);

section('Generation failures (server)');
printTable(
	await sql`
		SELECT
			COALESCE(metadata->'generationFailure'->>'stage', '(unspecified)') AS stage,
			COALESCE(metadata->'generationFailure'->>'code', '(none)') AS code,
			COUNT(*)::int AS events,
			COALESCE(MAX(metadata->'generationFailure'->>'model'), '-') AS model,
			MAX(created_at)::date AS last_seen
		FROM api_request_events
		WHERE route = '/api/generate'
			AND status_code >= 400
			AND created_at >= NOW() - ${days}::int * INTERVAL '1 day'
		GROUP BY stage, code
		ORDER BY events DESC
		LIMIT 12
	`,
	[
		{ key: 'stage', label: 'stage' },
		{ key: 'code', label: 'code' },
		{ key: 'events', label: 'events' },
		{ key: 'model', label: 'model' },
		{ key: 'last_seen', label: 'last seen' },
	]
);

section('Generation failure issues');
printTable(
	await sql`
		SELECT
			entry.value->>'issue' AS issue,
			COUNT(*)::int AS occurrences,
			COUNT(DISTINCT e.id)::int AS batches
		FROM api_request_events e
		CROSS JOIN LATERAL jsonb_array_elements(e.metadata->'generationFailure'->'issues') AS entry(value)
		WHERE e.route = '/api/generate'
			AND e.status_code >= 400
			AND e.created_at >= NOW() - ${days}::int * INTERVAL '1 day'
		GROUP BY issue
		ORDER BY occurrences DESC
		LIMIT 12
	`,
	[
		{ key: 'issue', label: 'issue' },
		{ key: 'occurrences', label: 'occurrences' },
		{ key: 'batches', label: 'batches' },
	]
);

section('Generation salvage (server)');
printTable(
	await sql`
		SELECT
			COUNT(*)::int AS papers,
			COUNT(*) FILTER (WHERE metadata->>'trimmed' = 'true')::int AS trimmed,
			COALESCE(SUM((metadata->'salvage'->>'rounds')::int), 0)::int AS rounds,
			COALESCE(SUM((metadata->'salvage'->>'rejected')::int), 0)::int AS rejected_drafts,
			ROUND(AVG(COALESCE((metadata->'salvage'->>'rejected')::numeric, 0)), 2) AS avg_rejected
		FROM api_request_events
		WHERE route = '/api/generate'
			AND status_code = 200
			AND created_at >= NOW() - ${days}::int * INTERVAL '1 day'
	`,
	[
		{ key: 'papers', label: 'papers' },
		{ key: 'trimmed', label: 'trimmed' },
		{ key: 'rounds', label: 'salvage rounds' },
		{ key: 'rejected_drafts', label: 'rejected drafts' },
		{ key: 'avg_rejected', label: 'avg rejected/paper' },
	]
);

section('Generation trims (client)');
printTable(
	await sql`
		SELECT
			COUNT(*)::int AS events,
			COALESCE(SUM((props->>'requested')::int), 0)::int AS requested,
			COALESCE(SUM((props->>'generated')::int), 0)::int AS generated,
			COUNT(DISTINCT COALESCE(user_id::text, client_id))::int AS identities
		FROM feature_events
		WHERE event = 'generate:trimmed'
			AND created_at >= NOW() - ${days}::int * INTERVAL '1 day'
	`,
	[
		{ key: 'events', label: 'events' },
		{ key: 'requested', label: 'requested' },
		{ key: 'generated', label: 'generated' },
		{ key: 'identities', label: 'identities' },
	]
);

section('Generation failures (client)');
printTable(
	await sql`
		SELECT
			COALESCE(props->>'code', '(none)') AS code,
			COUNT(*)::int AS events,
			COUNT(DISTINCT COALESCE(user_id::text, client_id))::int AS identities
		FROM feature_events
		WHERE event = 'generate:fail'
			AND created_at >= NOW() - ${days}::int * INTERVAL '1 day'
		GROUP BY code
		ORDER BY events DESC
		LIMIT 10
	`,
	[
		{ key: 'code', label: 'code' },
		{ key: 'events', label: 'events' },
		{ key: 'identities', label: 'identities' },
	]
);

section('Device & network');
const DEVICE_BUCKET_ORDER = {
	type: ['slow-2g', '2g', '3g', '4g', 'unknown'],
	downlink: ['lt025', '025-05', '05-1', '1-2', '2-5', '5-10', '10p', 'unknown'],
	rtt: ['lt100', '100-200', '200-400', '400-800', '800-1500', '1500p', 'unknown'],
};

const deviceMix = await sql`
	WITH latest AS (
		SELECT DISTINCT ON (COALESCE(user_id::text, client_id))
			COALESCE(user_id::text, client_id) AS identity,
			props
		FROM feature_events
		WHERE event = 'device:profile'
			AND created_at >= NOW() - ${days}::int * INTERVAL '1 day'
			AND COALESCE(user_id::text, client_id) IS NOT NULL
		ORDER BY COALESCE(user_id::text, client_id), created_at DESC
	)
	SELECT
		COALESCE(NULLIF(props->>'tier', ''), 'unknown') AS tier,
		COUNT(*)::int AS identities
	FROM latest
	GROUP BY 1
	ORDER BY identities DESC
`;
const deviceIdentities = deviceMix.reduce((sum, row) => sum + row.identities, 0);
printTable(
	deviceMix.map((row) => ({ ...row, share: percent(row.identities, deviceIdentities) })),
	[
		{ key: 'tier', label: 'tier' },
		{ key: 'identities', label: 'identities' },
		{ key: 'share', label: 'share' },
	]
);

console.log('\n  Low-tier device models:');
printTable(
	await sql`
		WITH latest AS (
			SELECT DISTINCT ON (COALESCE(user_id::text, client_id))
				COALESCE(user_id::text, client_id) AS identity,
				props
			FROM feature_events
			WHERE event = 'device:profile'
				AND created_at >= NOW() - ${days}::int * INTERVAL '1 day'
				AND COALESCE(user_id::text, client_id) IS NOT NULL
			ORDER BY COALESCE(user_id::text, client_id), created_at DESC
		)
		SELECT
			COALESCE(NULLIF(props->>'model', ''), 'unknown') AS model,
			COALESCE(NULLIF(props->>'android', ''), 'unknown') AS android,
			COUNT(*)::int AS identities
		FROM latest
		WHERE props->>'tier' = 'low'
		GROUP BY 1, 2
		ORDER BY identities DESC
		LIMIT 10
	`,
	[
		{ key: 'model', label: 'model' },
		{ key: 'android', label: 'android' },
		{ key: 'identities', label: 'identities' },
	]
);

const networkRows = await sql`
	WITH session_net AS (
		SELECT session_id,
			MIN(CASE props->>'type' WHEN 'slow-2g' THEN 0 WHEN '2g' THEN 1 WHEN '3g' THEN 2 WHEN '4g' THEN 3 END)
				FILTER (WHERE props->>'type' IN ('slow-2g', '2g', '3g', '4g')) AS type_rank,
			MIN(CASE props->>'down' WHEN 'lt025' THEN 0 WHEN '025-05' THEN 1 WHEN '05-1' THEN 2 WHEN '1-2' THEN 3 WHEN '2-5' THEN 4 WHEN '5-10' THEN 5 WHEN '10p' THEN 6 END)
				FILTER (WHERE props->>'down' IN ('lt025', '025-05', '05-1', '1-2', '2-5', '5-10', '10p')) AS down_rank,
			MAX(CASE props->>'rtt' WHEN 'lt100' THEN 0 WHEN '100-200' THEN 1 WHEN '200-400' THEN 2 WHEN '400-800' THEN 3 WHEN '800-1500' THEN 4 WHEN '1500p' THEN 5 END)
				FILTER (WHERE props->>'rtt' IN ('lt100', '100-200', '200-400', '400-800', '800-1500', '1500p')) AS rtt_rank
		FROM feature_events
		WHERE event IN ('device:profile', 'net:change')
			AND session_id IS NOT NULL
			AND created_at >= NOW() - ${days}::int * INTERVAL '1 day'
		GROUP BY session_id
	)
	SELECT 'type' AS dimension,
		CASE type_rank WHEN 0 THEN 'slow-2g' WHEN 1 THEN '2g' WHEN 2 THEN '3g' WHEN 3 THEN '4g' ELSE 'unknown' END AS bucket,
		COUNT(*)::int AS sessions
	FROM session_net
	GROUP BY 1, 2
	UNION ALL
	SELECT 'downlink',
		CASE down_rank WHEN 0 THEN 'lt025' WHEN 1 THEN '025-05' WHEN 2 THEN '05-1' WHEN 3 THEN '1-2' WHEN 4 THEN '2-5' WHEN 5 THEN '5-10' WHEN 6 THEN '10p' ELSE 'unknown' END,
		COUNT(*)::int
	FROM session_net
	GROUP BY 1, 2
	UNION ALL
	SELECT 'rtt',
		CASE rtt_rank WHEN 0 THEN 'lt100' WHEN 1 THEN '100-200' WHEN 2 THEN '200-400' WHEN 3 THEN '400-800' WHEN 4 THEN '800-1500' WHEN 5 THEN '1500p' ELSE 'unknown' END,
		COUNT(*)::int
	FROM session_net
	GROUP BY 1, 2
`;

console.log('\n  Network mix (worst observed per session):');
const orderedNetworkRows = ['type', 'downlink', 'rtt'].flatMap((dimension) => {
	const rows = networkRows.filter((row) => row.dimension === dimension);
	const total = rows.reduce((sum, row) => sum + row.sessions, 0);
	return DEVICE_BUCKET_ORDER[dimension].map((bucket) => {
		const match = rows.find((row) => row.bucket === bucket);
		const sessions = match?.sessions ?? 0;
		return {
			dimension,
			bucket,
			sessions,
			share: percent(sessions, total),
		};
	});
});
printTable(orderedNetworkRows, [
	{ key: 'dimension', label: 'dimension' },
	{ key: 'bucket', label: 'bucket' },
	{ key: 'sessions', label: 'sessions' },
	{ key: 'share', label: 'share' },
]);

const generateByDownlinkRows = await sql`
	SELECT
		COALESCE(net.bucket, 'unknown') AS bucket,
		COUNT(*) FILTER (WHERE fe.event = 'generate:success')::int AS succeeded,
		COUNT(*) FILTER (WHERE fe.event = 'generate:fail')::int AS failed,
		ROUND(
			AVG(
				CASE
					WHEN fe.event = 'generate:fail' AND fe.props->>'elapsedSeconds' ~ '^[0-9]{1,6}$'
					THEN (fe.props->>'elapsedSeconds')::numeric
				END
			),
			1
		) AS avg_fail_seconds
	FROM feature_events fe
	LEFT JOIN LATERAL (
		SELECT props->>'down' AS bucket
		FROM feature_events n
		WHERE n.session_id = fe.session_id
			AND n.event IN ('device:profile', 'net:change')
			AND n.created_at <= fe.created_at
		ORDER BY n.created_at DESC
		LIMIT 1
	) net ON TRUE
	WHERE fe.event IN ('generate:success', 'generate:fail')
		AND fe.created_at >= NOW() - ${days}::int * INTERVAL '1 day'
	GROUP BY 1
`;
const orderedGenerateByDownlink = DEVICE_BUCKET_ORDER.downlink.map((bucket) => {
	const row = generateByDownlinkRows.find((entry) => entry.bucket === bucket) || {};
	const succeeded = row.succeeded ?? 0;
	const failed = row.failed ?? 0;
	const started = succeeded + failed;
	return {
		bucket,
		started,
		failed,
		fail_rate: started > 0 ? percent(failed, started) : '-',
		avg_fail_seconds: row.avg_fail_seconds ?? '-',
	};
});
console.log('\n  Generate outcomes by downlink (nearest network row before the call):');
printTable(orderedGenerateByDownlink, [
	{ key: 'bucket', label: 'downlink' },
	{ key: 'started', label: 'started' },
	{ key: 'failed', label: 'failed' },
	{ key: 'fail_rate', label: 'fail %' },
	{ key: 'avg_fail_seconds', label: 'avg fail s' },
]);

// Supported floor: p10 of per-session worst downlink, p90 of per-session worst
// RTT, and the generate failure rate at or below the floor bucket.
const downlinkBuckets = DEVICE_BUCKET_ORDER.downlink.filter((bucket) => bucket !== 'unknown');
const downlinkCounts = downlinkBuckets.map((bucket) => ({
	bucket,
	sessions:
		networkRows.find((row) => row.dimension === 'downlink' && row.bucket === bucket)?.sessions ?? 0,
}));
const downlinkTotal = downlinkCounts.reduce((sum, row) => sum + row.sessions, 0);
let floorBucket = null;
let floorWorseSessions = 0;
if (downlinkTotal > 0) {
	let cumulative = 0;
	for (const row of downlinkCounts) {
		if (cumulative + row.sessions >= downlinkTotal * 0.1) {
			floorBucket = row.bucket;
			floorWorseSessions = cumulative;
			break;
		}
		cumulative += row.sessions;
	}
}
const rttBuckets = DEVICE_BUCKET_ORDER.rtt.filter((bucket) => bucket !== 'unknown');
const rttCounts = rttBuckets.map((bucket) => ({
	bucket,
	sessions: networkRows.find((row) => row.dimension === 'rtt' && row.bucket === bucket)?.sessions ?? 0,
}));
const rttTotal = rttCounts.reduce((sum, row) => sum + row.sessions, 0);
let p90RttBucket = null;
if (rttTotal > 0) {
	let cumulative = 0;
	for (const row of rttCounts) {
		cumulative += row.sessions;
		if (cumulative >= rttTotal * 0.9) {
			p90RttBucket = row.bucket;
			break;
		}
	}
}
if (floorBucket) {
	const floorRank = downlinkBuckets.indexOf(floorBucket);
	const atOrBelow = orderedGenerateByDownlink.filter(
		(row) => downlinkBuckets.indexOf(row.bucket) !== -1 && downlinkBuckets.indexOf(row.bucket) <= floorRank
	);
	const startedBelow = atOrBelow.reduce((sum, row) => sum + row.started, 0);
	const failedBelow = atOrBelow.reduce((sum, row) => sum + row.failed, 0);
	const coverage = percent(downlinkTotal - floorWorseSessions, downlinkTotal);
	console.log(
		`\n  Supported floor: downlink ${floorBucket} Mbps (p10, covers ${coverage} of sessions with a known downlink) · RTT p90 ${p90RttBucket ?? 'unknown'} ms · generate failure at or below: ${
			startedBelow > 0 ? percent(failedBelow, startedBelow) : '-'
		} (${failedBelow}/${startedBelow})`
	);
} else {
	console.log('\n  Supported floor: not enough downlink data in this window.');
}
console.log(
	'  Note: browsers quantize downlink to 25 kbps (capped at 10 Mbps) and RTT to 25 ms (capped at 3 s); values are buckets, not exact speeds.'
);

// Coverage measures instrumentation health, so it must only count sessions that
// could have emitted a profile in the first place. Sessions from before
// device:profile shipped have no chance of passing, and including them made the
// gate mathematically unable to pass on any window longer than the
// instrumentation's own age (28.8% at 30d vs 93.6% at 7d).
const deviceProfileSince = (
	await sql`SELECT MIN(created_at) AS first_profile FROM feature_events WHERE event = 'device:profile'`
)[0].first_profile;

const profileCoverage = (
	await sql`
		SELECT
			COUNT(DISTINCT session_id) FILTER (WHERE event = 'page:view')::int AS page_sessions,
			COUNT(DISTINCT session_id) FILTER (WHERE event = 'device:profile')::int AS profile_sessions
		FROM feature_events
		WHERE event IN ('page:view', 'device:profile')
			AND session_id IS NOT NULL
			AND created_at >= NOW() - ${days}::int * INTERVAL '1 day'
			AND created_at >= ${deviceProfileSince ?? new Date(0)}
	`
)[0];
const profileCoverageShare =
	profileCoverage.page_sessions > 0
		? profileCoverage.profile_sessions / profileCoverage.page_sessions
		: null;

section('Data quality');
// createTestRecord() always writes test_mode (the endpoint defaults it to
// 'quiz-practice'), test_type and difficulty together. A row missing all three
// did not come from the generate endpoint — it is a manual insert or a probe.
// Counting those made this gate fail on data the endpoint never produced, which
// is the same class of error as letting a dev loop into the production tables.
const quality = (
	await sql`
		SELECT
			COUNT(*) FILTER (WHERE test_type IS NOT NULL OR difficulty IS NOT NULL)::int AS tests,
			COUNT(*) FILTER (
				WHERE (test_type IS NOT NULL OR difficulty IS NOT NULL)
					AND test_mode IS NULL
			)::int AS mode_null,
			COUNT(*) FILTER (
				WHERE (test_type IS NOT NULL OR difficulty IS NOT NULL)
					AND difficulty IS NULL
			)::int AS difficulty_null,
			COUNT(*) FILTER (
				WHERE (test_type IS NOT NULL OR difficulty IS NOT NULL)
					AND language IS NULL
			)::int AS language_null,
			COUNT(*) FILTER (WHERE test_type IS NULL AND difficulty IS NULL)::int AS foreign_rows
		FROM ai_test
		WHERE created_at >= NOW() - ${days}::int * INTERVAL '1 day'
	`
)[0];
const generation = (
	await sql`
		SELECT
			COUNT(*) FILTER (WHERE event = 'generate:start')::int AS starts,
			COUNT(*) FILTER (WHERE event = 'generate:success')::int AS successes,
			COUNT(*) FILTER (WHERE event = 'generate:fail')::int AS failures,
			COUNT(*) FILTER (WHERE event = 'results:explain')::int AS explains,
			COUNT(*) FILTER (WHERE event = 'results:explain-fail')::int AS explain_failures
		FROM feature_events
		WHERE created_at >= NOW() - ${gateDays}::int * INTERVAL '1 day'
	`
)[0];

// Client `generate:fail` only fires once retries are exhausted, so the client
// funnel alone can report a healthier rate than the server saw — and it never
// sees premium rejections at all. Server rows are the source of truth here.
const generationServer = (
	await sql`
		SELECT
			COUNT(*) FILTER (WHERE status_code = 200)::int AS successes,
			COUNT(*) FILTER (WHERE status_code >= 400)::int AS failures,
			COUNT(*) FILTER (WHERE status_code = 403)::int AS premium_gated,
			COUNT(*) FILTER (WHERE status_code = 408)::int AS timeouts,
			COUNT(*) FILTER (WHERE status_code >= 500)::int AS server_errors,
			-- A 200 that came back short because the deadline ended it, distinct
			-- from a 200 that filled the batch the model was asked for.
			COUNT(*) FILTER (
				WHERE status_code = 200 AND metadata->'salvage'->>'ranOutOfTime' = 'true'
			)::int AS trimmed_by_deadline,
			COUNT(*) FILTER (
				WHERE status_code = 200 AND metadata->>'trimmed' = 'true'
			)::int AS trimmed_total
		FROM api_request_events
		WHERE route = '/api/generate'
			AND ${PRODUCTION_ONLY}
			AND created_at >= NOW() - ${gateDays}::int * INTERVAL '1 day'
	`
)[0];

const explainServer = (
	await sql`
		SELECT
			COUNT(*) FILTER (WHERE status_code = 200)::int AS successes,
			COUNT(*) FILTER (WHERE status_code >= 400)::int AS failures
		FROM api_request_events
		WHERE route = '/api/explain'
			AND ${PRODUCTION_ONLY}
			AND created_at >= NOW() - ${gateDays}::int * INTERVAL '1 day'
	`
)[0];

const serverErrors = (
	await sql`
		SELECT COUNT(*)::int AS server_errors
		FROM api_request_events
		WHERE status_code >= 500
			AND ${PRODUCTION_ONLY}
			AND created_at >= NOW() - ${gateDays}::int * INTERVAL '1 day'
	`
)[0];
console.log(`  tests generated:        ${quality.tests}`);
console.log(
	`  null test_mode:         ${quality.mode_null} (${percent(quality.mode_null, quality.tests)})`
);
if (quality.foreign_rows > 0) {
	console.log(
		`  foreign rows ignored:   ${quality.foreign_rows} (no test_type and no difficulty, so not written by /api/generate)`
	);
}
console.log(
	`  null difficulty:        ${quality.difficulty_null} (${percent(quality.difficulty_null, quality.tests)})`
);
console.log(
	`  null language:          ${quality.language_null} (${percent(quality.language_null, quality.tests)})`
);
console.log(`  generate start/success: ${generation.starts} / ${generation.successes} (client)`);
console.log(`  generate failures:      ${generation.failures}`);
console.log(
	`  explain ok/fail:        ${generation.explains} / ${generation.explain_failures} (${percent(generation.explain_failures, generation.explains + generation.explain_failures)} fail)`
);
console.log(
	`  server (prod) generate: ${generationServer.successes} ok / ${generationServer.failures} failed (${generationServer.premium_gated} premium-gated, ${generationServer.timeouts} timed out, ${generationServer.server_errors} 5xx)`
);
console.log(
	`    trimmed papers:       ${generationServer.trimmed_total} (${generationServer.trimmed_by_deadline} of them cut short by the deadline)`
);
console.log(
	`  server (prod) explain:  ${explainServer.successes} ok / ${explainServer.failures} failed`
);
console.log(`  server 5xx:             ${serverErrors.server_errors}`);
console.log(`  (window for the lines above: last ${gateDays} days)`);

section('Content quality (last 7 days)');
// Matching, assertion-reasoning and statement-based options are built
// server-side with a deliberate order, so the runtime quality checks skip them
// (isServerBuiltFormat in questionQuality.js). Including them here measured a
// shuffle the product never performs.
const SERVER_BUILT_FORMATS = "('matching', 'assertion-reasoning', 'statement-based')";
const MODEL_BUILT_ONLY = `COALESCE(q->>'format', '') NOT IN ${SERVER_BUILT_FORMATS}`;
const positionRows = await sql`
	SELECT (opt.idx - 1)::int AS position, COUNT(*)::int AS n
	FROM ai_test t
	CROSS JOIN LATERAL jsonb_array_elements((t.test::jsonb)->'questions') AS q
	CROSS JOIN LATERAL (
		SELECT ordinality AS idx
		FROM jsonb_array_elements_text(q->'options') WITH ORDINALITY AS o(value, ordinality)
		WHERE o.value = q->>'answer'
	) AS opt
	WHERE t.created_at >= NOW() - INTERVAL '7 days'
		AND ${sql.query(MODEL_BUILT_ONLY)}
	GROUP BY 1
	ORDER BY 1
`;
printTable(
	positionRows.map((row) => ({
		position: ['A', 'B', 'C', 'D', 'E'][row.position] ?? row.position,
		n: row.n,
	})),
	[
		{ key: 'position', label: 'answer at' },
		{ key: 'n', label: 'questions' },
	]
);
const positionTotal = positionRows.reduce((sum, row) => sum + row.n, 0);
const earlyPositions = positionRows
	.filter((row) => row.position <= 1)
	.reduce((sum, row) => sum + row.n, 0);
const earlyShare = positionTotal > 0 ? earlyPositions / positionTotal : 0;

const lengthTell = (
	await sql`
		SELECT
			COUNT(*)::int AS total,
			COUNT(*) FILTER (WHERE ratio > 1.25)::int AS longest
		FROM (
			SELECT (
				SELECT length(o.value)::numeric / NULLIF((
					SELECT MAX(length(v)) FROM jsonb_array_elements_text(q->'options') AS v
					WHERE v <> q->>'answer'
				), 0)
				FROM jsonb_array_elements_text(q->'options') AS o(value)
				WHERE o.value = q->>'answer'
			) AS ratio
			FROM ai_test t
			CROSS JOIN LATERAL jsonb_array_elements((t.test::jsonb)->'questions') AS q
			WHERE t.created_at >= NOW() - INTERVAL '7 days'
				AND ${sql.query(MODEL_BUILT_ONLY)}
		) x
	`
)[0];
const longestShare = lengthTell.total > 0 ? lengthTell.longest / lengthTell.total : 0;

// Dedupe must key on the same composed text questionTextFor() builds.
// assertion-reasoning questions store an intentionally empty `question` stem
// and keep their content in `assertion`/`reason`; grouping on `question` alone
// collapsed all 60 of them into one group of identical empty strings and
// reported them as 59 duplicates.
const duplicateExtras = (
	await sql.query(`
		WITH items AS (
			SELECT
				CASE
					WHEN COALESCE(q->>'format', '') = 'assertion-reasoning'
						THEN lower(trim(coalesce(q->>'assertion', '') || ' | ' || coalesce(q->>'reason', '')))
					WHEN jsonb_typeof(q->'columnA') = 'array'
						THEN lower(trim(
							coalesce(q->>'question', '') || ' ' ||
							(SELECT string_agg(x, ' ') FROM jsonb_array_elements_text(q->'columnA') AS s(x)) || ' ' ||
							(SELECT string_agg(x, ' ') FROM jsonb_array_elements_text(q->'columnB') AS s(x))
						))
					WHEN jsonb_typeof(q->'statements') = 'array'
						THEN lower(trim(
							(SELECT string_agg(coalesce(s.value->>'text', ''), ' ')
								FROM jsonb_array_elements(q->'statements') AS s(value))
						))
					ELSE lower(trim(coalesce(q->>'question', '')))
				END AS question_key
			FROM ai_test t
			CROSS JOIN LATERAL jsonb_array_elements((t.test::jsonb)->'questions') AS q
			WHERE t.created_at >= NOW() - INTERVAL '7 days'
		),
		duplicates AS (
			SELECT COUNT(*)::int AS n
			FROM items
			WHERE length(question_key) > 0
			GROUP BY question_key
			HAVING COUNT(*) > 1
		)
		SELECT COALESCE(SUM(n - 1), 0)::int AS extras FROM duplicates
	`)
)[0].extras;

const itemStats = (
	await sql`
		WITH items AS (
			SELECT t.id AS test_id, (q.ord - 1)::int AS qidx, q.value->>'answer' AS correct_answer
			FROM ai_test t
			CROSS JOIN LATERAL jsonb_array_elements((t.test::jsonb)->'questions') WITH ORDINALITY AS q(value, ord)
			WHERE t.created_at >= NOW() - INTERVAL '90 days'
		),
		answers AS (
			SELECT a.test_id, (kv.key)::int AS qidx, kv.value AS user_answer,
				COALESCE(a.client_id, 'user:' || a.user_id::text) AS respondent,
				a.created_at
			FROM ai_test_attempts a
			CROSS JOIN LATERAL jsonb_each_text(a.user_answers) AS kv
			WHERE a.user_answers IS NOT NULL AND a.created_at >= NOW() - INTERVAL '90 days'
		),
		-- Discrimination means "different people got different answers". Keying on
		-- raw attempt counts let one person retaking a paper 25 times manufacture
		-- "too easy" items, so the sample is deduplicated per respondent: their
		-- last answer for that item is the one that counts.
		deduped AS (
			SELECT DISTINCT ON (a.test_id, a.qidx, a.respondent)
				a.test_id, a.qidx, a.respondent, a.user_answer
			FROM answers a
			JOIN items i ON i.test_id = a.test_id AND i.qidx = a.qidx
			ORDER BY a.test_id, a.qidx, a.respondent, a.created_at DESC
		),
		per_item AS (
			SELECT COUNT(*)::int AS respondents,
				ROUND(100.0 * COUNT(*) FILTER (WHERE d.user_answer = i.correct_answer) / COUNT(*))::int AS pct
			FROM deduped d
			JOIN items i ON i.test_id = d.test_id AND i.qidx = d.qidx
			GROUP BY d.test_id, d.qidx
			HAVING COUNT(*) >= 4
		)
		SELECT
			COUNT(*)::int AS repeated_items,
			COUNT(*) FILTER (WHERE pct <= 20)::int AS too_hard,
			COUNT(*) FILTER (WHERE pct >= 95)::int AS too_easy,
			COUNT(*) FILTER (WHERE pct BETWEEN 30 AND 80)::int AS healthy
		FROM per_item
	`
)[0];

console.log(`  questions (7d):            ${positionTotal}`);
console.log(`  correct answer at A/B:     ${(earlyShare * 100).toFixed(1)}%`);
console.log(`  key >1.25x longest distractor: ${(longestShare * 100).toFixed(1)}%`);
console.log(`  duplicate questions (7d):  ${duplicateExtras}`);
console.log(
	`  repeated items (90d):      ${itemStats.repeated_items} (too hard ${itemStats.too_hard}, too easy ${itemStats.too_easy}, healthy ${itemStats.healthy})`
);
console.log(
	`    (one row per item, deduplicated per respondent; >=4 distinct respondents)`
);

const latency = (
	await sql`
		SELECT
			COALESCE((SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)
				FROM api_request_events
				WHERE ${PRODUCTION_ONLY} AND route = '/api/user/state'
					AND created_at >= NOW() - ${gateDays}::int * INTERVAL '1 day')::int, 0) AS state_p95,
			COALESCE((SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)
				FROM api_request_events
				WHERE ${PRODUCTION_ONLY} AND route = '/api/auth/me'
					AND created_at >= NOW() - ${gateDays}::int * INTERVAL '1 day')::int, 0) AS auth_p95
	`
)[0];

const slowRequests = (
	await sql`
		SELECT
			COUNT(*)::int AS total,
			COUNT(*) FILTER (WHERE duration_ms > 10000)::int AS slow
		FROM api_request_events
		WHERE ${PRODUCTION_ONLY}
			AND created_at >= NOW() - ${gateDays}::int * INTERVAL '1 day'
	`
)[0];
const slowShare = slowRequests.total > 0 ? slowRequests.slow / slowRequests.total : 0;

section(`Quality gates (last ${gateDays} days)`);
// Server-side rates, not client events: the client only reports generate:fail
// after retries are exhausted and never reports a premium rejection, so a busy
// day could look healthy on the client funnel while the server told the opposite
// story.
const generationAttempts = generationServer.successes + generationServer.failures;
const generationSuccessRate =
	generationAttempts > 0 ? generationServer.successes / generationAttempts : 1;
const explainTotal = explainServer.successes + explainServer.failures;
const explainFailRate = explainTotal > 0 ? explainServer.failures / explainTotal : 0;
const gates = [
	{
		label: 'generate success >= 95%',
		passed: generationAttempts === 0 || generationSuccessRate >= 0.95,
		detail: `${(generationSuccessRate * 100).toFixed(1)}% (${generationServer.successes}/${generationAttempts} server attempts, ${generationServer.premium_gated} premium-gated)`,
	},
	{
		label: 'explain failure < 2%',
		passed: explainTotal === 0 || explainFailRate < 0.02,
		detail: `${(explainFailRate * 100).toFixed(1)}% (${explainServer.failures}/${explainTotal})`,
	},
	{
		label: 'server 5xx = 0',
		passed: serverErrors.server_errors === 0,
		detail: String(serverErrors.server_errors),
	},
	{
		label: 'null test_mode = 0',
		passed: quality.mode_null === 0,
		detail: `${quality.mode_null}/${quality.tests}`,
	},
	{
		label: 'state/auth p95 <= 3000ms',
		passed: latency.state_p95 <= 3000 && latency.auth_p95 <= 3000,
		detail: `state ${latency.state_p95}ms / auth ${latency.auth_p95}ms`,
	},
	{
		label: '>10s requests < 2%',
		passed: slowShare < 0.02,
		detail: `${(slowShare * 100).toFixed(1)}% (${slowRequests.slow}/${slowRequests.total})`,
	},
	{
		label: 'answer at A/B < 60%',
		passed: earlyShare < 0.6,
		detail: `${(earlyShare * 100).toFixed(1)}%`,
	},
	{
		label: 'longest-answer tell (key >1.25x) < 35%',
		passed: longestShare < 0.35,
		detail: `${(longestShare * 100).toFixed(1)}%`,
	},
	{
		label: 'duplicate questions = 0',
		passed: duplicateExtras === 0,
		detail: String(duplicateExtras),
	},
	{
		label: 'non-discriminating items < 35%',
		passed:
			itemStats.repeated_items === 0 ||
			(itemStats.too_easy + itemStats.too_hard) / itemStats.repeated_items < 0.35,
		detail: `${itemStats.too_easy + itemStats.too_hard}/${itemStats.repeated_items}`,
	},
	// Retention is measured on engaged identities (first generate/test start):
	// a wave of single-session drive-bys can inflate the all-identity cohort
	// past the 60-identity floor without ever being a retention signal. Below
	// the floor the result is inconclusive rather than failed, so a quiet
	// cohort cannot flip the gate red on a single visitor.
	{
		label: 'D1 retention (engaged) >= 15%',
		passed: engagedCohortSize < MIN_RETENTION_COHORT || engagedD1Rate >= 0.15,
		detail:
			engagedCohortSize < MIN_RETENTION_COHORT
				? `inconclusive (${engagedCohortSize} engaged identities, need ${MIN_RETENTION_COHORT})`
				: `${(engagedD1Rate * 100).toFixed(1)}% (${engagedD1Count}/${engagedCohortSize})`,
	},
	{
		label: 'D7 retention (engaged) >= 8%',
		passed: engagedCohortSize < MIN_RETENTION_COHORT || engagedD7Rate >= 0.08,
		detail:
			engagedCohortSize < MIN_RETENTION_COHORT
				? `inconclusive (${engagedCohortSize} engaged identities, need ${MIN_RETENTION_COHORT})`
				: `${(engagedD7Rate * 100).toFixed(1)}% (${engagedD7Count}/${engagedCohortSize})`,
	},
	{
		label: 'device profile coverage >= 80%',
		passed: profileCoverageShare === null || profileCoverageShare >= 0.8,
		detail:
			profileCoverageShare === null
				? 'no page views in window'
				: `${(profileCoverageShare * 100).toFixed(1)}% (${profileCoverage.profile_sessions}/${profileCoverage.page_sessions} sessions)`,
	},
];
for (const gate of gates) {
	console.log(`  ${gate.passed ? 'PASS' : 'FAIL'}  ${gate.label}  (${gate.detail})`);
}
const failedGates = gates.filter((gate) => !gate.passed);
console.log(
	failedGates.length === 0
		? '\nAll quality gates passed.'
		: `\n${failedGates.length} gate(s) failing.`
);
if (strict && failedGates.length > 0) {
	process.exitCode = 1;
}

console.log('\nReview checklist: docs/telemetry.md');
