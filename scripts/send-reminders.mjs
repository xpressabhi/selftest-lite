#!/usr/bin/env node
// Sends due daily practice reminders via Web Push.
//
// Run hourly (the reminders GitHub Action does). A subscription is due when it
// is enabled, has not been sent in the last REMINDER_MIN_GAP_HOURS, and the
// subscriber's local hour matches their chosen hour — or one of REMINDER_HOURS
// when they have not chosen one (src/lib/shared/reminders.js, shared with the
// in-app due query in src/lib/server/storage.js).
//
// Requires DATABASE_URL and VAPID keys. When VAPID keys are absent the script
// exits 0 with a message so the scheduled workflow is not noisy before setup.

import { neon } from '@neondatabase/serverless';
import { sendPushNotification } from '../src/lib/server/push.js';
import { DUE_SUBSCRIPTION_PARAMS, DUE_SUBSCRIPTIONS_SQL } from '../src/lib/shared/reminders.js';

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

const sql = neon(databaseUrl);

// The due rule (chosen hour or smart windows, minimum gap, timezone) lives in
// src/lib/shared/reminders.js and is shared with the in-app due query.
const dueSubscriptions = await sql.query(DUE_SUBSCRIPTIONS_SQL, DUE_SUBSCRIPTION_PARAMS);

let sent = 0;
let failed = 0;
let disabled = 0;

for (const subscription of dueSubscriptions) {
	try {
		await sendPushNotification(
			subscription,
			{
				title: 'Daily 5 is ready',
				body: 'Keep your streak going — 5 quick questions.',
				url: '/?daily=1',
			},
			{ publicKey, privateKey, subject }
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
