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

// The reminder toggle only renders after at least two completed tests.
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
	{
		id: 'e2e-2',
		topic: 'E2E seed two',
		timestamp: Date.now() - 120_000,
		score: 1,
		totalQuestions: 1,
		timeTaken: 5,
		questions: [{ question: 'Seed Q?', options: ['a', 'b'], answer: 'a', explanation: 'seed' }],
		userAnswers: { 0: 'a' },
	},
];

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

// A fixed-offset timezone whose local hour is a reminder hour right now, so the
// sender script treats the row as due no matter when the suite runs.
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
			if (
				!request.url().includes('/api/reminders/subscribe') ||
				request.method() !== 'POST'
			) {
				return;
			}
			try {
				const endpoint = JSON.parse(request.postData() || '{}')?.subscription?.endpoint;
				if (endpoint && !createdEndpoints.includes(endpoint)) {
					createdEndpoints.push(endpoint);
				}
			} catch {
				// Malformed bodies are covered by the assertions below.
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
					INSERT INTO push_subscription_archive SELECT *, NOW() FROM moved`,
					[endpoint]
				)
				.catch(() => {});
		}
		await context?.close().catch(() => {});
		if (profileDir) {
			rmSync(profileDir, { recursive: true, force: true });
		}
	});

	test('a failed save never leaves the toggle stuck on', async () => {
		const testInfo = test.info();
		await page.goto('/');
		await page.evaluate((history) => {
			localStorage.setItem('selftest_history', JSON.stringify(history));
		}, seedHistory);
		await page.goto('/results?id=e2e-1');
		const toggle = reminderToggle(page);
		await expect(toggle).toBeVisible();

		await page.route('**/api/reminders/subscribe', async (route) => {
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
		await page.unroute('**/api/reminders/subscribe');

		await testInfo.attach('evidence', {
			body: JSON.stringify({ toggleStayedOff: true, subscriptionRolledBack: true, permission: 'granted' }),
			contentType: 'application/json',
		});
	});

	test('the results toggle subscribes and saves the subscription', async () => {
		const testInfo = test.info();
		await page.goto('/results?id=e2e-1');
		const toggle = reminderToggle(page);
		await expect(toggle).toBeVisible();
		const responsePromise = page.waitForResponse(
			(response) =>
				response.url().includes('/api/reminders/subscribe') &&
				response.request().method() === 'POST',
			{ timeout: 90_000 }
		);
		await toggle.click();
		const response = await responsePromise;
		expect(response.status()).toBe(200);
		await expect(toggle).toBeChecked();

		const subscription = await readSubscription(page);
		expect(subscription?.endpoint, 'browser push subscription').toBeTruthy();
		expect(new URL(subscription.endpoint).host).toBe('fcm.googleapis.com');
		const rows = await sql.query(
			'SELECT enabled, timezone, last_error FROM push_subscription WHERE endpoint = $1',
			[subscription.endpoint]
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].enabled).toBe(true);
		expect(rows[0].last_error).toBeNull();

		await testInfo.attach('evidence', {
			body: JSON.stringify({
				endpointHost: new URL(subscription.endpoint).host,
				hasP256dh: Boolean(subscription.keys?.p256dh),
				hasAuth: Boolean(subscription.keys?.auth),
				savedRow: rows[0],
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

	test('the hourly sender delivers due reminders and records the send', async () => {
		const testInfo = test.info();
		const subscription = await readSubscription(page);
		expect(subscription).toBeTruthy();
		const timezone = dueTimezone();
		const [{ hour }] = await sql.query(
			'SELECT EXTRACT(HOUR FROM NOW() AT TIME ZONE $1)::int AS hour',
			[timezone]
		);
		expect(REMINDER_HOURS, `timezone ${timezone} must land in a reminder hour`).toContain(hour);
		const updated = await sql.query(
			'UPDATE push_subscription SET timezone = $2, last_sent_at = NULL WHERE endpoint = $1 RETURNING id',
			[subscription.endpoint, timezone]
		);
		expect(updated).toHaveLength(1);

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
		expect(stdout).toMatch(/1 due, 1 sent, 0 failed, 0 disabled/);

		await expect
			.poll(async () => (await readNotifications(page)).map((note) => note.title), {
				timeout: 25_000,
				message: 'sender notification should appear',
			})
			.toContain('Daily 5 is ready');
		const rows = await sql.query(
			'SELECT enabled, last_sent_at, last_error FROM push_subscription WHERE endpoint = $1',
			[subscription.endpoint]
		);
		expect(rows[0].last_sent_at).not.toBeNull();
		expect(rows[0].last_error).toBeNull();

		await testInfo.attach('evidence', {
			body: JSON.stringify({
				timezone,
				senderOutput: stdout.trim().split('\n').at(-1),
				rowAfterSend: rows[0],
			}),
			contentType: 'application/json',
		});
	});

	test('toggling off archives the subscription', async () => {
		const testInfo = test.info();
		const toggle = reminderToggle(page);
		await expect(toggle).toBeChecked();
		const responsePromise = page.waitForResponse(
			(response) =>
				response.url().includes('/api/reminders/subscribe') &&
				response.request().method() === 'DELETE',
			{ timeout: 60_000 }
		);
		await toggle.click();
		const response = await responsePromise;
		expect(response.status()).toBe(200);
		await expect(toggle).not.toBeChecked();

		const endpoint = createdEndpoints.at(-1);
		expect(endpoint, 'captured subscription endpoint').toBeTruthy();
		const active = await sql.query('SELECT 1 FROM push_subscription WHERE endpoint = $1', [endpoint]);
		const archived = await sql.query('SELECT 1 FROM push_subscription_archive WHERE endpoint = $1', [
			endpoint,
		]);
		expect(active).toHaveLength(0);
		expect(archived).toHaveLength(1);
		expect(await readSubscription(page)).toBeNull();

		await testInfo.attach('evidence', {
			body: JSON.stringify({ activeRows: active.length, archivedRows: archived.length }),
			contentType: 'application/json',
		});
	});
});
