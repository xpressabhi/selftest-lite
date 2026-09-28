import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	DUE_SUBSCRIPTION_PARAMS,
	DUE_SUBSCRIPTIONS_SQL,
	REMINDER_EARLIEST_HOUR,
} from './reminders';

// The due rule is one SQL statement, and the reminder e2e suite that exercises
// it end to end needs Chrome, FCM and a real database (npm run test:e2e:push).
// This suite runs the same statement against an in-process Postgres so the
// evening window and the already-practiced-today skip are pinned where they
// live.
//
// A row's local clock is placed by picking a fixed-offset timezone; each hour
// below is chosen far enough from the window edges that a minute or hour
// tick between seeding and querying cannot flip the expectation.

/** Etc/GMT timezone whose local hour is `hour` right now (minute unchanged). */
function timezoneForLocalHour(hour, now = new Date()) {
	const utcHour = now.getUTCHours();
	let offset = (hour - utcHour + 24) % 24;
	if (offset > 14) {
		offset -= 24;
	}
	if (offset === 0) {
		return 'Etc/GMT0';
	}
	return `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
}

// id, local hour, reminder_hour (null = smart), enabled, last_sent_at, due?,
// plus optional client/user links for the practiced-today rule.
const cases = [
	{ id: 1, hour: 15, chosen: null, enabled: true, sentHoursAgo: null, due: false }, // before the 16:00 window
	{ id: 2, hour: 17, chosen: null, enabled: true, sentHoursAgo: null, due: true }, // window open
	{ id: 3, hour: 21, chosen: null, enabled: true, sentHoursAgo: null, due: true, language: 'hi' }, // catch-up
	{ id: 4, hour: 23, chosen: null, enabled: true, sentHoursAgo: null, due: false }, // quiet hour
	{ id: 5, hour: 17, chosen: 15, enabled: true, sentHoursAgo: null, due: true }, // early choice clamps to 16:00
	{ id: 6, hour: 15, chosen: 9, enabled: true, sentHoursAgo: null, due: false }, // clamped open still ahead
	{ id: 7, hour: 17, chosen: 20, enabled: true, sentHoursAgo: null, due: false }, // chosen slot still ahead
	{ id: 8, hour: 22, chosen: 22, enabled: true, sentHoursAgo: null, due: true }, // at/after quiet, own hour
	{ id: 9, hour: 1, chosen: 23, enabled: true, sentHoursAgo: null, due: false }, // day wrapped
	{ id: 10, hour: 17, chosen: null, enabled: false, sentHoursAgo: null, due: false }, // disabled
	{ id: 11, hour: 17, chosen: null, enabled: true, sentHoursAgo: 10, due: false }, // inside min gap
	{ id: 12, hour: 17, chosen: null, enabled: true, sentHoursAgo: 21, due: true }, // caught up, gap passed
	// The already-practiced-today rule: a matching attempt skips the reminder.
	{ id: 13, hour: 17, chosen: null, enabled: true, sentHoursAgo: null, due: false, clientId: 'c-today' },
	{ id: 14, hour: 17, chosen: null, enabled: true, sentHoursAgo: null, due: true, clientId: 'c-other' },
	{ id: 15, hour: 17, chosen: null, enabled: true, sentHoursAgo: null, due: false, userId: 42 },
	{ id: 16, hour: 17, chosen: null, enabled: true, sentHoursAgo: null, due: true, clientId: 'c-old' },
	{ id: 17, hour: 17, chosen: null, enabled: true, sentHoursAgo: null, due: true }, // null links never skip
];

// Attempts seeded relative to now; a 2-hour-old attempt is after local
// midnight for the hour-17 rows (local midnight was ~17 hours ago), a
// 30-hour-old one lands on the previous local day.
const attempts = [
	{ clientId: 'c-today', userId: null, hoursAgo: 2 },
	{ clientId: 'cX', userId: null, hoursAgo: 2 },
	{ clientId: null, userId: 42, hoursAgo: 2 },
	{ clientId: 'c-old', userId: null, hoursAgo: 30 },
	{ clientId: null, userId: null, hoursAgo: 2 },
];

let db;

beforeAll(async () => {
	db = new PGlite();
	await db.query(`
		CREATE TABLE push_subscription (
			id INTEGER PRIMARY KEY,
			endpoint TEXT NOT NULL,
			p256dh TEXT NOT NULL,
			auth TEXT NOT NULL,
			timezone TEXT NOT NULL,
			enabled BOOLEAN NOT NULL DEFAULT TRUE,
			reminder_hour SMALLINT,
			last_sent_at TIMESTAMPTZ,
			client_id TEXT,
			user_id INTEGER,
			language TEXT NOT NULL DEFAULT 'en'
		)
	`);
	await db.query(`
		CREATE TABLE ai_test_attempts (
			id INTEGER PRIMARY KEY,
			client_id TEXT,
			user_id INTEGER,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`);
	const values = [];
	const params = [];
	for (const row of cases) {
		params.push(timezoneForLocalHour(row.hour));
		const tzParam = params.length;
		params.push(row.clientId ?? null, row.userId ?? null, row.language ?? 'en');
		const sent = row.sentHoursAgo === null ? 'NULL' : `NOW() - make_interval(hours => ${row.sentHoursAgo})`;
		values.push(
			`(${row.id}, 'sock-${row.id}', 'p', 'a', $${tzParam}, ${row.enabled}, ${row.chosen ?? 'NULL'}, ${sent}, $${tzParam + 1}, $${tzParam + 2}, $${tzParam + 3})`
		);
	}
	await db.query(
		`INSERT INTO push_subscription
			(id, endpoint, p256dh, auth, timezone, enabled, reminder_hour, last_sent_at, client_id, user_id, language)
		 VALUES ${values.join(', ')}`,
		params
	);

	const attemptValues = [];
	const attemptParams = [];
	for (const [index, attempt] of attempts.entries()) {
		attemptParams.push(attempt.clientId ?? null, attempt.userId ?? null);
		attemptValues.push(
			`(${index + 1}, $${attemptParams.length - 1}, $${attemptParams.length}, NOW() - make_interval(hours => ${attempt.hoursAgo}))`
		);
	}
	await db.query(
		`INSERT INTO ai_test_attempts (id, client_id, user_id, created_at)
		 VALUES ${attemptValues.join(', ')}`,
		attemptParams
	);
});

afterAll(async () => {
	await db?.close();
});

describe('due subscription query', () => {
	it('returns exactly the subscriptions inside their evening window', async () => {
		const { rows } = await db.query(DUE_SUBSCRIPTIONS_SQL, DUE_SUBSCRIPTION_PARAMS);
		const dueIds = rows.map((row) => row.id).sort((a, b) => a - b);
		const expected = cases.filter((row) => row.due).map((row) => row.id);
		expect(dueIds).toEqual(expected);
	});

	it('never opens the window before the earliest evening hour', () => {
		expect(REMINDER_EARLIEST_HOUR).toBe(16);
		expect(DUE_SUBSCRIPTION_PARAMS.at(-1)).toBe(REMINDER_EARLIEST_HOUR);
	});

	it('returns the transport fields the sender needs', async () => {
		const { rows } = await db.query(DUE_SUBSCRIPTIONS_SQL, DUE_SUBSCRIPTION_PARAMS);
		const caughtUp = rows.find((row) => row.id === 3);
		expect(caughtUp).toMatchObject({ endpoint: 'sock-3', p256dh: 'p', auth: 'a', language: 'hi' });
		expect(caughtUp.timezone).toMatch(/^Etc\/GMT/);
	});
});
