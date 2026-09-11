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
	const line = (cells) => `  ${cells.map((cell, index) => String(cell).padEnd(widths[index])).join('  ')}`;
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

section('Rate-limit trips');
printTable(
	await sql`
		SELECT
			route,
			COUNT(*)::int AS trips,
			COUNT(DISTINCT client_key)::int AS clients
		FROM api_rate_limit_events
		WHERE created_at >= NOW() - ${days}::int * INTERVAL '1 day'
		GROUP BY route
		ORDER BY trips DESC
		LIMIT 12
	`,
	[
		{ key: 'route', label: 'route' },
		{ key: 'trips', label: 'trips' },
		{ key: 'clients', label: 'clients' },
	]
);

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

section('Quality gates');
const generationSuccessRate =
	generation.starts > 0 ? generation.successes / generation.starts : 1;
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
];
for (const gate of gates) {
	console.log(`  ${gate.passed ? 'PASS' : 'FAIL'}  ${gate.label}  (${gate.detail})`);
}
const failedGates = gates.filter((gate) => !gate.passed);
console.log(
	failedGates.length === 0 ? '\nAll quality gates passed.' : `\n${failedGates.length} gate(s) failing.`
);
if (strict && failedGates.length > 0) {
	process.exitCode = 1;
}

console.log('\nReview checklist: docs/telemetry.md');
