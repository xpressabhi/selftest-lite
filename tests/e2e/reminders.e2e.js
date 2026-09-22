import { chromium, expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { neon } from '@neondatabase/serverless';
import webpush from 'web-push';
import { REMINDER_HOURS } from '../../src/lib/shared/reminders.js';
import { PUSH_TEST_KEYS } from './pushTestKeys.js';

// Web push end-to-end suite. Run it with `npm run test:e2e:push` (see
// docs/reminders.md): it drives the real opt-in UI in headed Chrome, delivers
// real pushes through FCM and runs the hourly sender. It needs Chrome, network
// access and DATABASE_URL (env or .env.local).
//
// The default `npm run test:e2e` config excludes this file because the suite
// cannot run headless and talks to external services.

const runCommand = promisify(execFile);

if (!process.env.DATABASE_URL) {
	try {
		process.loadEnvFile('.env.local');
	} catch {
		// Left missing on purpose; beforeAll reports it with a clear message.
	}
}

// The reminder row renders after the first completed test.
const seedHistory = [
	{
		id: 'e2e-1',
		topic: 'E2E seed one',
		timestamp: Date.now() - 60_000,
		score: 1,
		totalQuestions: 1,
		timeTaken: 5,
		questions: [{ question: 'Seed Q?', options: ['a', 'b'], answer: 'a', explanation: 'seed' }],
		userAnswers: { 0: 'a' },
	},
];

const REMINDER_API = '/api/reminders/subscribe';

function reminderToggle(page) {
	return page
		.locator('label', { hasText: 'Daily practice reminder' })
		.locator('input[type="checkbox"]');
}

async function readSubscription(page) {
	return page.evaluate(async () => {
		const registration = await navigator.serviceWorker.ready;
		const subscription = await registration.pushManager.getSubscription();
		return subscription ? subscription.toJSON() : null;
	});
}

async function readNotifications(page) {
	return page.evaluate(async () => {
		const registration = await navigator.serviceWorker.ready;
		const notifications = await registration.getNotifications();
		return notifications.map((note) => ({ title: note.title, body: note.body, data: note.data }));
	});
}

function readStoredHour(page) {
	return page.evaluate(() => {
		const raw = window.localStorage.getItem('selftest_reminder_hour');
		return raw === null ? null : JSON.parse(raw);
	});
}

// A fixed-offset timezone whose local hour is a reminder hour right now, so the
// sender script treats smart-default rows as due no matter when the suite runs.
function dueTimezone(now = new Date()) {
	const utcHour = now.getUTCHours();
	let offset = (7 - utcHour + 24) % 24;
	if (offset > 14) {
		offset -= 24;
	}
	if (offset === 0) {
		return 'Etc/GMT0';
	}
	return `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
}

test.describe.configure({ mode: 'serial' });

test.describe('daily reminder web push', () => {
	test.skip(!process.env.E2E_PUSH, 'run via npm run test:e2e:push');

	let context;
	let page;
	let sql;
	let profileDir;
	const createdEndpoints = [];
	const reminderRequests = [];

	test.beforeAll(async () => {
		expect(process.env.DATABASE_URL, 'DATABASE_URL via env or .env.local').toBeTruthy();
		sql = neon(process.env.DATABASE_URL);

		// The Push API is disabled in incognito, so this suite needs a
		// persistent profile rather than Playwright's default context.
		profileDir = mkdtempSync(path.join(tmpdir(), 'selftest-push-'));
		context = await chromium.launchPersistentContext(profileDir, {
			channel: 'chrome',
			headless: false,
		});
		await context.grantPermissions(['notifications'], 'http://localhost:4173');
		page = context.pages()[0] || (await context.newPage());
		page.on('request', (request) => {
			if (!request.url().includes(REMINDER_API)) {
				return;
			}
			let body = null;
			try {
				body = JSON.parse(request.postData() || 'null');
			} catch {
				// Malformed bodies are covered by the assertions below.
			}
			reminderRequests.push({ method: request.method(), body });
			const endpoint = body?.subscription?.endpoint;
			if (endpoint && !createdEndpoints.includes(endpoint)) {
				createdEndpoints.push(endpoint);
			}
		});

		const servedEnv = await (await page.request.get('/_app/env.js')).text();
		expect(
			servedEnv,
			'the preview server must serve the VAPID key the suite signs with'
		).toContain(PUSH_TEST_KEYS.publicKey);
	});

	test.afterAll(async () => {
		// Best effort: a failed run must never leave an active test row behind.
		for (const endpoint of createdEndpoints) {
			await sql
				?.query(
					`WITH moved AS (
						DELETE FROM push_subscription WHERE endpoint = $1 RETURNING *
					)
					INSERT INTO push_subscription_archive
						(id, client_id, user_id, endpoint, p256dh, auth, timezone, enabled,
						 created_at, updated_at, last_sent_at, last_error, reminder_hour, archived_at)
					SELECT id, client_id, user_id, endpoint, p256dh, auth, timezone, enabled,
						created_at, updated_at, last_sent_at, last_error, reminder_hour, NOW()
					FROM moved`,
					[endpoint]
				)
				.catch(() => {});
		}
		await context?.close().catch(() => {});
		if (profileDir) {
			rmSync(profileDir, { recursive: true, force: true });
		}
	});

	async function runSender() {
		const { stdout } = await runCommand('npm', ['run', 'reminders:send'], {
			env: {
				...process.env,
				DATABASE_URL: process.env.DATABASE_URL,
				VAPID_PUBLIC_KEY: PUSH_TEST_KEYS.publicKey,
				VAPID_PRIVATE_KEY: PUSH_TEST_KEYS.privateKey,
				VAPID_SUBJECT: 'mailto:hello@selftest.in',
			},
			timeout: 60_000,
		});
		return stdout.trim().split('\n').at(-1);
	}

	test('one test is enough for the reminder row, and a failed save rolls back', async () => {
		const testInfo = test.info();
		await page.goto('/');
		await page.evaluate((history) => {
			localStorage.setItem('selftest_history', JSON.stringify(history));
		}, seedHistory);
		await page.goto('/results?id=e2e-1');
		const toggle = reminderToggle(page);
		await expect(toggle).toBeVisible();
		await expect(page.getByLabel('Reminder time')).toBeVisible();

		await page.route(`**${REMINDER_API}`, async (route) => {
			if (route.request().method() === 'POST') {
				await route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({ error: 'injected failure', code: 'TEST_FAILURE' }),
				});
				return;
			}
			await route.continue();
		});
		await toggle.click();

		await expect(page.getByText(/couldn't update reminders/i)).toBeVisible();
		await expect(toggle).not.toBeChecked();
		expect(await readSubscription(page)).toBeNull();
		expect(await page.evaluate(() => Notification.permission)).toBe('granted');
		await page.unroute(`**${REMINDER_API}`);

		await testInfo.attach('evidence', {
			body: JSON.stringify({
				visibleAfterFirstTest: true,
				toggleStayedOff: true,
				subscriptionRolledBack: true,
			}),
			contentType: 'application/json',
		});
	});

	test('selecting a time while off is local, and enabling saves it', async () => {
		const testInfo = test.info();
		await page.goto('/results?id=e2e-1');
		const toggle = reminderToggle(page);
		const select = page.getByLabel('Reminder time');
		await expect(select).toBeVisible();
		expect(await select.inputValue()).toBe('');

		// Off: the selection is a local mirror, no server call yet.
		await select.selectOption('10');
		await expect(page.getByText(/reminder set for 10 am/i)).toBeVisible();
		expect(reminderRequests.filter((request) => request.method === 'PATCH')).toHaveLength(0);
		expect(await readStoredHour(page)).toBe(10);

		// Enabling applies the selection to the new subscription.
		const responsePromise = page.waitForResponse(
			(response) =>
				response.url().includes(REMINDER_API) && response.request().method() === 'POST',
			{ timeout: 90_000 }
		);
		await toggle.click();
		const response = await responsePromise;
		expect(response.status()).toBe(200);
		await expect(toggle).toBeChecked();

		const post = reminderRequests.filter((request) => request.method === 'POST').at(-1);
		expect(post?.body?.hour).toBe(10);
		const subscription = await readSubscription(page);
		expect(new URL(subscription.endpoint).host).toBe('fcm.googleapis.com');
		const rows = await sql.query(
			'SELECT enabled, timezone, last_error, reminder_hour FROM push_subscription WHERE endpoint = $1',
			[subscription.endpoint]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].enabled).toBe(true);
		expect(rows[0].last_error).toBeNull();
		expect(rows[0].reminder_hour).toBe(10);

		await testInfo.attach('evidence', {
			body: JSON.stringify({
				postHour: post?.body?.hour,
				savedRow: rows[0],
				localMirror: await readStoredHour(page),
			}),
			contentType: 'application/json',
		});
	});

	test('the service worker shows a real push delivered through FCM', async () => {
		const testInfo = test.info();
		const subscription = await readSubscription(page);
		expect(subscription).toBeTruthy();
		webpush.setVapidDetails(
			'mailto:hello@selftest.in',
			PUSH_TEST_KEYS.publicKey,
			PUSH_TEST_KEYS.privateKey
		);
		const payload = {
			title: 'E2E push proof',
			body: `Delivered at ${new Date().toISOString()}`,
			url: '/?daily=1',
		};
		const result = await webpush.sendNotification(
			{
				endpoint: subscription.endpoint,
				keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
			},
			JSON.stringify(payload),
			{ TTL: 60 }
		);
		expect(result.statusCode).toBe(201);

		await expect
			.poll(async () => (await readNotifications(page)).map((note) => note.title), {
				timeout: 25_000,
				message: 'push notification should appear',
			})
			.toContain(payload.title);
		const notification = (await readNotifications(page)).find(
			(note) => note.title === payload.title
		);
		expect(notification.body).toBe(payload.body);
		expect(notification.data?.url).toBe(payload.url);

		await testInfo.attach('evidence', {
			body: JSON.stringify({ statusCode: result.statusCode, notification }),
			contentType: 'application/json',
		});
	});

	test('the hourly sender honors the chosen hour', async () => {
		const testInfo = test.info();
		const subscription = await readSubscription(page);
		expect(subscription).toBeTruthy();
		const [utc] = await sql.query(
			"SELECT EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Etc/GMT0')::int AS hour"
		);

		// Matching hour: the reminder is delivered even though the smart
		// windows would not match.
		await sql.query(
			`UPDATE push_subscription
			 SET timezone = 'Etc/GMT0', reminder_hour = $2, last_sent_at = NULL
			 WHERE endpoint = $1`,
			[subscription.endpoint, utc.hour]
		);
		const matchingOutput = await runSender();
		expect(matchingOutput).toMatch(/1 due, 1 sent, 0 failed, 0 disabled/);
		await expect
			.poll(async () => (await readNotifications(page)).map((note) => note.title), {
				timeout: 25_000,
				message: 'chosen-hour notification should appear',
			})
			.toContain('Daily 5 is ready');

		// Adjacent hour: nothing is due, proving the default windows no longer
		// apply once a time is chosen. (Runs within the same hour window; a
		// tick exactly between the two runs is the only flake source.)
		await sql.query(
			`UPDATE push_subscription
			 SET reminder_hour = $2, last_sent_at = NULL
			 WHERE endpoint = $1`,
			[subscription.endpoint, (utc.hour + 1) % 24]
		);
		const adjacentOutput = await runSender();
		expect(adjacentOutput).toMatch(/0 due, 0 sent, 0 failed, 0 disabled/);

		await testInfo.attach('evidence', {
			body: JSON.stringify({
				timezone: 'Etc/GMT0',
				utcHour: utc.hour,
				matchingOutput,
				adjacentOutput,
			}),
			contentType: 'application/json',
		});
	});

	test('the smart default windows still send', async () => {
		const testInfo = test.info();
		const subscription = await readSubscription(page);
		expect(subscription).toBeTruthy();
		const timezone = dueTimezone();
		const [{ hour }] = await sql.query(
			'SELECT EXTRACT(HOUR FROM NOW() AT TIME ZONE $1)::int AS hour',
			[timezone]
		);
		expect(REMINDER_HOURS, `timezone ${timezone} must land in a reminder hour`).toContain(hour);
		await sql.query(
			`UPDATE push_subscription
			 SET timezone = $2, reminder_hour = NULL, last_sent_at = NULL
			 WHERE endpoint = $1`,
			[subscription.endpoint, timezone]
		);

		const senderOutput = await runSender();
		expect(senderOutput).toMatch(/1 due, 1 sent, 0 failed, 0 disabled/);
		const rows = await sql.query(
			'SELECT enabled, last_sent_at, last_error, reminder_hour FROM push_subscription WHERE endpoint = $1',
			[subscription.endpoint]
		);
		expect(rows[0].last_sent_at).not.toBeNull();
		expect(rows[0].last_error).toBeNull();
		expect(rows[0].reminder_hour).toBeNull();

		await testInfo.attach('evidence', {
			body: JSON.stringify({ timezone, senderOutput, rowAfterSend: rows[0] }),
			contentType: 'application/json',
		});
	});

	test('a failed time change snaps the select back', async () => {
		const testInfo = test.info();
		const subscription = await readSubscription(page);
		expect(subscription).toBeTruthy();
		const [before] = await sql.query(
			'SELECT reminder_hour FROM push_subscription WHERE endpoint = $1',
			[subscription.endpoint]
		);
		await page.route(`**${REMINDER_API}`, async (route) => {
			if (route.request().method() === 'PATCH') {
				await route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({ error: 'injected failure', code: 'TEST_FAILURE' }),
				});
				return;
			}
			await route.continue();
		});
		const select = page.getByLabel('Reminder time');
		await select.selectOption('18');

		await expect(page.getByText(/couldn't update reminders/i)).toBeVisible();
		expect(await select.inputValue()).toBe('10');
		expect(await readStoredHour(page)).toBe(10);
		await page.unroute(`**${REMINDER_API}`);
		const [after] = await sql.query(
			'SELECT reminder_hour FROM push_subscription WHERE endpoint = $1',
			[subscription.endpoint]
		);
		expect(after.reminder_hour).toEqual(before.reminder_hour);

		await testInfo.attach('evidence', {
			body: JSON.stringify({ selectAfterFailure: '10', localMirror: 10, rowUnchanged: true }),
			contentType: 'application/json',
		});
	});

	test('an invalid hour is rejected', async () => {
		const testInfo = test.info();
		const subscription = await readSubscription(page);
		expect(subscription).toBeTruthy();
		const result = await page.evaluate(
			async ({ endpoint }) => {
				const response = await fetch('/api/reminders/subscribe', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ endpoint, hour: 25 }),
				});
				return { status: response.status, body: await response.json() };
			},
			{ endpoint: subscription.endpoint }
		);
		expect(result.status).toBe(400);
		expect(result.body.code).toBe('INVALID_HOUR');

		await testInfo.attach('evidence', {
			body: JSON.stringify(result),
			contentType: 'application/json',
		});
	});

	test('toggling off archives the subscription', async () => {
		const testInfo = test.info();
		const endpoint = createdEndpoints.at(-1);
		expect(endpoint, 'captured subscription endpoint').toBeTruthy();
		// A memorable value proves the archive insert maps reminder_hour.
		await sql.query(
			'UPDATE push_subscription SET reminder_hour = 21 WHERE endpoint = $1',
			[endpoint]
		);

		const toggle = reminderToggle(page);
		await expect(toggle).toBeChecked();
		const responsePromise = page.waitForResponse(
			(response) =>
				response.url().includes(REMINDER_API) && response.request().method() === 'DELETE',
			{ timeout: 60_000 }
		);
		await toggle.click();
		const response = await responsePromise;
		expect(response.status()).toBe(200);
		await expect(toggle).not.toBeChecked();

		const active = await sql.query('SELECT 1 FROM push_subscription WHERE endpoint = $1', [endpoint]);
		const archived = await sql.query(
			'SELECT reminder_hour FROM push_subscription_archive WHERE endpoint = $1',
			[endpoint]
		);
		expect(active).toHaveLength(0);
		expect(archived).toHaveLength(1);
		expect(archived[0].reminder_hour).toBe(21);
		expect(await readSubscription(page)).toBeNull();

		await testInfo.attach('evidence', {
			body: JSON.stringify({
				activeRows: active.length,
				archivedRows: archived.length,
				archivedHour: archived[0].reminder_hour,
			}),
			contentType: 'application/json',
		});
	});
});
