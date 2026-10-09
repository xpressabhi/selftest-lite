import { expect, test } from '@playwright/test';
import { connectOrSkip, sqlClient } from './testDb.js';
import {
	TEST_USER_AGENT,
	addVirtualAuthenticator,
	dismissProfileWizard,
	openSignInSheet,
	passkeyCountFor,
	sessionUser,
	signOut,
	signUpWithPasskey,
} from './passkeySignIn.js';

// Passkey sign-up and sign-in, driven through the real UI with a Chrome virtual
// authenticator over CDP. Shared helpers live in ./passkeySignIn.js.
//
// The suite runs on http://localhost:5174, which is a secure context, so the
// resolved RP ID is `localhost` and the expected origin is the dev server's.

test.beforeEach(async ({ page, request }) => {
	await connectOrSkip(sqlClient(request));
	// The device label stored for each passkey is derived from the user agent,
	// so it is pinned here rather than left to the runner's Chrome build.
	await page.setExtraHTTPHeaders({ 'user-agent': TEST_USER_AGENT });
});

test('a visitor can create an account with a passkey, with no form fields', async ({
	page,
	request,
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
			emailNull: user.email === null,
		}),
		contentType: 'application/json',
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

test('the anonymous identity is attached to the new account', async ({
	page,
	request,
}, testInfo) => {
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
	expect(rows[0]?.total, 'the signup event should be attributed to the account').toBeGreaterThan(
		0
	);

	await testInfo.attach('evidence', {
		body: JSON.stringify({ userId: user.id, attributedEvents: rows[0]?.total ?? 0 }),
		contentType: 'application/json',
	});
});

test('the affordance is hidden where WebAuthn does not exist', async ({ page }) => {
	await page.addInitScript(() => {
		// Android WebView has no `PublicKeyCredential`; the affordance must
		// disappear there without any deployment flag.
		Object.defineProperty(window, 'PublicKeyCredential', {
			configurable: true,
			value: undefined,
		});
	});

	await openSignInSheet(page);

	await expect(page.locator('button.passkey-action')).toHaveCount(0);
	// The Google path stays available, so the sheet is still useful.
	await expect(page.locator('.google-sign-in-button, .auth-google-error')).toHaveCount(1);
});

