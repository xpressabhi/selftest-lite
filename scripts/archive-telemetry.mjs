#!/usr/bin/env node
// Archives old telemetry rows into *_archive tables. NEVER deletes data:
// each batch moves rows with DELETE ... RETURNING -> INSERT into the archive
// in a single statement, so if the insert fails the delete rolls back and
// nothing is lost. Archived rows stay queryable forever.
//
// Usage:
//   npm run telemetry:archive                       # dry run
//   npm run telemetry:archive -- --apply
//   npm run telemetry:archive -- --feature-days=365 --api-days=180 --apply

import { neon } from '@neondatabase/serverless';
import { ARCHIVE_TABLE_STATEMENTS } from '../src/lib/shared/dataArchive.js';
import {
	buildArchiveMoveSql,
	EXAM_NOTIFICATION_ARCHIVE_TARGETS,
	EXAM_NOTIFICATION_SCHEMA_STATEMENTS
} from '../src/lib/shared/examNotificationSql.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');

function numberArg(prefix, fallback) {
	const found = args.find((argument) => argument.startsWith(prefix));
	const value = Number(found?.split('=')[1]);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

const featureDays = numberArg('--feature-days=', 180);
const apiDays = numberArg('--api-days=', 90);
const rateLimitDays = numberArg('--rate-limit-days=', 2);
const batchSize = Math.min(numberArg('--batch=', 5000), 20000);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error(
		'DATABASE_URL is not set. Run via `npm run telemetry:archive` (loads .env/.env.local) or export it first.'
	);
	process.exit(1);
}

const sql = neon(databaseUrl);

// The tracker's hot table must exist before its archive table copies the
// column layout; a fresh database may never have run the app yet.
for (const statement of EXAM_NOTIFICATION_SCHEMA_STATEMENTS) {
	await sql.query(statement);
}

// Archive tables must exist before any move; CREATE ... IF NOT EXISTS is safe.
for (const statement of ARCHIVE_TABLE_STATEMENTS) {
	await sql.query(statement);
}

const targets = [
	{
		table: 'feature_events',
		archive: 'feature_events_archive',
		ageColumn: 'created_at',
		filter: '',
		days: featureDays
	},
	{
		table: 'api_request_events',
		archive: 'api_request_events_archive',
		ageColumn: 'created_at',
		filter: '',
		days: apiDays
	},
	{
		table: 'api_rate_limit_events',
		archive: 'api_rate_limit_events_archive',
		ageColumn: 'created_at',
		filter: '',
		days: rateLimitDays
	},
	...EXAM_NOTIFICATION_ARCHIVE_TARGETS
];

const pending = [];
for (const target of targets) {
	const result = await sql.query(`
		SELECT COUNT(*)::int AS n FROM ${target.table}
		WHERE ${target.ageColumn} < NOW() - ${target.days}::int * INTERVAL '1 day'
			${target.filter || ''}
	`);
	pending.push({ ...target, count: result[0].n });
}

console.log('Rows ready to archive:');
for (const target of pending) {
	console.log(`  ${target.table} (older than ${target.days}d): ${target.count}`);
}

if (!apply) {
	console.log('\nDry run. Re-run with --apply to move these rows into the archive tables.');
	process.exit(0);
}

async function archiveBatch(target) {
	const result = await sql.query(buildArchiveMoveSql(target, batchSize));
	return result.length;
}

for (const target of pending) {
	let moved = 0;
	for (;;) {
		const movedInBatch = await archiveBatch(target);
		moved += movedInBatch;
		if (movedInBatch < batchSize) {
			break;
		}
	}
	console.log(`Archived ${moved} ${target.table} row(s) into ${target.archive}.`);
}
