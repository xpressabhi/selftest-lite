import { getClientHeaders } from './identity.js';
import { track } from './telemetry.js';

const PERSONALIZE_TIMEOUT_MS = 4000;
const MIN_INTERVAL_MS = 8000;
const MAX_CALLS_PER_PAGE = 4;

/**
 * How long the page must be continuously visible before a boot-time model
 * call is worth making. A JS-rendering crawler boots the shell, syncs state
 * and closes in well under a second; waiting here means it never spends a
 * personalization call. A real visitor cannot tell the difference because the
 * decision only rearranges an already-painted page.
 */
export const PERSONALIZE_VISIBLE_DELAY_MS = 2000;

/**
 * Runs `callback` once the document has been visible for `delayMs`, pausing
 * while the tab is hidden. Returns a cleanup that cancels the countdown.
 */
export function afterVisibleFor(delayMs, callback) {
	if (typeof document === 'undefined') {
		return () => {};
	}
	let remaining = delayMs;
	let startedAt = 0;
	let timer = null;
	let done = false;

	const stop = () => {
		if (!timer) {
			return;
		}
		clearTimeout(timer);
		timer = null;
		remaining = Math.max(0, remaining - (Date.now() - startedAt));
	};
	const onChange = () => {
		if (document.visibilityState === 'visible') {
			start();
		} else {
			stop();
		}
	};
	const start = () => {
		if (done || timer || document.visibilityState !== 'visible') {
			return;
		}
		startedAt = Date.now();
		timer = setTimeout(() => {
			done = true;
			timer = null;
			document.removeEventListener('visibilitychange', onChange);
			callback();
		}, remaining);
	};

	start();
	if (!done) {
		document.addEventListener('visibilitychange', onChange);
	}
	return () => {
		done = true;
		stop();
		document.removeEventListener('visibilitychange', onChange);
	};
}

let lastAtByPage = new Map();
let callsByPage = new Map();

function shouldSkip({ page, offline = false, now = Date.now() } = {}) {
	if (typeof window === 'undefined') {
		return true;
	}
	if (offline) {
		return true;
	}
	const lastAt = lastAtByPage.get(page) || 0;
	if (now - lastAt < MIN_INTERVAL_MS) {
		return true;
	}
	if ((callsByPage.get(page) || 0) >= MAX_CALLS_PER_PAGE) {
		return true;
	}
	return false;
}

/**
 * Fetches one central/micro personalization decision. Fail-open: any error,
 * skip, or low-confidence result resolves to `{ applied: false }` so callers
 * keep the current static UI. Tracks request/applied/fallback in the same
 * module so the telemetry allowlist test sees emit sites.
 */
export async function requestPersonalize(page, state = {}, options = {}) {
	const { signal } = options;
	const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
	if (shouldSkip({ page, offline })) {
		track('personalize:fallback', { page, reason: 'skipped' });
		return { applied: false, action: null, hide: [], promote: [] };
	}
	track('personalize:request', { page });
	lastAtByPage.set(page, Date.now());
	callsByPage.set(page, (callsByPage.get(page) || 0) + 1);

	const controller = new AbortController();
	const timeoutId = window.setTimeout(() => controller.abort(), PERSONALIZE_TIMEOUT_MS);
	try {
		const response = await fetch('/api/personalize', {
			method: 'POST',
			// Without the anonymous id these rows cannot be attributed, and bot
			// boots are indistinguishable from real visitors in the report.
			headers: getClientHeaders(),
			body: JSON.stringify({ page, state }),
			signal: signal || controller.signal,
		});
		const data = await response.json().catch(() => ({}));
		if (!response.ok || !data) {
			track('personalize:fallback', { page, status: response.status });
			return { applied: false, action: null, hide: [], promote: [] };
		}
		if (data.applied) {
			track('personalize:applied', { page, action: data.action });
		} else {
			track('personalize:fallback', { page, reason: 'not-applied' });
		}
		return data;
	} catch {
		track('personalize:fallback', { page, reason: 'error' });
		return { applied: false, action: null, hide: [], promote: [] };
	} finally {
		window.clearTimeout(timeoutId);
	}
}
