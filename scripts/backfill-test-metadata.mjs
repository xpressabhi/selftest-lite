#!/usr/bin/env node
// One-time backfill for normalized ai_test metadata columns.
//
// Usage:
//   npm run telemetry:backfill            # dry run, prints what would change
//   npm run telemetry:backfill -- --apply # writes the updates
//
// The generate endpoint used to store testMode/examId/objectiveOnly/
// durationMinutes only inside the test JSON, leaving the normalized columns
// NULL and breaking admin breakdowns. This script copies those values out of
// test->'requestParams' for rows that are still missing them.

import { neon } from '@neondatabase/serverless';

const args = process.argv.slice(2);
const apply = args.includes('--apply');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error(
		'DATABASE_URL is not set. Run via `npm run telemetry:backfill` (loads .env.local/.env) or export it first.'
	);
	process.exit(1);
}

const sql = neon(databaseUrl);

const MISSING_PREDICATE = `
	test->'requestParams' IS NOT NULL
	AND (
		(test_mode IS NULL AND test->'requestParams'->>'testMode' IS NOT NULL)
		OR (test_type IS NULL AND test->'requestParams'->>'testType' IS NOT NULL)
		OR (difficulty IS NULL AND test->'requestParams'->>'difficulty' IS NOT NULL)
		OR (language IS NULL AND test->'requestParams'->>'language' IS NOT NULL)
		OR (exam_id IS NULL AND NULLIF(test->'requestParams'->>'examId', '') IS NOT NULL)
		OR (objective_only IS NULL AND test->'requestParams'->>'objectiveOnly' IS NOT NULL)
		OR (duration_minutes IS NULL AND NULLIF(test->'requestParams'->>'durationMinutes', '') IS NOT NULL)
		OR (num_questions IS NULL AND jsonb_typeof(test::jsonb->'questions') = 'array')
	)
`;

const counts = (
	await sql.query(`
		SELECT
			COUNT(*)::int AS rows,
			COUNT(*) FILTER (WHERE test_mode IS NULL AND test->'requestParams'->>'testMode' IS NOT NULL)::int AS test_mode,
			COUNT(*) FILTER (WHERE test_type IS NULL AND test->'requestParams'->>'testType' IS NOT NULL)::int AS test_type,
			COUNT(*) FILTER (WHERE difficulty IS NULL AND test->'requestParams'->>'difficulty' IS NOT NULL)::int AS difficulty,
			COUNT(*) FILTER (WHERE language IS NULL AND test->'requestParams'->>'language' IS NOT NULL)::int AS language,
			COUNT(*) FILTER (WHERE exam_id IS NULL AND NULLIF(test->'requestParams'->>'examId', '') IS NOT NULL)::int AS exam_id,
			COUNT(*) FILTER (WHERE objective_only IS NULL AND test->'requestParams'->>'objectiveOnly' IS NOT NULL)::int AS objective_only,
			COUNT(*) FILTER (WHERE duration_minutes IS NULL AND NULLIF(test->'requestParams'->>'durationMinutes', '') IS NOT NULL)::int AS duration_minutes,
			COUNT(*) FILTER (WHERE num_questions IS NULL AND jsonb_typeof(test::jsonb->'questions') = 'array')::int AS num_questions
		FROM ai_test
		WHERE ${MISSING_PREDICATE}
	`)
)[0];

console.log('Rows needing backfill:', JSON.stringify(counts, null, 2));

const samples = await sql.query(`
	SELECT
		id,
		test->'requestParams'->>'testMode' AS test_mode,
		test->'requestParams'->>'testType' AS test_type,
		test->'requestParams'->>'difficulty' AS difficulty,
		test->'requestParams'->>'language' AS language,
		test->'requestParams'->>'examId' AS exam_id,
		test->'requestParams'->>'objectiveOnly' AS objective_only,
		test->'requestParams'->>'durationMinutes' AS duration_minutes
	FROM ai_test
	WHERE ${MISSING_PREDICATE}
	ORDER BY id DESC
	LIMIT 5
`);
console.log('\nSample rows:', JSON.stringify(samples, null, 2));

if (!apply) {
	console.log('\nDry run. Re-run with --apply to write these updates.');
	process.exit(0);
}

const result = await sql.query(`
	UPDATE ai_test SET
		test_mode = COALESCE(test_mode, NULLIF(test->'requestParams'->>'testMode', '')),
		test_type = COALESCE(test_type, NULLIF(test->'requestParams'->>'testType', '')),
		difficulty = COALESCE(difficulty, NULLIF(test->'requestParams'->>'difficulty', '')),
		language = COALESCE(language, NULLIF(test->'requestParams'->>'language', '')),
		exam_id = COALESCE(exam_id, NULLIF(test->'requestParams'->>'examId', '')),
		objective_only = COALESCE(objective_only, (test->'requestParams'->>'objectiveOnly')::boolean),
		duration_minutes = COALESCE(duration_minutes, (NULLIF(test->'requestParams'->>'durationMinutes', ''))::numeric::int),
		num_questions = COALESCE(num_questions, CASE WHEN jsonb_typeof(test::jsonb->'questions') = 'array' THEN jsonb_array_length(test::jsonb->'questions') END)
	WHERE ${MISSING_PREDICATE}
	RETURNING id
`);

console.log(`\nBackfill applied to ${result.length} row(s).`);
