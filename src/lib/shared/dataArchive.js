// Archive DDL for the never-delete data policy.
//
// Any row that leaves a hot table (retention, dedupe, logout, revocation) is
// first moved into a matching `*_archive` table in the same SQL statement, so
// a failed insert rolls back the delete and data cannot be lost. Archive
// tables share the source column layout plus `archived_at`.
//
// Used by ensureStorageSchema() and by scripts/archive-telemetry.mjs.

export const ARCHIVE_TABLE_STATEMENTS = [
	`CREATE TABLE IF NOT EXISTS feature_events_archive (LIKE feature_events INCLUDING DEFAULTS)`,
	`ALTER TABLE feature_events_archive ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
	`CREATE TABLE IF NOT EXISTS api_request_events_archive (LIKE api_request_events INCLUDING DEFAULTS)`,
	`ALTER TABLE api_request_events_archive ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
	`CREATE TABLE IF NOT EXISTS api_rate_limit_events_archive (LIKE api_rate_limit_events INCLUDING DEFAULTS)`,
	`ALTER TABLE api_rate_limit_events_archive ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
	`CREATE TABLE IF NOT EXISTS app_user_state_archive (LIKE app_user_state INCLUDING DEFAULTS)`,
	`ALTER TABLE app_user_state_archive ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
	`CREATE TABLE IF NOT EXISTS app_user_session_archive (LIKE app_user_session INCLUDING DEFAULTS)`,
	`ALTER TABLE app_user_session_archive ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
	`CREATE TABLE IF NOT EXISTS push_subscription_archive (LIKE push_subscription INCLUDING DEFAULTS)`,
	`ALTER TABLE push_subscription_archive ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
	`ALTER TABLE push_subscription_archive ADD COLUMN IF NOT EXISTS reminder_hour SMALLINT`,
];
