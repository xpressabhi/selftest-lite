// SQL for the exam notification tracker, shared verbatim by the app
// (storage.js / ensureStorageSchema) and by scripts/sync-exam-notifications.mjs,
// which talks to Neon directly like the reminder/archive scripts. Keeping the
// statements here means the PGlite tests pin exactly what production runs.

import { deriveNotificationStatus } from './examNotifications.js';

export const EXAM_NOTIFICATION_SCHEMA_STATEMENTS = [
	`CREATE TABLE IF NOT EXISTS exam_notification (
		id BIGSERIAL PRIMARY KEY,
		dedupe_key TEXT NOT NULL UNIQUE,
		source_id TEXT NOT NULL,
		org TEXT NOT NULL,
		title TEXT NOT NULL,
		category TEXT,
		state TEXT,
		exam_id TEXT,
		notification_url TEXT NOT NULL,
		apply_url TEXT,
		published_at DATE,
		apply_start DATE,
		apply_end DATE,
		exam_date DATE,
		vacancies INTEGER,
		qualification TEXT,
		review_status TEXT NOT NULL DEFAULT 'published',
		failure_reason TEXT,
		confidence NUMERIC(3, 2),
		raw_json JSONB,
		first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`,
	`CREATE INDEX IF NOT EXISTS idx_exam_notification_public
		ON exam_notification (review_status, apply_end DESC NULLS LAST, published_at DESC NULLS LAST)`,
	`CREATE INDEX IF NOT EXISTS idx_exam_notification_source
		ON exam_notification (source_id, last_seen_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_exam_notification_exam
		ON exam_notification (exam_id) WHERE exam_id IS NOT NULL`,
	`CREATE TABLE IF NOT EXISTS exam_sync_run (
		id BIGSERIAL PRIMARY KEY,
		started_at TIMESTAMPTZ NOT NULL,
		finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		status TEXT NOT NULL DEFAULT 'ok',
		sources_total INTEGER NOT NULL DEFAULT 0,
		sources_ok INTEGER NOT NULL DEFAULT 0,
		sources_failed INTEGER NOT NULL DEFAULT 0,
		items_new INTEGER NOT NULL DEFAULT 0,
		items_updated INTEGER NOT NULL DEFAULT 0,
		items_quarantined INTEGER NOT NULL DEFAULT 0,
		discovery_suggestions INTEGER NOT NULL DEFAULT 0,
		error_json JSONB NOT NULL DEFAULT '[]'::jsonb
	)`,
	`CREATE INDEX IF NOT EXISTS idx_exam_sync_run_finished
		ON exam_sync_run (finished_at DESC)`,
	`CREATE TABLE IF NOT EXISTS exam_source_suggestion (
		id BIGSERIAL PRIMARY KEY,
		candidate_url TEXT NOT NULL UNIQUE,
		org TEXT,
		category TEXT,
		reason TEXT,
		status TEXT NOT NULL DEFAULT 'pending',
		first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`
];

// Upsert a validated notification. Dates/links only fill in, never erase: a
// later extraction that misses a date keeps the stored one. A row that was
// quarantined earlier is promoted back to published once it validates.
export const UPSERT_EXAM_NOTIFICATION_SQL = `
	INSERT INTO exam_notification (
		dedupe_key, source_id, org, title, category, state, exam_id,
		notification_url, apply_url, published_at, apply_start, apply_end, exam_date,
		vacancies, qualification, confidence
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
	ON CONFLICT (dedupe_key) DO UPDATE SET
		org = EXCLUDED.org,
		title = EXCLUDED.title,
		category = COALESCE(EXCLUDED.category, exam_notification.category),
		state = COALESCE(EXCLUDED.state, exam_notification.state),
		exam_id = COALESCE(EXCLUDED.exam_id, exam_notification.exam_id),
		notification_url = EXCLUDED.notification_url,
		apply_url = COALESCE(EXCLUDED.apply_url, exam_notification.apply_url),
		published_at = COALESCE(EXCLUDED.published_at, exam_notification.published_at),
		apply_start = COALESCE(EXCLUDED.apply_start, exam_notification.apply_start),
		apply_end = COALESCE(EXCLUDED.apply_end, exam_notification.apply_end),
		exam_date = COALESCE(EXCLUDED.exam_date, exam_notification.exam_date),
		vacancies = COALESCE(EXCLUDED.vacancies, exam_notification.vacancies),
		qualification = COALESCE(EXCLUDED.qualification, exam_notification.qualification),
		confidence = COALESCE(EXCLUDED.confidence, exam_notification.confidence),
		review_status = 'published',
		failure_reason = NULL,
		raw_json = NULL,
		last_seen_at = NOW(),
		updated_at = NOW()
	RETURNING id, (xmax = 0) AS inserted
`;

// Quarantine hides a row from every public read. It never overwrites a
// published row: the WHERE clause makes the conflict path a no-op for rows
// that are already live, so a transient failure cannot unpublish anything.
export const INSERT_QUARANTINE_SQL = `
	INSERT INTO exam_notification (
		dedupe_key, source_id, org, title, category, state, exam_id,
		notification_url, apply_url, published_at, apply_start, apply_end, exam_date,
		vacancies, qualification, confidence, review_status, failure_reason, raw_json
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
		'quarantined', $17, $18::jsonb)
	ON CONFLICT (dedupe_key) DO UPDATE SET
		last_seen_at = NOW(),
		failure_reason = EXCLUDED.failure_reason,
		raw_json = EXCLUDED.raw_json
	WHERE exam_notification.review_status = 'quarantined'
	RETURNING id
`;

// Read window: anything published in the last ~year, plus still-relevant rows
// whose application or exam date is near (long-running recruitments).
export const READ_PUBLISHED_NOTIFICATIONS_SQL = `
	SELECT
		id, dedupe_key, source_id, org, title, category, state, exam_id,
		notification_url, apply_url,
		to_char(published_at, 'YYYY-MM-DD') AS published_at,
		to_char(apply_start, 'YYYY-MM-DD') AS apply_start,
		to_char(apply_end, 'YYYY-MM-DD') AS apply_end,
		to_char(exam_date, 'YYYY-MM-DD') AS exam_date,
		vacancies, qualification,
		first_seen_at, last_seen_at
	FROM exam_notification
	WHERE review_status = 'published'
		AND (
			COALESCE(published_at, first_seen_at::date) >= $1::date
			OR COALESCE(apply_end, exam_date) >= CURRENT_DATE - INTERVAL '30 days'
		)
	ORDER BY COALESCE(published_at, first_seen_at::date) DESC, id DESC
	LIMIT $2
`;

export const INSERT_SYNC_RUN_SQL = `
	INSERT INTO exam_sync_run (
		started_at, status, sources_total, sources_ok, sources_failed,
		items_new, items_updated, items_quarantined, discovery_suggestions, error_json
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
	RETURNING id
`;

// The public "last updated" stamp only trusts runs that actually synced
// notifications (discovery-only runs have no sources) and produced data;
// a fully failed run must not claim freshness.
export const READ_LATEST_SYNC_RUN_SQL = `
	SELECT
		id, started_at, finished_at, status,
		sources_total, sources_ok, sources_failed,
		items_new, items_updated, items_quarantined, discovery_suggestions
	FROM exam_sync_run
	WHERE status IN ('ok', 'partial') AND sources_total > 0
	ORDER BY id DESC
	LIMIT 1
`;

export const UPSERT_SOURCE_SUGGESTION_SQL = `
	INSERT INTO exam_source_suggestion (candidate_url, org, category, reason)
	VALUES ($1, $2, $3, $4)
	ON CONFLICT (candidate_url) DO UPDATE SET
		last_seen_at = NOW(),
		org = COALESCE(EXCLUDED.org, exam_source_suggestion.org),
		category = COALESCE(EXCLUDED.category, exam_source_suggestion.category),
		reason = COALESCE(EXCLUDED.reason, exam_source_suggestion.reason)
	WHERE exam_source_suggestion.status = 'pending'
	RETURNING id
`;

export const READ_PENDING_SOURCE_SUGGESTIONS_SQL = `
	SELECT id, candidate_url, org, category, reason, first_seen_at, last_seen_at
	FROM exam_source_suggestion
	WHERE status = 'pending'
	ORDER BY first_seen_at ASC, id ASC
`;

// Recent rows for one source: every dedupe key (quarantined ones included, so
// they can heal) plus published titles and keys for near-duplicate checks and
// the reachability skip.
export const LOOKUP_SOURCE_NOTIFICATIONS_SQL = `
	SELECT dedupe_key, title, review_status
	FROM exam_notification
	WHERE source_id = $1 AND last_seen_at > NOW() - INTERVAL '120 days'
`;

export const MARK_SOURCE_SUGGESTIONS_ADDED_SQL = `
	UPDATE exam_source_suggestion
	SET status = 'added', last_seen_at = NOW()
	WHERE id = ANY($1::bigint[]) AND status = 'pending'
	RETURNING id
`;

// Retention for the weekly archive run: published rows that are long over and
// unseen for 90 days, plus stale quarantine rows. Nothing is ever deleted —
// the move statement below inserts into the archive in the same statement.
export const EXAM_NOTIFICATION_ARCHIVE_TARGETS = [
	{
		table: 'exam_notification',
		archive: 'exam_notification_archive',
		ageColumn: 'COALESCE(apply_end, published_at, first_seen_at::date)',
		days: 180,
		filter: `AND review_status = 'published' AND last_seen_at < NOW() - INTERVAL '90 days'`
	},
	{
		table: 'exam_notification',
		archive: 'exam_notification_archive',
		ageColumn: 'first_seen_at',
		days: 90,
		filter: `AND review_status = 'quarantined'`
	}
];

/**
 * One batch of the archive move: DELETE ... RETURNING into INSERT in a single
 * statement, so a failed insert rolls back the delete and data cannot be lost.
 * Table and column names come from the constants above, never from input.
 */
export function buildArchiveMoveSql(target, batchSize = 5000) {
	return `
		WITH moved AS (
			DELETE FROM ${target.table}
			WHERE id IN (
				SELECT id FROM ${target.table}
				WHERE ${target.ageColumn} < NOW() - ${target.days}::int * INTERVAL '1 day'
					${target.filter || ''}
				ORDER BY id
				LIMIT ${batchSize}
			)
			RETURNING *
		)
		INSERT INTO ${target.archive}
		SELECT *, NOW() FROM moved
		RETURNING id
	`;
}

function isoDateFromRow(value) {
	if (value === null || value === undefined) {
		return null;
	}
	if (value instanceof Date) {
		return value.toISOString().slice(0, 10);
	}
	return String(value).slice(0, 10);
}

/**
 * DB row → page item. `todayIso` decides the derived status; `now` decides
 * the "new" badge so tests can pin both.
 */
export function toNotificationItem(row, todayIso, now = new Date()) {
	const applyEnd = isoDateFromRow(row.apply_end);
	const examDate = isoDateFromRow(row.exam_date);
	const firstSeenAt = row.first_seen_at ? new Date(row.first_seen_at) : null;
	return {
		id: Number(row.id),
		sourceId: row.source_id,
		org: row.org,
		title: row.title,
		category: row.category,
		state: row.state,
		examId: row.exam_id,
		notificationUrl: row.notification_url,
		applyUrl: row.apply_url,
		publishedAt: isoDateFromRow(row.published_at),
		applyStart: isoDateFromRow(row.apply_start),
		applyEnd,
		examDate,
		vacancies: row.vacancies === null || row.vacancies === undefined ? null : Number(row.vacancies),
		qualification: row.qualification,
		status: deriveNotificationStatus({ applyEnd, examDate }, todayIso),
		firstSeenAt: firstSeenAt ? firstSeenAt.toISOString() : null,
		isNew: firstSeenAt ? now.getTime() - firstSeenAt.getTime() <= 7 * 24 * 60 * 60 * 1000 : false
	};
}
