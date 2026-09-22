// Daily practice reminders via Web Push.
//
// The opt-in is explicit and only offered after a user has finished at least
// two tests. Notification copy is streak-aware and sent at 7-8am / 8-9pm
// local time (see scripts/send-reminders.mjs), max once per 20 hours.

import { env } from '$env/dynamic/public';
import { track } from './telemetry';

function urlBase64ToUint8Array(base64String) {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function remindersSupported() {
	return (
		typeof window !== 'undefined' &&
		'serviceWorker' in navigator &&
		'PushManager' in window &&
		'Notification' in window
	);
}

async function getRegistration() {
	return navigator.serviceWorker.ready;
}

export async function isReminderEnabled() {
	if (!remindersSupported()) {
		return false;
	}
	try {
		const registration = await getRegistration();
		const subscription = await registration.pushManager.getSubscription();
		return Boolean(subscription);
	} catch {
		return false;
	}
}

export async function enableReminders() {
	if (!remindersSupported()) {
		return { ok: false, reason: 'unsupported' };
	}
	const publicKey = env.PUBLIC_VAPID_KEY;
	if (!publicKey) {
		return { ok: false, reason: 'unconfigured' };
	}
	try {
		const permission = await Notification.requestPermission();
		if (permission !== 'granted') {
			return { ok: false, reason: 'denied' };
		}
		const registration = await getRegistration();
		const subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(publicKey),
		});
		const json = subscription.toJSON();
		const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const saved = await fetch('/api/reminders/subscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				subscription: {
					endpoint: json.endpoint,
					keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
				},
				timezone,
			}),
		}).catch(() => null);
		if (!saved?.ok) {
			// Without a server row the hourly sender can never reach this
			// subscription, so roll it back instead of pretending it is on.
			await subscription.unsubscribe().catch(() => {});
			return { ok: false, reason: 'server' };
		}
		track('reminder:opt-in', { enabled: true, timezone });
		return { ok: true };
	} catch (error) {
		console.error('Failed to enable reminders:', error);
		return { ok: false, reason: 'error' };
	}
}

export async function disableReminders() {
	if (!remindersSupported()) {
		return { ok: false, reason: 'unsupported' };
	}
	try {
		const registration = await getRegistration();
		const subscription = await registration.pushManager.getSubscription();
		if (subscription) {
			const removed = await fetch('/api/reminders/subscribe', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint: subscription.endpoint }),
			}).catch(() => null);
			if (!removed?.ok) {
				// Keep the browser subscription so the toggle and the server
				// row stay in agreement and the user can retry.
				return { ok: false, reason: 'server' };
			}
			await subscription.unsubscribe();
		}
		track('reminder:opt-in', { enabled: false });
		return { ok: true };
	} catch (error) {
		console.error('Failed to disable reminders:', error);
		return { ok: false, reason: 'error' };
	}
}
