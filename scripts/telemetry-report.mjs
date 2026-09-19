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
