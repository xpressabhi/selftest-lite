import { expect, test } from '@playwright/test';
import { connectOrSkip, sqlClient } from './testDb.js';
import {
	TEST_USER_AGENT,
	addVirtualAuthenticator,
	openSignInMethods,
	passkeyCountFor,
	signUpWithPasskey,
	swapToSecondDevice
} from './passkeySignIn.js';

// Sign-in methods live on /settings, not in the profile, and the rule that
// protects the account is the same for both kinds: a method can only be removed
// while another way in remains. Nothing here ever deletes the user row.
//
// Google cannot be connected by a spec (it needs live credentials), so a linked
// identity is seeded through the dev-only test database bridge.

test.beforeEach(async ({ page, request }) => {
	await connectOrSkip(sqlClient(request));
	await page.setExtraHTTPHeaders({ 'user-agent': TEST_USER_AGENT });
});

async function seedGoogleLink(sql, userId, { sub = 'e2e-google-sub', email = 'e2e@example.com' } = {}) {
	await sql.query('UPDATE app_user SET google_sub = $1, email = $2 WHERE id = $3', [
		sub,
		email,
		userId
	]);
}

test('a second passkey can be added from another device, and revoking one archives it', async ({
	page,
	request
}, testInfo) => {
	const sql = sqlClient(request);
	const firstDevice = await addVirtualAuthenticator(page);

	const user = await signUpWithPasskey(page);
	expect(user).not.toBeNull();

	// A second passkey has to come from another device: the authenticator that
	// already holds this account's credential is refused by the browser.
	await swapToSecondDevice(page, firstDevice);

	await openSignInMethods(page);
	await page.getByRole('button', { name: /add a passkey/i }).click();

	await expect(page.locator('.passkey-row')).toHaveCount(2);
	expect(await passkeyCountFor(sql, user.id), 'two credentials should be stored').toBe(2);

	// Two-step confirmation, so the first tap only arms the removal.
	const firstRow = page.locator('.passkey-row').first();
	await firstRow.getByRole('button', { name: /^remove$/i }).click();
	await firstRow.getByRole('button', { name: /confirm remove/i }).click();

	await expect(page.locator('.alert-success')).toContainText(/passkey removed/i);
	expect(await passkeyCountFor(sql, user.id), 'one credential should remain').toBe(1);

	const archived = await sql.query(
		'SELECT COUNT(*)::int AS total FROM app_user_passkey_archive WHERE user_id = $1',
		[user.id]
	);
	expect(archived[0]?.total, 'the revoked credential is archived, never deleted').toBe(1);
	expect(
		(await sql.query('SELECT COUNT(*)::int AS total FROM app_user WHERE id = $1', [user.id]))[0]
			?.total,
		'the account itself is untouched'
	).toBe(1);

	await testInfo.attach('evidence', {
		body: JSON.stringify({
			userId: user.id,
			remaining: await passkeyCountFor(sql, user.id),
			archived: archived[0]?.total ?? 0
		}),
		contentType: 'application/json'
	});
});

test('the only way in cannot be removed, and says why', async ({ page, request }) => {
	const sql = sqlClient(request);
	await addVirtualAuthenticator(page);

	const user = await signUpWithPasskey(page);
	expect(user).not.toBeNull();

	await openSignInMethods(page);

	// One passkey, no Google: both controls are disabled and the reason is on
	// the page rather than discovered by trying.
	await expect(page.getByRole('button', { name: /^remove$/i })).toBeDisabled();
	await expect(page.getByRole('note')).toContainText(/another way in/i);

	// The API enforces it too, not just the disabled button.
	const rejected = await page.request.post('/api/auth/passkey/remove', {
		data: { id: 1 }
	});
	expect(rejected.status()).toBe(409);
	expect((await rejected.json())?.code).toBe('LAST_LOGIN_METHOD');
	expect(await passkeyCountFor(sql, user.id), 'nothing was removed').toBe(1);
});

test('Google can be disconnected once a passkey exists, and the account survives', async ({
	page,
	request
}, testInfo) => {
	const sql = sqlClient(request);
	await addVirtualAuthenticator(page);

	const user = await signUpWithPasskey(page);
	await seedGoogleLink(sql, user.id);

	await openSignInMethods(page);
	await expect(page.getByText(/connected as e2e@example\.com/i)).toBeVisible();

	await page.getByRole('button', { name: /^disconnect$/i }).click();
	// The warning about a later Google sign-in starts a new account is shown
	// before the second tap commits.
	await expect(page.getByRole('note')).toContainText(/would start a new account/i);
	await page.getByRole('button', { name: /confirm disconnect/i }).click();

	await expect(page.locator('.alert-success')).toContainText(/google disconnected/i);
	await expect(page.getByText(/not connected/i)).toBeVisible();

	const row = (
		await sql.query(
			'SELECT id, google_sub, email, picture_url, name FROM app_user WHERE id = $1',
			[user.id]
		)
	)[0];
	expect(row, 'the account row still exists').toBeTruthy();
	expect(row.id, 'and it is the same account').toBe(user.id);
	expect(row.google_sub, 'the identity is cleared').toBeNull();
	expect(row.email, 'so is the email').toBeNull();
	expect(row.name, 'the display name is kept').toBe(user.name);
	expect(await passkeyCountFor(sql, user.id), 'the passkey still works').toBe(1);

	// The session survives: disconnecting a method is not a sign-out.
	const session = await page.request.get('/api/auth/me');
	expect((await session.json())?.user?.id).toBe(user.id);
	expect((await session.json())?.user?.googleSub).toBeNull();

	await testInfo.attach('evidence', {
		body: JSON.stringify({
			userId: user.id,
			googleSubCleared: row.google_sub === null,
			emailCleared: row.email === null,
			passkeysRemaining: await passkeyCountFor(sql, user.id)
		}),
		contentType: 'application/json'
	});
});

test('Google cannot be disconnected while it is the only way in', async ({ page, request }) => {
	const sql = sqlClient(request);
	await addVirtualAuthenticator(page);

	const user = await signUpWithPasskey(page);
	// Move the account to "Google only" by archiving its credential the way a
	// user would: the row itself stays, which is the point of the guard.
	await sql.query(
		`WITH moved AS (
			DELETE FROM app_user_passkey WHERE user_id = $1 RETURNING *
		)
		INSERT INTO app_user_passkey_archive
			(id, user_id, credential_id, public_key, counter, transports, device_type,
			 backed_up, label, created_at, last_used_at, updated_at, archived_at)
		SELECT id, user_id, credential_id, public_key, counter, transports, device_type,
			 backed_up, label, created_at, last_used_at, updated_at, NOW()
		FROM moved`,
		[user.id]
	);
	await seedGoogleLink(sql, user.id);

	await openSignInMethods(page);
	await expect(page.getByRole('button', { name: /^disconnect$/i })).toBeDisabled();

	const rejected = await page.request.post('/api/auth/google/unlink');
	expect(rejected.status()).toBe(409);
	expect((await rejected.json())?.code).toBe('LAST_LOGIN_METHOD');

	const row = (
		await sql.query('SELECT google_sub, email FROM app_user WHERE id = $1', [user.id])
	)[0];
	expect(row.google_sub, 'the identity is still linked').toBe('e2e-google-sub');
	expect(row.email).toBe('e2e@example.com');
});

test('the settings page is reachable from the desktop menu and names what exists', async ({
	page
}) => {
	await addVirtualAuthenticator(page);
	const user = await signUpWithPasskey(page);
	expect(user).not.toBeNull();

	// Regression the profile page taught us: a signed-in desktop user must be
	// able to reach the page that manages sign-in from the header itself.
	await page.getByRole('button', { name: 'Signed in as' }).click();
	const settingsLink = page.locator('#user-menu a[href="/settings"]');
	await expect(settingsLink).toBeVisible();
	await settingsLink.click();

	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.getByRole('heading', { name: 'Sign-in & security' })).toBeVisible();
	await expect(page.locator('.passkey-row')).toHaveCount(1);
	await expect(page.getByRole('button', { name: /add a passkey on another device/i })).toBeVisible();
	await expect(page.getByText(/stay exactly as they are/i)).toBeVisible();
});

test('the device that already holds a passkey is told so, not failed silently', async ({ page }) => {
	await addVirtualAuthenticator(page);
	const user = await signUpWithPasskey(page);
	expect(user).not.toBeNull();

	await openSignInMethods(page);
	await page.getByRole('button', { name: /add a passkey on another device/i }).click();

	// Chrome raises InvalidStateError because the account's credential is in
	// `excludeCredentials` on this authenticator; the user gets the "already
	// registered" wording instead of a generic failure.
	await expect(page.getByRole('alert')).toContainText(/already registered/i);
	await expect(page.locator('.passkey-row')).toHaveCount(1);
});
