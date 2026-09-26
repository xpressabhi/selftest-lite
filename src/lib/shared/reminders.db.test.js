import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	DUE_SUBSCRIPTION_PARAMS,
	DUE_SUBSCRIPTIONS_SQL,
} from './reminders';

// The due rule is one SQL statement, and the reminder e2e suite that exercises
// it end to end needs Chrome, FCM and a real database (npm run test:e2e:push).
// This suite runs the same statement against an in-process Postgres so the
// catch-up window is pinned where it lives.
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

// id, local hour, reminder_hour (null = smart), enabled, last_sent_at, due?
const cases = [
	{ id: 1, hour: 4, chosen: null, enabled: true, sentHoursAgo: null, due: false }, // before the default hour
	{ id: 2, hour: 9, chosen: null, enabled: true, sentHoursAgo: null, due: true }, // window open
	{ id: 3, hour: 12, chosen: null, enabled: true, sentHoursAgo: null, due: true }, // catch-up
	{ id: 4, hour: 19, chosen: null, enabled: true, sentHoursAgo: null, due: true }, // still before quiet hour
	{ id: 5, hour: 23, chosen: null, enabled: true, sentHoursAgo: null, due: false }, // quiet hour
	{ id: 6, hour: 12, chosen: 15, enabled: true, sentHoursAgo: null, due: false }, // slot still ahead
	{ id: 7, hour: 12, chosen: 9, enabled: true, sentHoursAgo: null, due: true }, // chosen slot passed
	{ id: 8, hour: 22, chosen: 22, enabled: true, sentHoursAgo: null, due: true }, // at/after quiet, own hour
	{ id: 9, hour: 1, chosen: 23, enabled: true, sentHoursAgo: null, due: false }, // day wrapped
	{ id: 10, hour: 12, chosen: null, enabled: false, sentHoursAgo: null, due: false }, // disabled
	{ id: 11, hour: 12, chosen: null, enabled: true, sentHoursAgo: 10, due: false }, // inside min gap
	{ id: 12, hour: 12, chosen: null, enabled: true, sentHoursAgo: 21, due: true }, // caught up, gap passed
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
			last_sent_at TIMESTAMPTZ
		)
	`);
	const values = [];
	const params = [];
	for (const row of cases) {
		params.push(timezoneForLocalHour(row.hour));
		const sent = row.sentHoursAgo === null ? 'NULL' : `NOW() - make_interval(hours => ${row.sentHoursAgo})`;
		values.push(`(${row.id}, 'sock-${row.id}', 'p', 'a', $${params.length}, ${row.enabled}, ${row.chosen ?? 'NULL'}, ${sent})`);
	}
	await db.query(
		`INSERT INTO push_subscription (id, endpoint, p256dh, auth, timezone, enabled, reminder_hour, last_sent_at)
		 VALUES ${values.join(', ')}`,
		params
	);
});

afterAll(async () => {
	await db?.close();
});

describe('due subscription query', () => {
	it('returns exactly the subscriptions inside their catch-up window', async () => {
		const { rows } = await db.query(DUE_SUBSCRIPTIONS_SQL, DUE_SUBSCRIPTION_PARAMS);
		const dueIds = rows.map((row) => row.id).sort((a, b) => a - b);
		const expected = cases.filter((row) => row.due).map((row) => row.id);
		expect(dueIds).toEqual(expected);
	});

	it('returns the transport fields the sender needs', async () => {
		const { rows } = await db.query(DUE_SUBSCRIPTIONS_SQL, DUE_SUBSCRIPTION_PARAMS);
		const caughtUp = rows.find((row) => row.id === 3);
		expect(caughtUp).toMatchObject({ endpoint: 'sock-3', p256dh: 'p', auth: 'a' });
		expect(caughtUp.timezone).toMatch(/^Etc\/GMT/);
	});
});
