// Device & network telemetry: failure modes first (repo rule).
//
// The collector must degrade to `unknown` on every browser API it cannot
// reach, must never throw or emit garbage from hostile user agents, and the
// tracker must emit exactly one profile per session plus capped, debounced
// net:change events. Spec: docs/superpowers/specs/2026-09-24-device-network-telemetry-design.md

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let deviceProfile;

const ANDROID_UA =
	'Mozilla/5.0 (Linux; Android 13; SM-A032F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const REDUCED_UA =
	'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function fakeConnection(initial = {}) {
	const listeners = new Map();
	return {
		effectiveType: '4g',
		downlink: 5,
		rtt: 100,
		saveData: false,
		type: 'wifi',
		...initial,
		addEventListener: vi.fn((type, handler) => listeners.set(type, handler)),
		removeEventListener: vi.fn((type) => listeners.delete(type)),
		dispatch(type) {
			listeners.get(type)?.();
		},
		listenerCount() {
			return listeners.size;
		},
	};
}

function stubBrowser({
	deviceMemory,
	hardwareConcurrency,
	connection,
	userAgent = ANDROID_UA,
	userAgentData,
	screenWidth = 412,
	devicePixelRatio = 2.625,
	standalone = false,
	visibilityState = 'visible',
	withWindow = true,
	withDocument = true,
} = {}) {
	if (withWindow) {
		vi.stubGlobal('window', {
			devicePixelRatio: devicePixelRatio === null ? undefined : devicePixelRatio,
			matchMedia: () => ({ matches: standalone }),
			Capacitor: undefined,
		});
	} else {
		vi.stubGlobal('window', undefined);
	}
	vi.stubGlobal('navigator', {
		deviceMemory,
		hardwareConcurrency,
		connection,
		userAgent,
		userAgentData,
	});
	vi.stubGlobal('screen', screenWidth === null ? undefined : { width: screenWidth });
	if (withDocument) {
		const listeners = new Map();
		vi.stubGlobal('document', {
			visibilityState,
			addEventListener: vi.fn((type, handler) => listeners.set(type, handler)),
			removeEventListener: vi.fn((type) => listeners.delete(type)),
		});
	} else {
		vi.stubGlobal('document', undefined);
	}
}

async function loadFreshModule() {
	vi.resetModules();
	deviceProfile = await import('./deviceProfile');
}

describe('device profile collection', () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		await loadFreshModule();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('returns an all-unknown profile with no browser globals (SSR) and never throws', async () => {
		vi.stubGlobal('window', undefined);
		vi.stubGlobal('navigator', undefined);
		vi.stubGlobal('screen', undefined);
		vi.stubGlobal('document', undefined);

		const profile = await deviceProfile.collectDeviceProfile();
		expect(profile).toMatchObject({
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
		expect(deviceProfile.collectNetworkSnapshot()).toEqual({
			type: 'unknown',
			down: 'unknown',
			rtt: 'unknown',
			wifi: 'unknown',
		});
	});

	it('buckets reported RAM values and caps above 8', () => {
		expect(deviceProfile.bucketRam(0.25)).toBe(0.25);
		expect(deviceProfile.bucketRam(1)).toBe(1);
		expect(deviceProfile.bucketRam(4)).toBe(4);
		expect(deviceProfile.bucketRam(8)).toBe(8);
		expect(deviceProfile.bucketRam(16)).toBe(8);
		expect(deviceProfile.bucketRam(undefined)).toBe('unknown');
		expect(deviceProfile.bucketRam(Number.NaN)).toBe('unknown');
		expect(deviceProfile.bucketRam(-2)).toBe('unknown');
	});

	it('buckets core counts', () => {
		expect(deviceProfile.bucketCores(1)).toBe('2');
		expect(deviceProfile.bucketCores(2)).toBe('2');
		expect(deviceProfile.bucketCores(3)).toBe('3-4');
		expect(deviceProfile.bucketCores(4)).toBe('3-4');
		expect(deviceProfile.bucketCores(5)).toBe('5-6');
		expect(deviceProfile.bucketCores(6)).toBe('5-6');
		expect(deviceProfile.bucketCores(7)).toBe('7-8');
		expect(deviceProfile.bucketCores(8)).toBe('8+');
		expect(deviceProfile.bucketCores(12)).toBe('8+');
		expect(deviceProfile.bucketCores(undefined)).toBe('unknown');
	});

	it('classifies tiers with RAM primary and cores only as fallback', () => {
		expect(deviceProfile.classifyTier({ ramGb: 1, cores: '8+' })).toBe('low');
		expect(deviceProfile.classifyTier({ ramGb: 2, cores: '8+' })).toBe('low');
		expect(deviceProfile.classifyTier({ ramGb: 4, cores: '8+' })).toBe('mid');
		expect(deviceProfile.classifyTier({ ramGb: 8, cores: '2' })).toBe('high');
		expect(deviceProfile.classifyTier({ ramGb: 'unknown', cores: '2' })).toBe('low');
		expect(deviceProfile.classifyTier({ ramGb: 'unknown', cores: '3-4' })).toBe('low');
		expect(deviceProfile.classifyTier({ ramGb: 'unknown', cores: '5-6' })).toBe('mid');
		expect(deviceProfile.classifyTier({ ramGb: 'unknown', cores: 'unknown' })).toBe('unknown');
	});

	it('buckets downlink at the documented boundaries', () => {
		expect(deviceProfile.bucketDownlink(0.24)).toBe('lt025');
		expect(deviceProfile.bucketDownlink(0.25)).toBe('025-05');
		expect(deviceProfile.bucketDownlink(0.49)).toBe('025-05');
		expect(deviceProfile.bucketDownlink(0.5)).toBe('05-1');
		expect(deviceProfile.bucketDownlink(0.99)).toBe('05-1');
		expect(deviceProfile.bucketDownlink(1)).toBe('1-2');
		expect(deviceProfile.bucketDownlink(1.99)).toBe('1-2');
		expect(deviceProfile.bucketDownlink(2)).toBe('2-5');
		expect(deviceProfile.bucketDownlink(4.99)).toBe('2-5');
		expect(deviceProfile.bucketDownlink(5)).toBe('5-10');
		expect(deviceProfile.bucketDownlink(9.99)).toBe('5-10');
		expect(deviceProfile.bucketDownlink(10)).toBe('10p');
		expect(deviceProfile.bucketDownlink(20)).toBe('10p');
		expect(deviceProfile.bucketDownlink(undefined)).toBe('unknown');
		expect(deviceProfile.bucketDownlink(Number.NaN)).toBe('unknown');
	});

	it('buckets RTT at the documented boundaries', () => {
		expect(deviceProfile.bucketRtt(99)).toBe('lt100');
		expect(deviceProfile.bucketRtt(100)).toBe('100-200');
		expect(deviceProfile.bucketRtt(199)).toBe('100-200');
		expect(deviceProfile.bucketRtt(200)).toBe('200-400');
		expect(deviceProfile.bucketRtt(399)).toBe('200-400');
		expect(deviceProfile.bucketRtt(400)).toBe('400-800');
		expect(deviceProfile.bucketRtt(799)).toBe('400-800');
		expect(deviceProfile.bucketRtt(800)).toBe('800-1500');
		expect(deviceProfile.bucketRtt(1499)).toBe('800-1500');
		expect(deviceProfile.bucketRtt(1500)).toBe('1500p');
		expect(deviceProfile.bucketRtt(3000)).toBe('1500p');
		expect(deviceProfile.bucketRtt(undefined)).toBe('unknown');
	});

	it('normalizes model strings and rejects reduced user agents', () => {
		expect(deviceProfile.normalizeModel('Redmi 9A')).toBe('redmi 9a');
		expect(deviceProfile.normalizeModel('  SM-A032F  ')).toBe('sm-a032f');
		expect(deviceProfile.normalizeModel('K')).toBe('unknown');
		expect(deviceProfile.normalizeModel('')).toBe('unknown');
		expect(deviceProfile.normalizeModel(undefined)).toBe('unknown');
		expect(deviceProfile.normalizeModel('x'.repeat(80))).toHaveLength(40);
		const hostile = deviceProfile.normalizeModel('<img src=x onerror=alert(1)>');
		expect(hostile).not.toMatch(/[<>]/);
		expect(hostile.length).toBeLessThanOrEqual(40);
	});

	it('parses model and Android version from a user agent, skipping reduced or placeholder tokens', () => {
		expect(deviceProfile.parseModelFromUserAgent(ANDROID_UA)).toBe('sm-a032f');
		expect(deviceProfile.parseModelFromUserAgent(REDUCED_UA)).toBe('unknown');
		expect(
			deviceProfile.parseModelFromUserAgent(
				'Mozilla/5.0 (Linux; Android 11; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
			)
		).toBe('unknown');
		expect(
			deviceProfile.parseModelFromUserAgent(
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36'
			)
		).toBe('unknown');
		expect(deviceProfile.parseAndroidFromUserAgent(ANDROID_UA)).toBe('13');
		expect(deviceProfile.parseAndroidFromUserAgent(REDUCED_UA)).toBe('10');
		expect(deviceProfile.parseAndroidFromUserAgent('Mozilla/5.0 (Macintosh)')).toBe('unknown');
	});

	it('detects the platform family', () => {
		stubBrowser();
		expect(deviceProfile.detectPlatform()).toBe('android');
		vi.stubGlobal('navigator', {
			userAgent:
				'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
		});
		expect(deviceProfile.detectPlatform()).toBe('ios');
		vi.stubGlobal('navigator', {
			userAgent:
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
		});
		expect(deviceProfile.detectPlatform()).toBe('web');
		vi.stubGlobal('navigator', undefined);
		expect(deviceProfile.detectPlatform()).toBe('unknown');
	});

	it('buckets screen class and device pixel ratio', () => {
		stubBrowser({ screenWidth: 320, devicePixelRatio: 1 });
		expect(deviceProfile.bucketScreen()).toBe('compact');
		expect(deviceProfile.bucketDpr()).toBe('1');
		stubBrowser({ screenWidth: 390, devicePixelRatio: 1.5 });
		expect(deviceProfile.bucketScreen()).toBe('regular');
		expect(deviceProfile.bucketDpr()).toBe('1.5');
		stubBrowser({ screenWidth: 430, devicePixelRatio: 3 });
		expect(deviceProfile.bucketScreen()).toBe('large');
		expect(deviceProfile.bucketDpr()).toBe('3+');
		stubBrowser({ screenWidth: null, devicePixelRatio: null });
		expect(deviceProfile.bucketScreen()).toBe('unknown');
		expect(deviceProfile.bucketDpr()).toBe('unknown');
	});

	it('reads the full profile from stubbed hardware', async () => {
		stubBrowser({ deviceMemory: 1, hardwareConcurrency: 4, screenWidth: 360, devicePixelRatio: 2 });
		const profile = await deviceProfile.collectDeviceProfile();
		expect(profile).toMatchObject({
			tier: 'low',
			ramGb: 1,
			cores: '3-4',
			model: 'sm-a032f',
			android: '13',
			screen: 'regular',
			dpr: '2',
			platform: 'android',
			standalone: false,
		});
	});

	it('marks standalone when installed or running in the native shell', async () => {
		stubBrowser({ standalone: true });
		expect((await deviceProfile.collectDeviceProfile()).standalone).toBe(true);
		vi.stubGlobal('window', {
			devicePixelRatio: 2,
			matchMedia: () => ({ matches: false }),
			Capacitor: { isNativePlatform: () => true },
		});
		expect((await deviceProfile.collectDeviceProfile()).standalone).toBe(true);
	});

	it('enriches model and Android version from user agent client hints', async () => {
		stubBrowser({
			userAgent: REDUCED_UA,
			userAgentData: {
				getHighEntropyValues: async () => ({ model: 'Redmi 9A', platformVersion: '11.0.0' }),
			},
		});
		const profile = await deviceProfile.collectDeviceProfile();
		expect(profile.model).toBe('redmi 9a');
		expect(profile.android).toBe('11');
	});

	it('falls back to the user agent when client hints reject', async () => {
		stubBrowser({
			userAgent: ANDROID_UA,
			userAgentData: {
				getHighEntropyValues: async () => {
					throw new Error('denied');
				},
			},
		});
		const profile = await deviceProfile.collectDeviceProfile();
		expect(profile.model).toBe('sm-a032f');
		expect(profile.android).toBe('13');
	});

	it('falls back when client hints never resolve (timeout)', async () => {
		stubBrowser({
			userAgent: ANDROID_UA,
			userAgentData: { getHighEntropyValues: () => new Promise(() => {}) },
		});
		const pending = deviceProfile.collectDeviceProfile();
		await vi.advanceTimersByTimeAsync(400);
		const profile = await pending;
		expect(profile.model).toBe('sm-a032f');
		expect(profile.android).toBe('13');
	});

	it('reports the network snapshot from the connection API', () => {
		stubBrowser({
			connection: fakeConnection({ effectiveType: '3g', downlink: 0.7, rtt: 350, saveData: true }),
		});
		expect(deviceProfile.collectNetworkSnapshot()).toEqual({
			type: '3g',
			down: '05-1',
			rtt: '200-400',
			save: true,
			wifi: 'wifi',
		});
	});

	it('omits saveData when the connection API cannot report it', () => {
		stubBrowser({ connection: undefined });
		const snapshot = deviceProfile.collectNetworkSnapshot();
		expect(snapshot).toEqual({ type: 'unknown', down: 'unknown', rtt: 'unknown', wifi: 'unknown' });
		expect('save' in snapshot).toBe(false);
	});
});

describe('device profile tracking lifecycle', () => {
	beforeEach(async () => {
		vi.useFakeTimers();
		await loadFreshModule();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('emits exactly one device:profile per session, merged with the network snapshot', async () => {
		stubBrowser({
			deviceMemory: 2,
			hardwareConcurrency: 8,
			connection: fakeConnection({ effectiveType: '3g', downlink: 0.7, rtt: 350 }),
		});
		const emitted = [];
		deviceProfile.startDeviceProfileTracking((event, props) => emitted.push({ event, props }));
		deviceProfile.startDeviceProfileTracking((event, props) => emitted.push({ event, props }));
		await vi.advanceTimersByTimeAsync(400);

		expect(emitted).toHaveLength(1);
		expect(emitted[0].event).toBe('device:profile');
		expect(emitted[0].props).toMatchObject({
			tier: 'low',
			ramGb: 2,
			cores: '8+',
			type: '3g',
			down: '05-1',
			rtt: '200-400',
		});
	});

	it('emits a net:change only when the connection tuple changes', async () => {
		const connection = fakeConnection({ effectiveType: '4g', downlink: 5, rtt: 100 });
		stubBrowser({ connection });
		const emitted = [];
		deviceProfile.startDeviceProfileTracking((event, props) => emitted.push({ event, props }));
		await vi.advanceTimersByTimeAsync(400);

		connection.dispatch('change');
		await vi.advanceTimersByTimeAsync(1500);
		expect(emitted.filter((entry) => entry.event === 'net:change')).toHaveLength(0);

		connection.effectiveType = '2g';
		connection.downlink = 0.3;
		connection.rtt = 600;
		connection.dispatch('change');
		await vi.advanceTimersByTimeAsync(1500);

		const changes = emitted.filter((entry) => entry.event === 'net:change');
		expect(changes).toHaveLength(1);
		expect(changes[0].props).toMatchObject({ type: '2g', down: '025-05', rtt: '400-800' });
	});

	it('collapses rapid connection flaps into one debounced event', async () => {
		const connection = fakeConnection({ effectiveType: '4g' });
		stubBrowser({ connection });
		const emitted = [];
		deviceProfile.startDeviceProfileTracking((event, props) => emitted.push({ event, props }));
		await vi.advanceTimersByTimeAsync(400);

		connection.effectiveType = '3g';
		connection.dispatch('change');
		await vi.advanceTimersByTimeAsync(200);
		connection.effectiveType = '2g';
		connection.dispatch('change');
		await vi.advanceTimersByTimeAsync(200);
		connection.effectiveType = 'slow-2g';
		connection.dispatch('change');
		await vi.advanceTimersByTimeAsync(1500);

		const changes = emitted.filter((entry) => entry.event === 'net:change');
		expect(changes).toHaveLength(1);
		expect(changes[0].props.type).toBe('slow-2g');
	});

	it('caps net:change at 10 and removes its listeners', async () => {
		const connection = fakeConnection({ effectiveType: '4g' });
		stubBrowser({ connection });
		const emitted = [];
		deviceProfile.startDeviceProfileTracking((event, props) => emitted.push({ event, props }));
		await vi.advanceTimersByTimeAsync(400);

		const types = ['3g', '2g', 'slow-2g', '3g', '2g', 'slow-2g', '3g', '2g', 'slow-2g', '3g'];
		for (const type of types) {
			connection.effectiveType = type;
			connection.dispatch('change');
			await vi.advanceTimersByTimeAsync(1500);
		}
		expect(emitted.filter((entry) => entry.event === 'net:change')).toHaveLength(10);
		expect(connection.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));

		connection.effectiveType = '2g';
		connection.dispatch('change');
		await vi.advanceTimersByTimeAsync(1500);
		expect(emitted.filter((entry) => entry.event === 'net:change')).toHaveLength(10);
	});

	it('re-checks the connection when the tab becomes visible again', async () => {
		const connection = fakeConnection({ effectiveType: '4g' });
		stubBrowser({ connection });
		const emitted = [];
		deviceProfile.startDeviceProfileTracking((event, props) => emitted.push({ event, props }));
		await vi.advanceTimersByTimeAsync(400);

		connection.effectiveType = '3g';
		// The stub document stores listeners; invoke the visibility handler.
		const visibilityHandler = document.addEventListener.mock.calls.find(
			([type]) => type === 'visibilitychange'
		)?.[1];
		expect(visibilityHandler).toBeTypeOf('function');
		visibilityHandler();
		await vi.advanceTimersByTimeAsync(1500);

		expect(emitted.filter((entry) => entry.event === 'net:change')).toHaveLength(1);
	});

	it('emits the profile without listeners when the connection API is missing', async () => {
		stubBrowser({ connection: undefined });
		const emitted = [];
		deviceProfile.startDeviceProfileTracking((event, props) => emitted.push({ event, props }));
		await vi.advanceTimersByTimeAsync(400);
		expect(emitted).toHaveLength(1);
		expect(emitted[0].event).toBe('device:profile');
		expect(emitted[0].props.type).toBe('unknown');
	});
});
