import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UPDATE_USER_FROM_GOOGLE_SQL } from './auth.js';
import { DETACH_GOOGLE_IDENTITY_SQL, UPDATE_APP_USER_NAME_SQL } from './storage.js';

// The name a user chooses must survive every later Google sign-in. Getting that
// wrong silently resets a name someone typed, and it only becomes visible after
// their next sign-in — so both statements are pinned against an in-process
// Postgres rather than trusted to review.
//
// Failure modes covered: Google overwriting a chosen name; Google failing to
// refresh a name the user never chose; the edited marker never being stamped
// (which would make the guard permanent-but-wrong in the other direction).

let db;

const GOOGLE_PROFILE = {
	googleSub: 'google-1',
	email: 'learner@example.com',
	name: 'Google Name',
	pictureUrl: null,
	locale: null,
};

async function insertUser({ googleSub = null, email = null, name }) {
	const result = await db.query(
		`INSERT INTO app_user (google_sub, email, name) VALUES ($1, $2, $3) RETURNING id, name`,
		[googleSub, email, name]
	);
	return result.rows[0];
}

function runGoogleUpdate(profile) {
	return db
		.query(UPDATE_USER_FROM_GOOGLE_SQL, [
			profile.googleSub,
			profile.email,
			profile.name,
			profile.pictureUrl,
			profile.locale,
		])
		.then((result) => result.rows[0]);
}

function runNameUpdate(userId, name) {
	return db.query(UPDATE_APP_USER_NAME_SQL, [userId, name]).then((result) => result.rows[0]);
}

function nameEditedAt(userId) {
	return db
		.query(`SELECT name_edited_at FROM app_user WHERE id = $1`, [userId])
		.then((result) => result.rows[0]?.name_edited_at ?? null);
}

beforeAll(async () => {
	db = new PGlite();
	await db.waitReady;
	// Only the columns these two statements touch, with the same nullability
	// and unique constraints the real table has.
	await db.exec(`
		CREATE TABLE app_user (
			id BIGSERIAL PRIMARY KEY,
			google_sub TEXT UNIQUE,
			email TEXT UNIQUE,
			name TEXT NOT NULL,
			picture_url TEXT,
			locale TEXT,
			name_edited_at TIMESTAMPTZ,
			last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`);
});

afterAll(async () => {
	await db?.close();
});

describe('account display name', () => {
	it('takes the Google name while the user has never chosen one', async () => {
		const user = await insertUser({
			googleSub: GOOGLE_PROFILE.googleSub,
			email: GOOGLE_PROFILE.email,
			name: 'Google Name',
		});
		expect(await nameEditedAt(user.id), 'a new account has not been edited').toBeNull();

		const updated = await runGoogleUpdate({ ...GOOGLE_PROFILE, name: 'Google Renamed' });

		expect(updated.id).toBe(user.id);
		expect(updated.name, 'Google owns the name until the user does').toBe('Google Renamed');
	});

	it('keeps the name the user chose, while still refreshing the rest', async () => {
		const user = await insertUser({
			googleSub: 'google-2',
			email: 'second@example.com',
			name: 'Google Two',
		});
		await runNameUpdate(user.id, 'Abhishek');

		const updated = await runGoogleUpdate({
			googleSub: 'google-2',
			email: 'second@example.com',
			name: 'Google Two Renamed',
			pictureUrl: 'https://example.com/p.jpg',
			locale: 'hi',
		});

		expect(updated.name, 'the chosen name must survive the sign-in').toBe('Abhishek');
		expect(updated.locale, 'everything else still refreshes').toBe('hi');
	});

	it('stamps the edited marker, so a passkey account can adopt a Google name first', async () => {
		const user = await insertUser({ name: 'Learner 4821' });
		expect(await nameEditedAt(user.id)).toBeNull();

		const updated = await runNameUpdate(user.id, 'Abhishek');

		expect(updated.name).toBe('Abhishek');
		expect(await nameEditedAt(user.id), 'the marker is what the guard reads').not.toBeNull();
	});

	it('does not invent an account when the id does not exist', async () => {
		expect(await runNameUpdate(999999, 'Nobody')).toBeUndefined();
	});
});

describe('disconnecting Google', () => {
	function detach(userId) {
		return db
			.query(DETACH_GOOGLE_IDENTITY_SQL, [userId])
			.then((result) => result.rows[0]);
	}

	it('clears the identity and keeps the account, its name and its id', async () => {
		const user = await insertUser({
			googleSub: 'google-9',
			email: 'ninth@example.com',
			name: 'Ninth Learner'
		});
		await db.query(`UPDATE app_user SET picture_url = $2, locale = $3 WHERE id = $1`, [
			user.id,
			'https://example.com/ninth.jpg',
			'hi'
		]);

		const detached = await detach(user.id);

		expect(detached.id, 'the same account').toBe(user.id);
		expect(detached.google_sub).toBeNull();
		expect(detached.email).toBeNull();
		expect(detached.picture_url).toBeNull();
		expect(detached.locale).toBeNull();

		const remaining = await db.query('SELECT id, name FROM app_user WHERE id = $1', [user.id]);
		expect(remaining.rows.length, 'the row is never deleted').toBe(1);
		expect(remaining.rows[0].name, 'the display name is kept').toBe('Ninth Learner');
	});

	it('leaves the released identity free, so a later Google sign-in is a new account', async () => {
		const user = await insertUser({
			googleSub: 'google-10',
			email: 'tenth@example.com',
			name: 'Tenth'
		});
		await detach(user.id);

		// No row matches any more: the sign-in path would INSERT rather than
		// silently re-attach to this account, which is what "disconnected" means.
		const reattached = await runGoogleUpdate({
			googleSub: 'google-10',
			email: 'tenth@example.com',
			name: 'Tenth Again',
			pictureUrl: null,
			locale: null
		});
		expect(reattached).toBeUndefined();

		const untouched = await db.query('SELECT google_sub, email FROM app_user WHERE id = $1', [
			user.id
		]);
		expect(untouched.rows[0].google_sub).toBeNull();
		expect(untouched.rows[0].email).toBeNull();
	});

	it('does nothing for an account that does not exist', async () => {
		expect(await detach(999999)).toBeUndefined();
	});
});
