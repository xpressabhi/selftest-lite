// A database stamped with the current schema version skips every DDL
// statement — so a schema change that ships without a version bump never
// reaches existing databases. That happened to the push language column:
// production stayed at version 10 without `language` and the hourly reminder
// sender died on `column "language" does not exist` (2026-09-28). This pins
// the upgrade path from that stamp and the sender's SQL against it.
//
// The full production replay takes seconds on PGlite, hence the timeout.
import { describe, expect, it } from 'vitest';

process.env.DATABASE_URL = 'pglite://memory';

const { ensureStorageSchema, query } = await import('./storage.js');
const { DUE_SUBSCRIPTIONS_SQL, DUE_SUBSCRIPTION_PARAMS } = await import('../shared/reminders.js');

describe('ensureStorageSchema upgrade from the language-less stamp', () => {
	it('adds push_subscription.language and the reminder sender query runs', async () => {
		// The shape production was in: stamped at version 10, no `language`.
		await query(`
			CREATE TABLE IF NOT EXISTS app_schema (
				id SMALLINT PRIMARY KEY,
				version INTEGER NOT NULL,
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);
		await query(`
			CREATE TABLE IF NOT EXISTS push_subscription (
				id BIGSERIAL PRIMARY KEY,
				client_id TEXT,
				user_id BIGINT,
				endpoint TEXT NOT NULL UNIQUE,
				p256dh TEXT NOT NULL,
				auth TEXT NOT NULL,
				timezone TEXT,
				enabled BOOLEAN NOT NULL DEFAULT TRUE,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				last_sent_at TIMESTAMPTZ,
				last_error TEXT,
				reminder_hour SMALLINT CHECK (reminder_hour BETWEEN 0 AND 23)
			)
		`);
		await query(`
			CREATE TABLE IF NOT EXISTS ai_test_attempts (
				id BIGSERIAL PRIMARY KEY,
				client_id TEXT,
				user_id BIGINT,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`);
		await query(
			`INSERT INTO app_schema (id, version) VALUES (1, 10)
			 ON CONFLICT (id) DO NOTHING`
		);

		await ensureStorageSchema();

		const columns = await query(
			`SELECT column_name FROM information_schema.columns WHERE table_name = 'push_subscription'`
		);
		expect(columns.rows.map((row) => row.column_name)).toContain('language');

		// What scripts/send-reminders.mjs runs against production.
		await expect(query(DUE_SUBSCRIPTIONS_SQL, DUE_SUBSCRIPTION_PARAMS)).resolves.toBeDefined();
	}, 60000);
});
