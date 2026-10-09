import { expect, test } from '@playwright/test';
import { connectOrSkip, sqlClient } from './testDb.js';
import {
	TEST_USER_AGENT,
	addVirtualAuthenticator,
	openProfile,
	signUpWithPasskey,
} from './passkeySignIn.js';

// The name a user is shown by is account data (`app_user.name`), so changing it
// has to reach the header, `/api/auth/me` and the database — and a name the
// server refuses must not be written at all. A passkey-first account is the
// only account a spec can create, and it starts with a generated name, which is
// exactly the case the field exists for.

test.beforeEach(async ({ page, request }) => {
	await connectOrSkip(sqlClient(request));
	await page.setExtraHTTPHeaders({ 'user-agent': TEST_USER_AGENT });
});

async function storedName(sql, userId) {
	const rows = await sql.query('SELECT name, name_edited_at FROM app_user WHERE id = $1', [
		userId,
	]);
	return rows[0] || null;
}

test('a generated name can be replaced, and the header follows immediately', async ({
	page,
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await addVirtualAuthenticator(page);

	const user = await signUpWithPasskey(page);
	expect(user.name, 'the account starts with a generated name').toMatch(
		/^(Learner|शिक्षार्थी) \d{4}$/
	);

	await openProfile(page);
	const nameField = page.getByLabel('Your name');
	await expect(nameField, 'the field starts from the account name').toHaveValue(user.name);

	await nameField.fill('Abhishek Amaurya');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText('Profile saved.')).toBeVisible();

	// The header reads from the account, so it updates without a reload.
	await page.getByRole('button', { name: 'Signed in as' }).click();
	await expect(page.locator('#user-menu')).toContainText('Abhishek Amaurya');

	const stored = await storedName(sql, user.id);
	expect(stored.name, 'the account holds the chosen name').toBe('Abhishek Amaurya');
	expect(stored.name_edited_at, 'the edited marker protects it from Google').not.toBeNull();

	const session = await page.request.get('/api/auth/me');
	expect((await session.json())?.user?.name).toBe('Abhishek Amaurya');

	// It survives a reload, which is what the user will check.
	await page.reload();
	await expect(page.getByLabel('Your name')).toHaveValue('Abhishek Amaurya');

	await testInfo.attach('evidence', {
		body: JSON.stringify({
			userId: user.id,
			generatedName: user.name,
			savedName: stored.name,
			nameEditedAt: Boolean(stored.name_edited_at),
		}),
		contentType: 'application/json',
	});
});

test('a name the server refuses is reported, not silently kept', async ({
	page,
	request,
}, testInfo) => {
	const sql = sqlClient(request);
	await addVirtualAuthenticator(page);

	const user = await signUpWithPasskey(page);
	expect(user).not.toBeNull();

	await openProfile(page);
	const nameField = page.getByLabel('Your name');
	await nameField.fill('A');
	await expect(
		page.getByText(/between 2 and 40/i),
		'the field warns before saving'
	).toBeVisible();

	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText(/between 2 and 40/i);

	const stored = await storedName(sql, user.id);
	expect(stored.name, 'the generated name is untouched').toBe(user.name);
	expect(stored.name_edited_at, 'and nothing marked it as edited').toBeNull();

	// The API refuses it too, so the rule does not live only in the form.
	const rejected = await page.request.post('/api/user/profile', {
		data: {
			profile: {
				setupComplete: true,
				preferences: { personalized: true, language: null, difficultyComfort: null },
			},
			displayName: 'A',
		},
	});
	expect(rejected.status(), 'the server rejects a one-character name').toBe(400);
	expect((await rejected.json())?.code).toBe('INVALID_DISPLAY_NAME');
	expect((await storedName(sql, user.id)).name).toBe(user.name);

	await testInfo.attach('evidence', {
		body: JSON.stringify({ userId: user.id, keptName: stored.name, nameEditedAt: false }),
		contentType: 'application/json',
	});
});
