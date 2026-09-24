// Anonymous device-capability and connection-quality telemetry.
//
// One `device:profile` event per session (tier, RAM/core buckets, model,
// Android version, screen class, first network snapshot) plus capped,
// debounced `net:change` events when the connection tuple moves. Values are
// bucketed — browsers quantize and cap the raw numbers anyway — and every
// field degrades to `unknown`, so the collector never throws and never blocks
// the app. Spec: docs/superpowers/specs/2026-09-24-device-network-telemetry-design.md

import { track as trackEvent } from './telemetry';

const MAX_NET_CHANGES = 10;
const NET_CHANGE_DEBOUNCE_MS = 1500;
const CLIENT_HINTS_TIMEOUT_MS = 400;
const MODEL_MAX_LENGTH = 40;

const LOW_CORE_BUCKETS = new Set(['2', '3-4']);
const MID_CORE_BUCKETS = new Set(['5-6', '7-8', '8+']);
const NETWORK_TYPES = new Set(['slow-2g', '2g', '3g', '4g']);
const NETWORK_TRANSPORTS = new Set(['wifi', 'cellular']);

const UNKNOWN_PROFILE = Object.freeze({
	tier: 'unknown',
	ramGb: 'unknown',
	cores: 'unknown',
	model: 'unknown',
	android: 'unknown',
	screen: 'unknown',
	dpr: 'unknown',
	platform: 'unknown',
	standalone: false,
});

function getNavigator() {
	return typeof navigator !== 'undefined' ? navigator : null;
}

function getWindow() {
	return typeof window !== 'undefined' ? window : null;
}

function getScreen() {
	return typeof screen !== 'undefined' ? screen : null;
}

function getDocument() {
	return typeof document !== 'undefined' ? document : null;
}

function getConnection() {
	const nav = getNavigator();
	if (!nav) {
		return null;
	}
	return nav.connection || nav.mozConnection || nav.webkitConnection || null;
}

/** Chrome reports RAM rounded down to a power of two and capped at 8. */
export function bucketRam(value) {
	const ram = Number(value);
	if (!Number.isFinite(ram) || ram <= 0) {
		return 'unknown';
	}
	return Math.min(ram, 8);
}

export function bucketCores(value) {
	const cores = Number(value);
	if (!Number.isFinite(cores) || cores <= 0) {
		return 'unknown';
	}
	if (cores <= 2) {
		return '2';
	}
	if (cores <= 4) {
		return '3-4';
	}
	if (cores <= 6) {
		return '5-6';
	}
	if (cores <= 7) {
		return '7-8';
	}
	return '8+';
}

// RAM-primary: budget SoCs report 8 cores, so cores only classify when RAM is
// unavailable, and they never produce `high`.
export function classifyTier({ ramGb, cores } = {}) {
	const ram = Number(ramGb);
	if (Number.isFinite(ram) && ram > 0) {
		if (ram <= 2) {
			return 'low';
		}
		if (ram <= 4) {
			return 'mid';
		}
		return 'high';
	}
	if (LOW_CORE_BUCKETS.has(cores)) {
		return 'low';
	}
	if (MID_CORE_BUCKETS.has(cores)) {
		return 'mid';
	}
	return 'unknown';
}

export function bucketDownlink(value) {
	const mbps = Number(value);
	if (!Number.isFinite(mbps) || mbps < 0) {
		return 'unknown';
	}
	if (mbps < 0.25) {
		return 'lt025';
	}
	if (mbps < 0.5) {
		return '025-05';
	}
	if (mbps < 1) {
		return '05-1';
	}
	if (mbps < 2) {
		return '1-2';
	}
	if (mbps < 5) {
		return '2-5';
	}
	if (mbps < 10) {
		return '5-10';
	}
	return '10p';
}

export function bucketRtt(value) {
	const ms = Number(value);
	if (!Number.isFinite(ms) || ms < 0) {
		return 'unknown';
	}
	if (ms < 100) {
		return 'lt100';
	}
	if (ms < 200) {
		return '100-200';
	}
	if (ms < 400) {
		return '200-400';
	}
	if (ms < 800) {
		return '400-800';
	}
	if (ms < 1500) {
		return '800-1500';
	}
	return '1500p';
}

export function normalizeModel(value) {
	if (typeof value !== 'string') {
		return 'unknown';
	}
	const normalized = value
		.toLowerCase()
		.replace(/[^a-z0-9 ._-]+/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MODEL_MAX_LENGTH)
		.trim();
	if (!normalized || normalized === 'k') {
		return 'unknown';
	}
	return normalized;
}

export function parseModelFromUserAgent(userAgent) {
	if (typeof userAgent !== 'string') {
		return 'unknown';
	}
	const match = userAgent.match(/Android\s+[\d.]+;\s*([^;)]+)/i);
	if (!match) {
		return 'unknown';
	}
	const candidate = match[1].trim();
	// `wv` is the WebView marker and two-letter tokens are locales, not models.
	if (/^wv$/i.test(candidate) || /^[a-z]{2}(-[a-z]{2})?$/i.test(candidate)) {
		return 'unknown';
	}
	return normalizeModel(candidate);
}

export function parseAndroidFromUserAgent(userAgent) {
	if (typeof userAgent !== 'string') {
		return 'unknown';
	}
	const match = userAgent.match(/Android\s+(\d+)/i);
	return match ? match[1] : 'unknown';
}

export function detectPlatform() {
	const nav = getNavigator();
	const userAgent = String(nav?.userAgent || '');
	const platform = String(nav?.userAgentData?.platform || '').toLowerCase();
	if (platform.includes('android') || /android/i.test(userAgent)) {
		return 'android';
	}
	if (platform.includes('ios') || /iphone|ipad|ipod/i.test(userAgent)) {
		return 'ios';
	}
	if (platform || userAgent) {
		return 'web';
	}
	return 'unknown';
}

export function bucketScreen() {
	const width = Number(getScreen()?.width);
	if (!Number.isFinite(width) || width <= 0) {
		return 'unknown';
	}
	if (width < 360) {
		return 'compact';
	}
	if (width < 420) {
		return 'regular';
	}
	return 'large';
}

export function bucketDpr() {
	const dpr = Number(getWindow()?.devicePixelRatio);
	if (!Number.isFinite(dpr) || dpr <= 0) {
		return 'unknown';
	}
	if (dpr <= 1) {
		return '1';
	}
	if (dpr <= 1.5) {
		return '1.5';
	}
	if (dpr <= 2) {
		return '2';
	}
	return '3+';
}

export function detectStandalone() {
	const win = getWindow();
	const nav = getNavigator();
	try {
		if (win?.Capacitor?.isNativePlatform?.()) {
			return true;
		}
		if (win?.matchMedia?.('(display-mode: standalone)')?.matches) {
			return true;
		}
	} catch {
		// matchMedia can throw in exotic embeds; standalone is cosmetic.
	}
	return nav?.standalone === true;
}

export function collectNetworkSnapshot() {
	const connection = getConnection();
	const effectiveType = String(connection?.effectiveType || '').toLowerCase();
	const transport = String(connection?.type || '').toLowerCase();
	const snapshot = {
		type: NETWORK_TYPES.has(effectiveType) ? effectiveType : 'unknown',
		down: bucketDownlink(connection?.downlink),
		rtt: bucketRtt(connection?.rtt),
		wifi: NETWORK_TRANSPORTS.has(transport) ? transport : 'unknown',
	};
	if (connection && typeof connection.saveData === 'boolean') {
		snapshot.save = connection.saveData;
	}
	return snapshot;
}

function parseMajorVersion(version) {
	const match = String(version ?? '').match(/(\d+)/);
	return match ? match[1] : 'unknown';
}

// High-entropy hints give the real model on Android Chrome, where UA reduction
// replaced it with "K". Raced against a timeout so a slow implementation never
// delays the profile beyond 400 ms.
async function getClientHints() {
	const userAgentData = getNavigator()?.userAgentData;
	if (!userAgentData?.getHighEntropyValues) {
		return null;
	}
	let timer = null;
	try {
		const timeout = new Promise((resolve) => {
			timer = setTimeout(() => resolve(null), CLIENT_HINTS_TIMEOUT_MS);
		});
		return await Promise.race([
			userAgentData.getHighEntropyValues(['model', 'platformVersion']).catch(() => null),
			timeout,
		]);
	} catch {
		return null;
	} finally {
		if (timer !== null) {
			clearTimeout(timer);
		}
	}
}

export async function collectDeviceProfile() {
	const nav = getNavigator();
	const userAgent = String(nav?.userAgent || '');
	const ramGb = bucketRam(nav?.deviceMemory);
	const cores = bucketCores(nav?.hardwareConcurrency);

	const profile = {
		tier: classifyTier({ ramGb, cores }),
		ramGb,
		cores,
		model: parseModelFromUserAgent(userAgent),
		android: parseAndroidFromUserAgent(userAgent),
		screen: bucketScreen(),
		dpr: bucketDpr(),
		platform: detectPlatform(),
		standalone: detectStandalone(),
	};

	try {
		const hints = await getClientHints();
		if (hints) {
			const model = normalizeModel(hints.model);
			if (model !== 'unknown') {
				profile.model = model;
			}
			const android = parseMajorVersion(hints.platformVersion);
			if (android !== 'unknown') {
				profile.android = android;
			}
		}
	} catch {
		// Keep the user-agent fallback values.
	}

	return profile;
}

let started = false;

function snapshotTuple(snapshot) {
	return [snapshot.type, snapshot.down, snapshot.rtt, snapshot.save ?? 'na'].join('|');
}

/**
 * Emits one `device:profile` per session and capped `net:change` events.
 * `track` is injectable so tests can observe events without the network.
 */
export function startDeviceProfileTracking(track = trackEvent) {
	const win = getWindow();
	const nav = getNavigator();
	if (started || !win || !nav) {
		return;
	}
	started = true;

	const initialNetwork = collectNetworkSnapshot();
	let lastTuple = snapshotTuple(initialNetwork);
	let netChanges = 0;

	void collectDeviceProfile()
		.catch(() => UNKNOWN_PROFILE)
		.then((profile) => track('device:profile', { ...profile, ...initialNetwork }));

	const connection = getConnection();
	if (!connection || typeof connection.addEventListener !== 'function') {
		return;
	}
	const doc = getDocument();
	let debounceTimer = null;

	const removeListeners = () => {
		connection.removeEventListener('change', schedule);
		doc?.removeEventListener('visibilitychange', onVisibility);
	};
	const evaluate = () => {
		debounceTimer = null;
		const snapshot = collectNetworkSnapshot();
		const tuple = snapshotTuple(snapshot);
		if (tuple === lastTuple) {
			return;
		}
		lastTuple = tuple;
		netChanges += 1;
		track('net:change', snapshot);
		if (netChanges >= MAX_NET_CHANGES) {
			removeListeners();
		}
	};
	const schedule = () => {
		if (netChanges >= MAX_NET_CHANGES) {
			return;
		}
		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
		}
		debounceTimer = setTimeout(evaluate, NET_CHANGE_DEBOUNCE_MS);
	};
	const onVisibility = () => {
		if (doc?.visibilityState === 'visible') {
			schedule();
		}
	};

	connection.addEventListener('change', schedule);
	doc?.addEventListener('visibilitychange', onVisibility);
}
