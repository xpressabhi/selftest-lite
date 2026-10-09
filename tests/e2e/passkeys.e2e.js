import { expect, test } from '@playwright/test';
import { connectOrSkip, sqlClient } from './testDb.js';

// Passkey sign-up and sign-in, driven through the real UI with a Chrome
// virtual authenticator over CDP. The authenticator is a genuine CTAP2
// authenticator as far as the page and the server are concerned: attestation,
// assertion, resident credentials and user verification all go through the
// same code path a platform passkey would. No Touch ID required.
//
// The suite runs on http://localhost:5174, which is a secure context, so the
// resolved RP ID is `localhost` and the expected origin is the dev server's.

const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function addVirtualAuthenticator(page) {
	const client = await page.context().newCDPSession(page);
	await client.send('WebAuthn.enable');
	const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true
		}
	});
	return { client, authenticatorId };
}

/**
 * Swaps in a fresh authenticator with an empty credential store, which is what
 * a second device looks like to the RP. Without this the browser refuses to
 * create another credential (the account's existing credential is in
 * `excludeCredentials`), which is also asserted below.
 */
async function swapToSecondDevice(page, authenticator) {
	await authenticator.client.send('WebAuthn.removeVirtualAuthenticator', {
		authenticatorId: authenticator.authenticatorId
	});
	return addVirtualAuthenticator(page);
}

async function openSignInSheet(page) {
	await page.goto('/');
	const trigger = page.locator('button.sign-in-control').first();
	await trigger.waitFor({ state: 'visible' });
	await trigger.click();
	await expect(page.locator('.sign-in-modal')).toBeVisible();
}

/**
 * A brand-new account is offered the profile wizard, which is a modal over the
 * page. Close it so the spec can reach the surfaces it came to test.
 */
async function dismissProfileWizard(page) {
	const close = page.locator('.wizard-close');
	try {
		await close.first().click({ timeout: 2000 });
		await expect(close).toHaveCount(0);
	} catch {
		// Not shown for this account; nothing to dismiss.
	}
}

async function sessionUser(page) {
	const response = await page.request.get('/api/auth/me');
	const body = await response.json().catch(() => ({}));
	return body?.user || null;
}

async function signUpWithPasskey(page) {
	await openSignInSheet(page);
	await page.getByRole('button', { name: /create account with a passkey/i }).click();
	await expect(page.locator('.sign-in-modal')).toHaveCount(0);
	await dismissProfileWizard(page);
	return sessionUser(page);
}

async function signOut(page) {
	await page.request.post('/api/auth/logout');
	// Reload so the layout re-resolves the session and shows the sign-in
	// control again; the passkey flow is then driven entirely through the UI.
	await page.goto('/');
	await page.locator('button.sign-in-control').first().waitFor({ state: 'visible' });
}

async function passkeyCountFor(sql, userId) {
	const rows = await sql.query(
		'SELECT COUNT(*)::int AS total FROM app_user_passkey WHERE user_id = $1',
		[userId]
	);
	return rows[0]?.total ?? 0;
}

test.beforeEach(async ({ page, request }) => {
	await connectOrSkip(sqlClient(request));
	// The device label stored for each passkey is derived from the user agent,
	// so it is pinned here rather than left to the runner's Chrome build.
	await page.setExtraHTTPHeaders({ 'user-agent': USER_AGENT });
});

test('a visitor can create an account with a passkey, with no form fields', async ({
	page,
	request
}, testInfo) => {
	const sql = sqlClient(request);
	await addVirtualAuthenticator(page);

	const user = await signUpWithPasskey(page);

	expect(user, 'the ceremony should have signed the visitor in').not.toBeNull();
	expect(user.name, 'a signup that collects nothing gets a generated name').toMatch(
		/^(Learner|शिक्षार्थी) \d{4}$/
	);
	expect(user.email, 'a passkey-first account has no email').toBeNull();
	expect(user.googleSub, 'a passkey-first account has no Google identity').toBeNull();

	const credentialCount = await passkeyCountFor(sql, user.id);
	expect(credentialCount, 'exactly one credential should be stored').toBe(1);

	const stored = await sql.query(
		'SELECT COUNT(*)::int AS total FROM app_user WHERE id = $1 AND google_sub IS NULL AND email IS NULL',
		[user.id]
	);
	expect(stored[0]?.total, 'the account row should carry NULL Google columns').toBe(1);

	await testInfo.attach('evidence', {
		body: JSON.stringify({
			userId: user.id,
			generatedName: user.name,
			credentialCount,
			googleSubNull: user.googleSub === null,
			emailNull: user.email === null
		}),
		contentType: 'application/json'
	});
});

test('a second visit signs back into the same account with one tap', async ({ page }) => {
	await addVirtualAuthenticator(page);

	const created = await signUpWithPasskey(page);
	expect(created).not.toBeNull();

	await signOut(page);
	expect(await sessionUser(page), 'sign-out should clear the session').toBeNull();

	await openSignInSheet(page);
	await page.getByRole('button', { name: /sign in with a passkey/i }).click();
	await expect(page.locator('.sign-in-modal')).toHaveCount(0);
	await dismissProfileWizard(page);

	const signedIn = await sessionUser(page);
	expect(signedIn?.id, 'the same passkey must resolve to the same account').toBe(created.id);
});

test('the anonymous identity is attached to the new account', async ({ page, request }, testInfo) => {
	const sql = sqlClient(request);
	await addVirtualAuthenticator(page);

	const user = await signUpWithPasskey(page);
	expect(user).not.toBeNull();

	// backfillUserIdentity() runs inside the signup request, so the event rows
	// that carried this browser's anonymous client id now carry the account.
	const rows = await sql.query(
		`SELECT COUNT(*)::int AS total
		 FROM api_request_events
		 WHERE route = '/api/auth/passkey/register/verify' AND user_id = $1`,
		[user.id]
	);
	expect(rows[0]?.total, 'the signup event should be attributed to the account').toBeGreaterThan(0);

	await testInfo.attach('evidence', {
		body: JSON.stringify({ userId: user.id, attributedEvents: rows[0]?.total ?? 0 }),
		contentType: 'application/json'
	});
});

test('a second passkey can be added, and revoking the first archives it', async ({
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

	await page.goto('/profile');
	const addButton = page.getByRole('button', { name: /add a passkey/i });
	await addButton.waitFor({ state: 'visible' });
	await addButton.click();

	await expect(page.locator('.passkey-row')).toHaveCount(2);
	expect(await passkeyCountFor(sql, user.id), 'two credentials should be stored').toBe(2);

	// Two-step confirmation, so the first tap only arms the removal.
	const firstRow = page.locator('.passkey-row').first();
	await firstRow.getByRole('button', { name: /^remove$/i }).click();
	await firstRow.getByRole('button', { name: /confirm remove/i }).click();

	await expect(page.locator('.passkey-row')).toHaveCount(1);
	expect(await passkeyCountFor(sql, user.id), 'one credential should remain').toBe(1);

	const archived = await sql.query(
		'SELECT COUNT(*)::int AS total FROM app_user_passkey_archive WHERE user_id = $1',
		[user.id]
	);
	expect(archived[0]?.total, 'the revoked credential is archived, never deleted').toBe(1);

	await testInfo.attach('evidence', {
		body: JSON.stringify({
			userId: user.id,
			remaining: await passkeyCountFor(sql, user.id),
			archived: archived[0]?.total ?? 0
		}),
		contentType: 'application/json'
	});
});

test('the only passkey of an account with no Google link cannot be revoked', async ({
	page,
	request
}) => {
	const sql = sqlClient(request);
	await addVirtualAuthenticator(page);

	const user = await signUpWithPasskey(page);
	expect(user).not.toBeNull();

	await page.goto('/profile');
	const row = page.locator('.passkey-row').first();
	await row.waitFor({ state: 'visible' });
	await row.getByRole('button', { name: /^remove$/i }).click();
	await row.getByRole('button', { name: /confirm remove/i }).click();

	await expect(page.getByRole('alert')).toContainText(/only way in/i);
	expect(
		await passkeyCountFor(sql, user.id),
		'the last credential must survive the attempt'
	).toBe(1);
	expect(
		await sessionUser(page),
		'the user is still signed in, not stranded'
	).not.toBeNull();
});

test('the affordance is hidden where WebAuthn does not exist', async ({ page }) => {
	await page.addInitScript(() => {
		// Android WebView has no `PublicKeyCredential`; the affordance must
		// disappear there without any deployment flag.
		Object.defineProperty(window, 'PublicKeyCredential', {
			configurable: true,
			value: undefined
		});
	});

	await openSignInSheet(page);

	await expect(page.locator('button.passkey-action')).toHaveCount(0);
	// The Google path stays available, so the sheet is still useful.
	await expect(page.locator('.google-sign-in-button, .auth-google-error')).toHaveCount(1);
});

test('the device that already holds a passkey is told so, not failed silently', async ({
	page
}) => {
	await addVirtualAuthenticator(page);
	const user = await signUpWithPasskey(page);
	expect(user).not.toBeNull();

	await page.goto('/profile');
	const addButton = page.getByRole('button', { name: /add a passkey/i });
	await addButton.waitFor({ state: 'visible' });
	await addButton.click();

	// Chrome raises InvalidStateError because the account's credential is in
	// `excludeCredentials` on this authenticator; the user gets the "already
	// registered" wording instead of a generic failure.
	await expect(
		page.locator('section[aria-labelledby="passkeys-heading"] [role="alert"]')
	).toContainText(/already registered/i);
	await expect(page.locator('.passkey-row')).toHaveCount(1);
});
