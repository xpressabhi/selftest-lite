import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let telemetry;

function installBrowserGlobals() {
	vi.stubGlobal('window', {
		location: { pathname: '/' },
		addEventListener: vi.fn(),
		innerHeight: 600,
		scrollY: 0,
		setInterval: () => 1,
		clearInterval: () => {},
	});
	vi.stubGlobal('navigator', { sendBeacon: undefined });
	vi.stubGlobal('document', {
		documentElement: { scrollHeight: 1200 },
		addEventListener: vi.fn(),
		visibilityState: 'visible',
	});
	vi.stubGlobal('crypto', { randomUUID: () => 'test-session' });
	vi.stubGlobal(
		'Blob',
		class Blob {
			constructor(parts, options) {
				this.parts = parts;
				this.options = options;
			}
		}
	);
}

function removeBrowserGlobals() {
	vi.unstubAllGlobals();
}

async function loadFreshModule() {
	vi.resetModules();
	telemetry = await import('./telemetry');
}

describe('client telemetry', () => {
	beforeEach(async () => {
		installBrowserGlobals();
		vi.useFakeTimers();
		await loadFreshModule();
	});

	afterEach(() => {
		vi.useRealTimers();
		removeBrowserGlobals();
		vi.restoreAllMocks();
	});

	it('track() no-ops without a window (SSR safety)', async () => {
		removeBrowserGlobals();
		vi.resetModules();
		const fresh = await import('./telemetry');
		expect(() => fresh.track('page:view')).not.toThrow();
	});

	it('flushTelemetry sends a batch and clears the queue', () => {
		const fetchMock = vi.fn(() => Promise.resolve());
		vi.stubGlobal('fetch', fetchMock);

		telemetry.track('page:view', { x: 1 });
		telemetry.track('test:answer', { q: 2 });
		telemetry.flushTelemetry();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, options] = fetchMock.mock.calls[0];
		expect(url).toBe('/api/telemetry');
		expect(options.method).toBe('POST');
		const body = JSON.parse(options.body);
		expect(body.sessionId).toBe('test-session');
		expect(body.events).toHaveLength(2);
		expect(body.events[0]).toMatchObject({ event: 'page:view', props: { x: 1 } });
		expect(body.events[1]).toMatchObject({ event: 'test:answer', page: '/' });
	});

	it('auto-flushes when the queue reaches 20 events', () => {
		const fetchMock = vi.fn(() => Promise.resolve());
		vi.stubGlobal('fetch', fetchMock);

		for (let i = 0; i < 19; i++) {
			telemetry.track('page:view');
		}
		expect(fetchMock).not.toHaveBeenCalled();
		telemetry.track('page:view');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('flushes on the interval started by startTelemetry', () => {
		const fetchMock = vi.fn(() => Promise.resolve());
		vi.stubGlobal('fetch', fetchMock);
		const fakeSetInterval = vi.fn((cb) => {
			globalThis.__intervalCb = cb;
			return 1;
		});
		globalThis.window.setInterval = fakeSetInterval;

		telemetry.startTelemetry();
		expect(fakeSetInterval).toHaveBeenCalled();

		telemetry.track('page:view');
		globalThis.__intervalCb();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('startTelemetry is idempotent', () => {
		const fakeSetInterval = vi.fn(() => 1);
		globalThis.window.setInterval = fakeSetInterval;
		telemetry.startTelemetry();
		telemetry.startTelemetry();
		expect(fakeSetInterval).toHaveBeenCalledTimes(1);
	});

	it('trackDebounced emits only the last value after the delay', () => {
		const fetchMock = vi.fn(() => Promise.resolve());
		vi.stubGlobal('fetch', fetchMock);

		telemetry.trackDebounced('search:keystroke', { q: 'a' });
		telemetry.trackDebounced('search:keystroke', { q: 'ab' });
		telemetry.trackDebounced('search:keystroke', { q: 'abc' });
		vi.advanceTimersByTime(799);
		expect(fetchMock).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		telemetry.flushTelemetry();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.events).toEqual([
			expect.objectContaining({ event: 'search:keystroke', props: { q: 'abc' } }),
		]);
	});

	it('handles sendBeacon when available', () => {
		const beaconMock = vi.fn(() => true);
		globalThis.navigator.sendBeacon = beaconMock;

		telemetry.track('page:view');
		telemetry.flushTelemetry();

		expect(beaconMock).toHaveBeenCalledTimes(1);
		expect(beaconMock.mock.calls[0][0]).toBe('/api/telemetry');
	});
});
