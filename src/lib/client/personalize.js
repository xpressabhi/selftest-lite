import { track } from './telemetry.js';

const PERSONALIZE_TIMEOUT_MS = 4000;
const MIN_INTERVAL_MS = 8000;
const MAX_CALLS_PER_PAGE = 4;

let lastAtByPage = new Map();
let callsByPage = new Map();

function shouldSkip({ page, offline = false, dataSaver = false, now = Date.now() } = {}) {
	if (typeof window === 'undefined') {
		return true;
	}
	if (offline || dataSaver) {
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
	const dataSaver =
		typeof document !== 'undefined' && document.documentElement?.classList?.contains('data-saver');
	if (shouldSkip({ page, offline, dataSaver })) {
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
			headers: { 'Content-Type': 'application/json' },
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
