#!/usr/bin/env node
// Read-only telemetry report for selftest-lite.
//
// Usage:
//   npm run telemetry:report -- --days=30
//
// The npm script loads DATABASE_URL from .env.local / .env. This script only
// runs SELECTs; it never writes to the database. See docs/telemetry.md for the
// review checklist that goes with it.

import { neon } from '@neondatabase/serverless';
import { TELEMETRY_EVENTS } from '../src/lib/shared/telemetryEvents.js';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
	console.log('Usage: npm run telemetry:report -- [--days=30]');
	process.exit(0);
}

const daysArgument = args.find((argument) => argument.startsWith('--days='));
const days = Math.min(Math.max(Number(daysArgument?.split('=')[1]) || 30, 1), 365);
const strict = args.includes('--strict');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error(
		'DATABASE_URL is not set. Run via `npm run telemetry:report` (loads .env.local/.env) or export it first.'
	);
	process.exit(1);
}

const sql = neon(databaseUrl);

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
const topEvents = await sql`
	SELECT
		event,
		COUNT(*)::int AS events,
		COUNT(DISTINCT COALESCE(user_id::text, client_id))::int AS identities,
		MAX(created_at)::date AS last_seen
	FROM feature_events
	WHERE created_at >= NOW() - ${days}::int * INTERVAL '1 day'
	GROUP BY event
	ORDER BY events DESC
	LIMIT 25
`;
printTable(topEvents, [
	{ key: 'event', label: 'event' },
	{ key: 'events', label: 'events' },
	{ key: 'identities', label: 'identities' },
	{ key: 'last_seen', label: 'last seen' },
]);

const seenEvents = new Set(topEvents.map((row) => row.event));
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

section('API hotspots');
printTable(
	await sql`
		SELECT
			route,
			COUNT(*)::int AS requests,
			COUNT(*) FILTER (WHERE status_code >= 400 AND status_code NOT IN (401, 429))::int AS errors,
			COUNT(*) FILTER (WHERE status_code = 401)::int AS unauth,
			COUNT(*) FILTER (WHERE status_code = 429)::int AS limited,
			COALESCE(ROUND(AVG(duration_ms)), 0)::int AS avg_ms,
			COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)::int, 0) AS p95_ms
		FROM api_request_events
		WHERE created_at >= NOW() - ${days}::int * INTERVAL '1 day'
		GROUP BY route
		ORDER BY requests DESC
		LIMIT 15
	`,
	[
		{ key: 'route', label: 'route' },
		{ key: 'requests', label: 'requests' },
		{ key: 'errors', label: 'errors' },
		{ key: 'unauth', label: '401s' },
		{ key: 'limited', label: '429s' },
		{ key: 'avg_ms', label: 'avg ms' },
		{ key: 'p95_ms', label: 'p95 ms' },
	]
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

const profileCoverage = (
	await sql`
		SELECT
			COUNT(DISTINCT session_id) FILTER (WHERE event = 'page:view')::int AS page_sessions,
			COUNT(DISTINCT session_id) FILTER (WHERE event = 'device:profile')::int AS profile_sessions
		FROM feature_events
		WHERE event IN ('page:view', 'device:profile')
			AND session_id IS NOT NULL
			AND created_at >= NOW() - ${days}::int * INTERVAL '1 day'
	`
)[0];
const profileCoverageShare =
	profileCoverage.page_sessions > 0
		? profileCoverage.profile_sessions / profileCoverage.page_sessions
		: null;

section('Data quality');
const quality = (
	await sql`
		SELECT
			COUNT(*)::int AS tests,
			COUNT(*) FILTER (WHERE test_mode IS NULL)::int AS mode_null,
			COUNT(*) FILTER (WHERE difficulty IS NULL)::int AS difficulty_null,
			COUNT(*) FILTER (WHERE language IS NULL)::int AS language_null
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
		WHERE created_at >= NOW() - ${days}::int * INTERVAL '1 day'
	`
)[0];
const serverErrors = (
	await sql`
		SELECT COUNT(*)::int AS server_errors
		FROM api_request_events
		WHERE status_code >= 500 AND created_at >= NOW() - ${days}::int * INTERVAL '1 day'
	`
)[0];
console.log(`  tests generated:        ${quality.tests}`);
console.log(
	`  null test_mode:         ${quality.mode_null} (${percent(quality.mode_null, quality.tests)})`
);
console.log(
	`  null difficulty:        ${quality.difficulty_null} (${percent(quality.difficulty_null, quality.tests)})`
);
console.log(
	`  null language:          ${quality.language_null} (${percent(quality.language_null, quality.tests)})`
);
console.log(`  generate start/success: ${generation.starts} / ${generation.successes}`);
console.log(`  generate failures:      ${generation.failures}`);
console.log(
	`  explain ok/fail:        ${generation.explains} / ${generation.explain_failures} (${percent(generation.explain_failures, generation.explains + generation.explain_failures)} fail)`
);
console.log(`  server 5xx:             ${serverErrors.server_errors}`);

section('Content quality (last 7 days)');
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
		) x
	`
)[0];
const longestShare = lengthTell.total > 0 ? lengthTell.longest / lengthTell.total : 0;

const duplicateExtras = (
	await sql`
		SELECT COALESCE(SUM(n - 1), 0)::int AS extras
		FROM (
			SELECT COUNT(*)::int AS n
			FROM ai_test t
			CROSS JOIN LATERAL jsonb_array_elements((t.test::jsonb)->'questions') AS q
			WHERE t.created_at >= NOW() - INTERVAL '7 days'
			GROUP BY q->>'question'
			HAVING COUNT(*) > 1
		) x
	`
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
			SELECT a.test_id, (kv.key)::int AS qidx, kv.value AS user_answer
			FROM ai_test_attempts a
			CROSS JOIN LATERAL jsonb_each_text(a.user_answers) AS kv
			WHERE a.user_answers IS NOT NULL AND a.created_at >= NOW() - INTERVAL '90 days'
		),
		per_item AS (
			SELECT COUNT(*)::int AS attempts,
				ROUND(100.0 * COUNT(*) FILTER (WHERE a.user_answer = i.correct_answer) / COUNT(*))::int AS pct
			FROM answers a
			JOIN items i ON i.test_id = a.test_id AND i.qidx = a.qidx
			GROUP BY a.test_id, a.qidx
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

const latency = (
	await sql`
		SELECT
			COALESCE((SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)
				FROM api_request_events
				WHERE route = '/api/user/state' AND created_at >= NOW() - ${days}::int * INTERVAL '1 day')::int, 0) AS state_p95,
			COALESCE((SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)
				FROM api_request_events
				WHERE route = '/api/auth/me' AND created_at >= NOW() - ${days}::int * INTERVAL '1 day')::int, 0) AS auth_p95
	`
)[0];

const slowRequests = (
	await sql`
		SELECT
			COUNT(*)::int AS total,
			COUNT(*) FILTER (WHERE duration_ms > 10000)::int AS slow
		FROM api_request_events
		WHERE created_at >= NOW() - ${days}::int * INTERVAL '1 day'
	`
)[0];
const slowShare = slowRequests.total > 0 ? slowRequests.slow / slowRequests.total : 0;

section('Quality gates');
const generationSuccessRate = generation.starts > 0 ? generation.successes / generation.starts : 1;
const explainTotal = generation.explains + generation.explain_failures;
const explainFailRate = explainTotal > 0 ? generation.explain_failures / explainTotal : 0;
const gates = [
	{
		label: 'generate success >= 95%',
		passed: generation.starts === 0 || generationSuccessRate >= 0.95,
		detail: `${(generationSuccessRate * 100).toFixed(1)}%`,
	},
	{
		label: 'explain failure < 2%',
		passed: explainFailRate < 0.02,
		detail: `${(explainFailRate * 100).toFixed(1)}%`,
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
	{
		label: 'D1 retention >= 15%',
		passed: cohortSize === 0 || d1Rate >= 0.15,
		detail: `${(d1Rate * 100).toFixed(1)}%`,
	},
	{
		label: 'D7 retention >= 8%',
		passed: cohortSize === 0 || d7Rate >= 0.08,
		detail: `${(d7Rate * 100).toFixed(1)}%`,
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
