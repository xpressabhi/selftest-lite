#!/usr/bin/env node
// Sends due daily practice reminders via Web Push.
//
// Run hourly (the reminders GitHub Action does). A subscription is due when it
// is enabled, has not been sent in 20 hours, and the subscriber's local hour
// is one of the reminder hours (7-8am / 8-9pm by default).
//
// Requires DATABASE_URL and VAPID keys. When VAPID keys are absent the script
// exits 0 with a message so the scheduled workflow is not noisy before setup.

import { neon } from '@neondatabase/serverless';
import webpush from 'web-push';

const databaseUrl = process.env.DATABASE_URL;
const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:hello@selftest.in';

if (!databaseUrl) {
	console.error('DATABASE_URL is not set.');
	process.exit(1);
}
if (!publicKey || !privateKey) {
	console.log('VAPID keys are not configured; skipping reminder send.');
	process.exit(0);
}

webpush.setVapidDetails(subject, publicKey, privateKey);
const sql = neon(databaseUrl);

const dueSubscriptions = await sql`
	SELECT id, endpoint, p256dh, auth, timezone
	FROM push_subscription
	WHERE enabled = TRUE
		AND (last_sent_at IS NULL OR last_sent_at < NOW() - INTERVAL '20 hours')
		AND EXTRACT(
			HOUR FROM (NOW() AT TIME ZONE COALESCE(NULLIF(timezone, ''), 'Asia/Kolkata'))
		)::int IN (7, 8, 20, 21)
`;

let sent = 0;
let failed = 0;
let disabled = 0;

for (const subscription of dueSubscriptions) {
	try {
		await webpush.sendNotification(
			{
				endpoint: subscription.endpoint,
				keys: { p256dh: subscription.p256dh, auth: subscription.auth },
			},
			JSON.stringify({
				title: 'Daily 5 is ready',
				body: 'Keep your streak going — 5 quick questions.',
				url: '/?daily=1',
			}),
			{ TTL: 12 * 60 * 60 }
		);
		await sql`
			UPDATE push_subscription
			SET last_sent_at = NOW(), last_error = NULL, updated_at = NOW()
			WHERE id = ${subscription.id}
		`;
		sent += 1;
	} catch (error) {
		const statusCode = Number(error?.statusCode || 0);
		const shouldDisable = statusCode === 404 || statusCode === 410;
		if (shouldDisable) {
			disabled += 1;
		} else {
			failed += 1;
		}
		await sql`
			UPDATE push_subscription
			SET last_error = ${String(error?.message || 'send failed').slice(0, 300)},
				enabled = CASE WHEN ${shouldDisable} THEN FALSE ELSE enabled END,
				updated_at = NOW()
			WHERE id = ${subscription.id}
		`;
	}
}

console.log(
	`Reminders: ${dueSubscriptions.length} due, ${sent} sent, ${failed} failed, ${disabled} disabled.`
);
