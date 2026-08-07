// Lightweight, anonymous, batch-flushed feature telemetry.
// Events queue in memory and flush every 30s, at 20+ events, or on page
// unload (sendBeacon). Nothing is persisted to localStorage: a lost batch
// on crash is acceptable for feature-usage signals. Each batch carries the
// stable anonymous client id (see identity.js) so activity can be attributed
// to a visitor even before login.

import { getClientId } from './identity';

const FLUSH_INTERVAL_MS = 30_000;
const MAX_QUEUE_BEFORE_FLUSH = 20;
const MAX_EVENTS_PER_BATCH = 50;

let queue = [];
let sessionId = '';
let started = false;

function getSessionId() {
	if (!sessionId) {
		try {
			sessionId =
				typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
					? crypto.randomUUID()
					: `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
		} catch {
			sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
		}
	}
	return sessionId;
}

function getPage() {
	if (typeof window === 'undefined') {
		return '';
	}
	return window.location.pathname;
}

// Local development must never pollute production telemetry.
function isLocalhost() {
	if (typeof window === 'undefined') {
		return false;
	}
	const hostname = window.location.hostname;
	return (
		hostname === 'localhost' ||
		hostname === '127.0.0.1' ||
		hostname === '::1'
	);
}

function sendBatch(events) {
	if (typeof navigator === 'undefined' || events.length === 0) {
		return;
	}
	const payload = JSON.stringify({ sessionId: getSessionId(), clientId: getClientId(), events });
	const url = '/api/telemetry';
	try {
		if (navigator.sendBeacon) {
			const blob = new Blob([payload], { type: 'application/json' });
			if (navigator.sendBeacon(url, blob)) {
				return;
			}
		}
		fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: payload,
			keepalive: true,
		}).catch(() => {
			// Telemetry is best-effort; never surface errors to the user.
		});
	} catch {
		// Best-effort only.
	}
}

export function flushTelemetry() {
	if (queue.length === 0) {
		return;
	}
	const batch = queue.splice(0, MAX_EVENTS_PER_BATCH);
	sendBatch(batch);
}

export function track(event, props = {}) {
	if (typeof window === 'undefined' || isLocalhost()) {
		return;
	}
	queue.push({ event, page: getPage(), props, created_at: new Date().toISOString() });
	if (queue.length >= MAX_QUEUE_BEFORE_FLUSH) {
		flushTelemetry();
	}
}

let debounceTimers = new Map();

/**
 * Debounced tracking for high-frequency inputs (typing, scrolling).
 * Only the final value after `delay` ms of inactivity is emitted.
 */
export function trackDebounced(event, props, delay = 800) {
	const existing = debounceTimers.get(event);
	if (existing) {
		clearTimeout(existing);
	}
	debounceTimers.set(
		event,
		setTimeout(() => {
			debounceTimers.delete(event);
			track(event, props);
		}, delay),
	);
}

function trackScrollDepth() {
	const thresholds = new Set([25, 50, 75, 100]);
	const reported = new Set();

	const onScroll = () => {
		if (typeof window === 'undefined' || !document.documentElement) {
			return;
		}
		const scrollable =
			document.documentElement.scrollHeight - window.innerHeight;
		if (scrollable <= 0) {
			return;
		}
		const ratio = Math.round((window.scrollY / scrollable) * 100);
		for (const threshold of thresholds) {
			if (ratio >= threshold && !reported.has(threshold)) {
				reported.add(threshold);
				track('scroll:depth', { depth: threshold });
			}
		}
	};

	window.addEventListener('scroll', onScroll, { passive: true });
}

export function startTelemetry() {
	if (started || typeof window === 'undefined' || isLocalhost()) {
		return;
	}
	started = true;

	window.setInterval(flushTelemetry, FLUSH_INTERVAL_MS);

	const flushOnExit = () => {
		flushTelemetry();
	};
	window.addEventListener('pagehide', flushOnExit);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') {
			flushTelemetry();
		}
	});

	trackScrollDepth();
}
