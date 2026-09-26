// Daily practice reminders via Web Push.
//
// The opt-in is explicit and only offered after a user has finished at least
// two tests. Notification copy is streak-aware and delivered any time from
// 7am local (chosen hour, or the 7am smart default) until 10pm, catching up
// when a scheduled run is late (see scripts/send-reminders.mjs), max once per
// 20 hours.

import { env } from '$env/dynamic/public';
import { parseReminderHour } from '$lib/shared/reminders';
import { STORAGE_KEYS } from './constants';
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

const SERVICE_WORKER_READY_TIMEOUT_MS = 2000;

// Resolves the active service worker, or null when there is none. A bare
// `navigator.serviceWorker.ready` never settles without a registration — dev
// registers /sw.js only in production (see +layout.svelte), so awaiting it
// there hangs the toggle forever instead of reporting the missing worker.
async function getRegistration() {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
		return null;
	}
	const existing = await navigator.serviceWorker.getRegistration();
	if (existing) {
		return navigator.serviceWorker.ready;
	}
	// Nothing registers in dev, so fail fast. In production a first-load
	// registration may still be in flight; give it a brief chance.
	if (import.meta.env.DEV) {
		return null;
	}
	return Promise.race([
		navigator.serviceWorker.ready,
		new Promise((resolve) => setTimeout(() => resolve(null), SERVICE_WORKER_READY_TIMEOUT_MS)),
	]);
}

// The chosen reminder hour is mirrored locally so the picker renders before the
// service worker is ready; the server row stays the source of truth for sends.
function readStoredReminderHour() {
	if (typeof window === 'undefined') {
		return null;
	}
	try {
		const raw = window.localStorage.getItem(STORAGE_KEYS.REMINDER_HOUR);
		const hour = parseReminderHour(raw === null ? null : JSON.parse(raw));
		return hour === undefined ? null : hour;
	} catch {
		return null;
	}
}

function writeStoredReminderHour(hour) {
	if (typeof window === 'undefined') {
		return;
	}
	try {
		if (hour === null) {
			window.localStorage.removeItem(STORAGE_KEYS.REMINDER_HOUR);
		} else {
			window.localStorage.setItem(STORAGE_KEYS.REMINDER_HOUR, JSON.stringify(hour));
		}
	} catch (error) {
		console.error('Failed to store reminder hour:', error);
	}
}

export function getReminderHour() {
	return readStoredReminderHour();
}

/**
 * Changes the daily reminder time (null = smart default, the catch-up window
 * from 7am).
 * While reminders are off this only updates the local mirror; enabling applies
 * it. With a live subscription the server row is patched, and a failed patch
 * restores the previous selection.
 */
export async function setReminderHour(hour) {
	const normalized = parseReminderHour(hour);
	if (normalized === undefined) {
		return { ok: false, reason: 'invalid' };
	}
	if (!remindersSupported()) {
		return { ok: false, reason: 'unsupported' };
	}
	const previous = readStoredReminderHour();
	writeStoredReminderHour(normalized);
	try {
		const registration = await getRegistration();
		const subscription = registration ? await registration.pushManager.getSubscription() : null;
		if (!subscription) {
			track('reminder:time-set', { hour: normalized });
			return { ok: true };
		}
		const response = await fetch('/api/reminders/subscribe', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ endpoint: subscription.endpoint, hour: normalized }),
		}).catch(() => null);
		if (!response?.ok) {
			writeStoredReminderHour(previous);
			return { ok: false, reason: 'server' };
		}
		track('reminder:time-set', { hour: normalized });
		return { ok: true };
	} catch (error) {
		console.error('Failed to update reminder hour:', error);
		writeStoredReminderHour(previous);
		return { ok: false, reason: 'error' };
	}
}

export async function isReminderEnabled() {
	if (!remindersSupported()) {
		return false;
	}
	try {
		const registration = await getRegistration();
		if (!registration) {
			return false;
		}
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
		// Without an active service worker the browser has nowhere to deliver a
		// push, so resolve the worker before spending a permission prompt on
		// this device.
		const registration = await getRegistration();
		if (!registration) {
			return { ok: false, reason: 'unconfigured' };
		}
		const permission = await Notification.requestPermission();
		if (permission !== 'granted') {
			return { ok: false, reason: 'denied' };
		}
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
				hour: getReminderHour(),
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
		if (!registration) {
			return { ok: false, reason: 'unconfigured' };
		}
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
