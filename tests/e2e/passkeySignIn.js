// Shared e2e helpers for signing in without Google.
//
// Passkey signup is the only sign-in path a spec can drive end to end (Google
// needs live credentials), so specs that need a real account use these. The
// authenticator is a genuine CTAP2 authenticator as far as the page and the
// server are concerned: attestation, assertions, resident credentials and user
// verification all go through the same code a platform passkey would.

import { expect } from '@playwright/test';

export const TEST_USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export async function addVirtualAuthenticator(page) {
	const client = await page.context().newCDPSession(page);
	await client.send('WebAuthn.enable');
	const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true,
		},
	});
	return { client, authenticatorId };
}

/**
 * Swaps in a fresh authenticator with an empty credential store, which is what
 * a second device looks like to the RP: the browser refuses to create another
 * credential on the authenticator that already holds this account's one.
 */
export async function swapToSecondDevice(page, authenticator) {
	await authenticator.client.send('WebAuthn.removeVirtualAuthenticator', {
		authenticatorId: authenticator.authenticatorId,
	});
	return addVirtualAuthenticator(page);
}

export async function openSignInSheet(page) {
	await page.goto('/');
	const trigger = page.locator('button.sign-in-control').first();
	await trigger.waitFor({ state: 'visible' });
	await trigger.click();
	await expect(page.locator('.sign-in-modal')).toBeVisible();
}

/**
 * A brand-new account is offered the profile wizard, which is a modal over the
 * page. Close it so a spec can reach the surfaces it came to test.
 */
export async function dismissProfileWizard(page) {
	const close = page.locator('.wizard-close');
	try {
		await close.first().click({ timeout: 2000 });
		await expect(close).toHaveCount(0);
	} catch {
		// Not shown for this account; nothing to dismiss.
	}
}

export async function sessionUser(page) {
	const response = await page.request.get('/api/auth/me');
	const body = await response.json().catch(() => ({}));
	return body?.user || null;
}

export async function signUpWithPasskey(page) {
	await openSignInSheet(page);
	await page.getByRole('button', { name: /create account with a passkey/i }).click();
	await expect(page.locator('.sign-in-modal')).toHaveCount(0);
	await dismissProfileWizard(page);
	return sessionUser(page);
}

export async function signOut(page) {
	await page.request.post('/api/auth/logout');
	// Reload so the layout re-resolves the session and shows the sign-in
	// control again; the passkey flow is then driven entirely through the UI.
	await page.goto('/');
	await page.locator('button.sign-in-control').first().waitFor({ state: 'visible' });
}

export async function passkeyCountFor(sql, userId) {
	const rows = await sql.query(
		'SELECT COUNT(*)::int AS total FROM app_user_passkey WHERE user_id = $1',
		[userId]
	);
	return rows[0]?.total ?? 0;
}

/** Opens /profile with the profile wizard dismissed. */
export async function openProfile(page) {
	await page.goto('/profile');
	await dismissProfileWizard(page);
	await expect(page.getByRole('heading', { name: 'Passkeys' })).toBeVisible();
}
